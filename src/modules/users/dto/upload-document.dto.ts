import { IsString, IsNotEmpty, IsNumber, IsDate, IsOptional, IsMongoId } from 'class-validator';

export class UploadDocumentDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @IsString()
    @IsNotEmpty()
    fileType: string;

    @IsNumber()
    fileSize: number;

    @IsDate()
    @IsOptional()
    uploadedAt?: Date;
}

export class UserDocumentResponseDto {
    @IsMongoId()
    @IsOptional()
    docId?: string;

    @IsString()
    fileName: string;

    @IsString()
    fileUrl: string;

    @IsString()
    fileType: string;

    @IsNumber()
    fileSize: number;

    @IsDate()
    uploadedAt: Date;
}

export class DeleteDocumentDto {
    @IsMongoId()
    docId: string;
}
