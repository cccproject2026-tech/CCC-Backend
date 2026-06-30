import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNoteDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    content: string;
}

export class UpdateNoteDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    content: string;
}

export class NoteResponseDto {
    @ApiProperty()
    _id: string;

    @ApiProperty()
    content: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
