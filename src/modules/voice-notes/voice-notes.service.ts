import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { S3Service } from '../s3/s3.service';
import { TranscriptSummaryService } from '../appointments/transcript-summary.service';
import { VoiceNote, VoiceNoteDocument } from './schemas/voice-note.schema';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import {
    VoiceNoteDetailResponseDto,
    VoiceNoteListItemDto,
    VoiceNoteUploadResponseDto,
} from './dto/voice-note-response.dto';
import { VoiceNoteStatus } from './interfaces/voice-note-status.interface';

const ALLOWED_AUDIO_MIME_TYPES = [
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
] as const;

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

const MIME_TO_EXTENSION: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'mp4',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-m4a': 'm4a',
};

@Injectable()
export class VoiceNotesService {
    private readonly logger = new Logger(VoiceNotesService.name);

    constructor(
        @InjectModel(VoiceNote.name)
        private readonly voiceNoteModel: Model<VoiceNoteDocument>,
        private readonly s3Service: S3Service,
        private readonly whisperTranscriptionService: WhisperTranscriptionService,
        private readonly transcriptSummaryService: TranscriptSummaryService,
    ) { }

    async upload(
        user: { userId: string },
        file: Express.Multer.File,
        title?: string,
    ): Promise<VoiceNoteUploadResponseDto> {
        this.validateAudioFile(file);

        const userId = user.userId;
        const extension = MIME_TO_EXTENSION[file.mimetype] ?? 'bin';
        const timestamp = Date.now();
        const s3Key = `voice-notes/${userId}/${timestamp}.${extension}`;

        const audioUrl = await this.s3Service.uploadFile(
            s3Key,
            file.buffer,
            file.mimetype,
        );

        const note = await this.voiceNoteModel.create({
            userId: new Types.ObjectId(userId),
            title: title?.trim() || 'Untitled voice note',
            source: 'upload',
            audioUrl,
            audioMimeType: file.mimetype,
            fileSizeBytes: file.size,
            status: 'pending',
        });

        void this.processVoiceNote(note._id.toString(), file.buffer).catch((error) => {
            this.logger.error(
                `Background processing failed for voice note ${note._id}: ${(error as Error)?.message ?? error}`,
            );
        });

        return {
            id: note._id.toString(),
            status: note.status as VoiceNoteStatus,
            audioUrl: note.audioUrl,
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

            const transcript = await this.whisperTranscriptionService.transcribeAudio(
                audioBuffer,
                note.audioMimeType,
            );
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

            const summary = await this.transcriptSummaryService.summarizeTranscript(transcript);
            const summarySavedAt = new Date();
            const model = this.transcriptSummaryService.modelName;

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

    private validateAudioFile(file: Express.Multer.File | undefined): void {
        if (!file) {
            throw new BadRequestException('Audio file is required');
        }

        if (!ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_AUDIO_MIME_TYPES)[number])) {
            throw new BadRequestException(
                'Invalid audio format. Allowed: MPEG, MP4, WAV, WebM, M4A',
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
            status: note.status as VoiceNoteStatus,
            audioUrl: note.audioUrl,
            transcript: note.transcript ?? undefined,
            transcriptSummary: note.transcriptSummary ?? undefined,
            createdAt: note.createdAt,
        };
    }

    private toListItemDto(note: Record<string, any>): VoiceNoteListItemDto {
        return {
            id: note._id.toString(),
            title: note.title ?? '',
            status: note.status as VoiceNoteStatus,
            audioUrl: note.audioUrl,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
        };
    }
}
