import { Transform } from 'class-transformer';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { VOICE_NOTE_SOURCES } from '../interfaces/voice-note-status.interface';

export class CreateVoiceNoteDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @IsOptional()
    @IsIn(VOICE_NOTE_SOURCES)
    source?: (typeof VOICE_NOTE_SOURCES)[number];

    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    })
    @IsNumber()
    @Min(0)
    @Max(86400)
    recordingDurationSeconds?: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    recordingDeviceType?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    recordingPlatform?: string;
}
