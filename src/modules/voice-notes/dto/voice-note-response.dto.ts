import { TranscriptSummaryDto } from '../../appointments/dto/appointment.dto';
import {
    VoiceNoteSource,
    VoiceNoteStatus,
} from '../interfaces/voice-note-status.interface';

export class VoiceNoteUploadResponseDto {
    id: string;
    status: VoiceNoteStatus;
    audioUrl: string;
    source: VoiceNoteSource;
}

export class VoiceNoteRecordingMetadataDto {
    recordingDurationSeconds?: number;
    recordingDeviceType?: string;
    recordingPlatform?: string;
}

export class VoiceNoteDetailResponseDto {
    id: string;
    title: string;
    source: VoiceNoteSource;
    status: VoiceNoteStatus;
    audioUrl: string;
    transcript?: string;
    transcriptSummary?: TranscriptSummaryDto;
    recordingDurationSeconds?: number;
    recordingDeviceType?: string;
    recordingPlatform?: string;
    createdAt: Date;
}

export class VoiceNoteListItemDto {
    id: string;
    title: string;
    source: VoiceNoteSource;
    status: VoiceNoteStatus;
    audioUrl: string;
    recordingDurationSeconds?: number;
    recordingPlatform?: string;
    createdAt: Date;
    updatedAt: Date;
}
