import { TranscriptSummaryDto } from '../../appointments/dto/appointment.dto';
import { VoiceNoteStatus } from '../interfaces/voice-note-status.interface';

export class VoiceNoteUploadResponseDto {
    id: string;
    status: VoiceNoteStatus;
    audioUrl: string;
}

export class VoiceNoteDetailResponseDto {
    id: string;
    title: string;
    status: VoiceNoteStatus;
    audioUrl: string;
    transcript?: string;
    transcriptSummary?: TranscriptSummaryDto;
    createdAt: Date;
}

export class VoiceNoteListItemDto {
    id: string;
    title: string;
    status: VoiceNoteStatus;
    audioUrl: string;
    createdAt: Date;
    updatedAt: Date;
}
