import { IsDateString, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueCertificateRequestDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    issuedBy: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    programName: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    completionDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    personalMessage?: string;
}

export class CertificateResponseDto {
    @ApiProperty()
    certificateId: string;
    @ApiPropertyOptional()
    certificateUrl?: string | null;
    @ApiProperty()
    pdfUrl: string;
    @ApiProperty()
    pastorName: string;
    @ApiPropertyOptional()
    mentorName?: string | null;
    @ApiProperty()
    directorName: string;
    @ApiProperty()
    programName: string;
    @ApiProperty()
    completionDate: Date;
    @ApiProperty()
    issuedAt: Date;
    @ApiPropertyOptional()
    personalMessage?: string | null;
}
