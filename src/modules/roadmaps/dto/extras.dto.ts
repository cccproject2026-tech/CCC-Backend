import { IsString, IsArray, IsOptional, IsObject, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExtrasDto {
    @ApiProperty()
    @IsString()
    userId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    nestedRoadMapItemId?: string;

    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    @IsOptional()
    @IsArray()
    @IsObject({ each: true })
    @Type(() => Object)
    extras?: Record<string, any>[];
}

export class UpdateExtrasDto {
    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    @IsOptional()
    @IsArray()
    @IsObject({ each: true })
    @Type(() => Object)
    extras?: Record<string, any>[];
}

export class FileDataDto {
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
}

export class ExtrasDocumentDto {
    @ApiProperty()
    @IsString()
    uploadBatchId: string;

    @ApiProperty()
    @IsDate()
    uploadedAt: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    historyVersion?: number;

    @ApiProperty({ type: [FileDataDto] })
    @IsArray()
    @Type(() => FileDataDto)
    files: FileDataDto[];
}

export class ExtrasResponseDto {
    @ApiProperty()
    id: string;
    @ApiProperty()
    userId: string;
    @ApiProperty()
    roadMapId: string;
    @ApiPropertyOptional()
    nestedRoadMapItemId?: string;
    @ApiProperty({ type: 'array', items: { type: 'object' } })
    extras: Record<string, any>[];
    @ApiPropertyOptional({ type: [ExtrasDocumentDto] })
    uploadedDocuments?: ExtrasDocumentDto[];
    @ApiPropertyOptional()
    isResubmitted?: boolean;
    @ApiPropertyOptional()
    submittedAt?: Date;
    @ApiPropertyOptional()
    resubmittedAt?: Date;
    @ApiPropertyOptional()
    submissionNumber?: number;
    @ApiProperty()
    createdAt: Date;
    @ApiProperty()
    updatedAt: Date;
}

/** Mentor Review Center: roadmap / nested-task submission activity for one pastor. */
export class RoadmapSubmissionActivityDto {
    @ApiProperty()
    submissionId: string;
    @ApiProperty()
    userId: string;
    @ApiProperty()
    roadMapId: string;
    @ApiPropertyOptional()
    nestedRoadMapItemId?: string;
    @ApiProperty()
    parentRoadmapName: string;
    @ApiProperty()
    taskName: string;
    @ApiProperty()
    submittedAt: Date;
    @ApiPropertyOptional({ nullable: true })
    resubmittedAt?: Date | null;
    @ApiProperty()
    isResubmission: boolean;
    @ApiProperty()
    submissionNumber: number;
    @ApiProperty({ enum: ['submitted', 'resubmitted'] })
    status: 'submitted' | 'resubmitted';
}
