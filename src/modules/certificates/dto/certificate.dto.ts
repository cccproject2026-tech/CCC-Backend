import { IsDateString, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IssueCertificateRequestDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @IsMongoId()
    @IsNotEmpty()
    issuedBy: string;

    @IsString()
    @IsNotEmpty()
    programName: string;

    @IsOptional()
    @IsDateString()
    completionDate?: string;

    @IsOptional()
    @IsString()
    personalMessage?: string;
}

export class CertificateResponseDto {
    certificateId: string;
    certificateUrl?: string | null;
    pdfUrl: string;
    issuedAt: Date;
    issuedByName: string;
    pastorName: string;
    mentorName?: string | null;
    programName: string;
    completionDate: Date;
}
