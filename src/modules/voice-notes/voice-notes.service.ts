import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { S3Service } from '../s3/s3.service';
import { VoiceNote, VoiceNoteDocument } from './schemas/voice-note.schema';
import {
    VoiceNoteDetailResponseDto,
    VoiceNoteListItemDto,
    VoiceNoteUploadResponseDto,
} from './dto/voice-note-response.dto';
import {
    VoiceNoteSource,
    VoiceNoteStatus,
} from './interfaces/voice-note-status.interface';
import { CreateVoiceNoteDto } from './dto/create-voice-note.dto';
import {
    isAllowedAudioUpload,
    MAX_RECORDING_DURATION_SECONDS_PLACEHOLDER,
    normalizeMimeType,
    resolveAudioExtension,
} from './voice-note-audio.constants';
import { ConversationProcessingService } from '../conversation-processing/conversation-processing.service';

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

@Injectable()
export class VoiceNotesService {
    private readonly logger = new Logger(VoiceNotesService.name);

    constructor(
        @InjectModel(VoiceNote.name)
        private readonly voiceNoteModel: Model<VoiceNoteDocument>,
        private readonly s3Service: S3Service,
        private readonly conversationProcessingService: ConversationProcessingService,
    ) { }

    async upload(
        user: { userId: string },
        file: Express.Multer.File,
        dto: CreateVoiceNoteDto = {},
    ): Promise<VoiceNoteUploadResponseDto> {
        const source = this.resolveSource(dto.source);
        this.validateAudioFile(file, source, dto);
        this.logDurationPlaceholder(dto.recordingDurationSeconds, source);

        const userId = user.userId;
        const extension = resolveAudioExtension(file.mimetype, file.originalname);
        const timestamp = Date.now();
        const s3Key = `voice-notes/${userId}/${timestamp}.${extension}`;
        const normalizedMime = normalizeMimeType(file.mimetype) || file.mimetype;

        const audioUrl = await this.s3Service.uploadFile(
            s3Key,
            file.buffer,
            normalizedMime,
        );

        const note = await this.voiceNoteModel.create({
            userId: new Types.ObjectId(userId),
            title: titleFromDto(dto.title, source),
            source,
            audioUrl,
            audioMimeType: normalizedMime,
            fileSizeBytes: file.size,
            recordingDurationSeconds: dto.recordingDurationSeconds ?? null,
            recordingDeviceType: dto.recordingDeviceType?.trim() || null,
            recordingPlatform: dto.recordingPlatform?.trim() || null,
            status: 'pending',
        });

        this.logger.log(
            `Voice note created: id=${note._id}, source=${source}, platform=${dto.recordingPlatform ?? 'n/a'}, ` +
            `device=${dto.recordingDeviceType ?? 'n/a'}, duration=${dto.recordingDurationSeconds ?? 'n/a'}s, ` +
            `format=${normalizedMime}, extension=${extension}, size=${file.size}`,
        );

        void this.processVoiceNote(note._id.toString(), file.buffer).catch((error) => {
            this.logger.error(
                `Background processing failed for voice note ${note._id}: ${(error as Error)?.message ?? error}`,
            );
        });

        return {
            id: note._id.toString(),
            status: note.status as VoiceNoteStatus,
            audioUrl: note.audioUrl,
            source: note.source as VoiceNoteSource,
        };
    }

    async findById(userId: string, noteId: string): Promise<VoiceNoteDetailResponseDto> {
        const note = await this.findOwnedNote(userId, noteId);
        return this.toDetailDto(note);
    }

    async findAllForUser(userId: string): Promise<VoiceNoteListItemDto[]> {
        const notes = await this.voiceNoteModel
            .find({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        return notes.map((note) => this.toListItemDto(note));
    }

    async delete(userId: string, noteId: string): Promise<void> {
        const note = await this.findOwnedNote(userId, noteId);
        await this.voiceNoteModel.findByIdAndDelete(note._id).exec();
        this.logger.log(`Deleted voice note ${noteId} for user ${userId}`);
    }

    private async processVoiceNote(noteId: string, audioBuffer: Buffer): Promise<void> {
        const note = await this.voiceNoteModel.findById(noteId).exec();
        if (!note) {
            this.logger.warn(`Voice note ${noteId} not found for processing`);
            return;
        }

        try {
            await this.updateStatus(noteId, 'transcribing');

            const transcript = await this.conversationProcessingService.transcribeAudio({
                audioBuffer,
                mimeType: note.audioMimeType,
                originalFilename: `audio.${resolveAudioExtension(note.audioMimeType)}`,
            });
            const transcriptSavedAt = new Date();

            await this.voiceNoteModel.updateOne(
                { _id: note._id },
                {
                    $set: {
                        transcript,
                        transcriptSavedAt,
                        errorMessage: null,
                    },
                },
            );

            await this.updateStatus(noteId, 'summarizing');

            const summary = await this.conversationProcessingService.summarizeTranscript(transcript);
            const summarySavedAt = new Date();
            const model = this.conversationProcessingService.getSummaryModelName();

            await this.voiceNoteModel.updateOne(
                { _id: note._id },
                {
                    $set: {
                        transcriptSummary: summary,
                        transcriptSummarySavedAt: summarySavedAt,
                        transcriptSummaryModel: model,
                        status: 'completed',
                        errorMessage: null,
                    },
                },
            );

            this.logger.log(`Voice note ${noteId} processing completed`);
        } catch (error) {
            const message = (error as Error)?.message ?? String(error);
            this.logger.error(`Voice note ${noteId} processing failed: ${message}`);

            const current = await this.voiceNoteModel.findById(noteId).lean().exec();
            const hasTranscript = !!current?.transcript?.trim();

            await this.voiceNoteModel.updateOne(
                { _id: noteId },
                {
                    $set: {
                        status: 'failed',
                        errorMessage: message,
                    },
                },
            );

            if (hasTranscript) {
                this.logger.warn(
                    `Voice note ${noteId} failed after transcript was saved; transcript preserved`,
                );
            }
        }
    }

    private async updateStatus(noteId: string, status: string): Promise<void> {
        await this.voiceNoteModel.updateOne(
            { _id: noteId },
            { $set: { status } },
        );
    }

    private resolveSource(source?: string): VoiceNoteSource {
        return source === 'recording' ? 'recording' : 'upload';
    }

    private logDurationPlaceholder(
        recordingDurationSeconds: number | undefined,
        source: VoiceNoteSource,
    ): void {
        if (recordingDurationSeconds === undefined) {
            return;
        }

        if (recordingDurationSeconds > MAX_RECORDING_DURATION_SECONDS_PLACEHOLDER) {
            this.logger.warn(
                `Voice note ${source} reports duration ${recordingDurationSeconds}s ` +
                `(placeholder max ${MAX_RECORDING_DURATION_SECONDS_PLACEHOLDER}s; rejection not enabled)`,
            );
        }
    }

    private validateAudioFile(
        file: Express.Multer.File | undefined,
        source: VoiceNoteSource,
        dto: CreateVoiceNoteDto,
    ): void {
        if (!file) {
            throw new BadRequestException('Audio file is required');
        }

        const format = normalizeMimeType(file.mimetype) || file.mimetype || 'unknown';
        this.logger.log(
            `Voice note upload: source=${source}, platform=${dto.recordingPlatform ?? 'n/a'}, ` +
            `device=${dto.recordingDeviceType ?? 'n/a'}, duration=${dto.recordingDurationSeconds ?? 'n/a'}s, ` +
            `format=${format}, originalname="${file.originalname}", size=${file.size}`,
        );

        if (!isAllowedAudioUpload(file.mimetype, file.originalname)) {
            throw new BadRequestException(
                'Invalid audio format. Allowed: MP3, WAV, M4A, WebM, OGG, Opus, MP4, 3GP, and common mobile recordings',
            );
        }

        if (file.size > MAX_AUDIO_SIZE_BYTES) {
            throw new BadRequestException('Audio file exceeds 25MB limit');
        }

        if (!file.buffer?.length) {
            throw new BadRequestException('Audio file is empty');
        }
    }

    private async findOwnedNote(userId: string, noteId: string): Promise<VoiceNoteDocument> {
        const note = await this.voiceNoteModel.findById(noteId).exec();
        if (!note) {
            throw new NotFoundException(`Voice note with ID "${noteId}" not found`);
        }

        if (note.userId.toString() !== userId) {
            throw new NotFoundException(`Voice note with ID "${noteId}" not found`);
        }

        return note;
    }

    private toDetailDto(note: VoiceNoteDocument | Record<string, any>): VoiceNoteDetailResponseDto {
        return {
            id: note._id.toString(),
            title: note.title ?? '',
            source: (note.source ?? 'upload') as VoiceNoteSource,
            status: note.status as VoiceNoteStatus,
            audioUrl: note.audioUrl,
            transcript: note.transcript ?? undefined,
            transcriptSummary: note.transcriptSummary ?? undefined,
            recordingDurationSeconds: note.recordingDurationSeconds ?? undefined,
            recordingDeviceType: note.recordingDeviceType ?? undefined,
            recordingPlatform: note.recordingPlatform ?? undefined,
            createdAt: note.createdAt,
        };
    }

    private toListItemDto(note: Record<string, any>): VoiceNoteListItemDto {
        return {
            id: note._id.toString(),
            title: note.title ?? '',
            source: (note.source ?? 'upload') as VoiceNoteSource,
            status: note.status as VoiceNoteStatus,
            audioUrl: note.audioUrl,
            recordingDurationSeconds: note.recordingDurationSeconds ?? undefined,
            recordingPlatform: note.recordingPlatform ?? undefined,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
        };
    }
}

function titleFromDto(title: string | undefined, source: VoiceNoteSource): string {
    const trimmed = title?.trim();
    if (trimmed) {
        return trimmed;
    }
    return source === 'recording' ? 'Voice recording' : 'Untitled voice note';
}
