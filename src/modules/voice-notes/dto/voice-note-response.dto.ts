import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TranscriptSummaryDto } from '../../appointments/dto/appointment.dto';
import type {
    VoiceNoteSource,
    VoiceNoteStatus,
} from '../interfaces/voice-note-status.interface';

export class VoiceNoteUploadResponseDto {
    @ApiProperty()
    id: string;
    @ApiProperty()
    status: VoiceNoteStatus;
    @ApiProperty()
    audioUrl: string;
    @ApiProperty()
    source: VoiceNoteSource;
}

export class VoiceNoteRecordingMetadataDto {
    @ApiPropertyOptional()
    recordingDurationSeconds?: number;
    @ApiPropertyOptional()
    recordingDeviceType?: string;
    @ApiPropertyOptional()
    recordingPlatform?: string;
}

export class VoiceNoteDetailResponseDto {
    @ApiProperty()
    id: string;
    @ApiProperty()
    title: string;
    @ApiProperty()
    source: VoiceNoteSource;
    @ApiProperty()
    status: VoiceNoteStatus;
    @ApiProperty()
    audioUrl: string;
    @ApiPropertyOptional()
    transcript?: string;
    @ApiPropertyOptional()
    transcriptSummary?: TranscriptSummaryDto;
    @ApiPropertyOptional()
    recordingDurationSeconds?: number;
    @ApiPropertyOptional()
    recordingDeviceType?: string;
    @ApiPropertyOptional()
    recordingPlatform?: string;
    @ApiProperty()
    createdAt: Date;
}

export class VoiceNoteListItemDto {
    @ApiProperty()
    id: string;
    @ApiProperty()
    title: string;
    @ApiProperty()
    source: VoiceNoteSource;
    @ApiProperty()
    status: VoiceNoteStatus;
    @ApiProperty()
    audioUrl: string;
    @ApiPropertyOptional()
    recordingDurationSeconds?: number;
    @ApiPropertyOptional()
    recordingPlatform?: string;
    @ApiProperty()
    createdAt: Date;
    @ApiProperty()
    updatedAt: Date;
}
