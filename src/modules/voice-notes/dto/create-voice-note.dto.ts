import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVoiceNoteDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;
}
