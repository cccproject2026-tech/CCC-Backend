import { IsString, IsNotEmpty, IsNumber, IsDate, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadDocumentDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fileType: string;

    @ApiProperty()
    @IsNumber()
    fileSize: number;

    @ApiPropertyOptional()
    @IsDate()
    @IsOptional()
    uploadedAt?: Date;
}

export class UserDocumentResponseDto {
    @ApiPropertyOptional()
    @IsMongoId()
    @IsOptional()
    docId?: string;

    @ApiProperty()
    @IsString()
    fileName: string;

    @ApiProperty()
    @IsString()
    fileUrl: string;

    @ApiProperty()
    @IsString()
    fileType: string;

    @ApiProperty()
    @IsNumber()
    fileSize: number;

    @ApiProperty()
    @IsDate()
    uploadedAt: Date;
}

export class DeleteDocumentDto {
    @ApiProperty()
    @IsMongoId()
    docId: string;
}
