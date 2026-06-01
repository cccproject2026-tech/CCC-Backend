import { IsString, IsArray, IsOptional, IsObject, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExtrasDto {
    @IsString()
    userId: string;

    @IsOptional()
    @IsString()
    nestedRoadMapItemId?: string;

    @IsOptional()
    @IsArray()
    @IsObject({ each: true })
    @Type(() => Object)
    extras?: Record<string, any>[];
}

export class UpdateExtrasDto {
    @IsOptional()
    @IsArray()
    @IsObject({ each: true })
    @Type(() => Object)
    extras?: Record<string, any>[];
}

export class FileDataDto {
    @IsString()
    fileName: string;

    @IsString()
    fileUrl: string;

    @IsString()
    fileType: string;

    @IsNumber()
    fileSize: number;
}

export class ExtrasDocumentDto {
    @IsString()
    uploadBatchId: string;

    @IsDate()
    uploadedAt: Date;

    @IsOptional()
    @IsString()
    name?: string;

    @IsArray()
    @Type(() => FileDataDto)
    files: FileDataDto[];
}

export class ExtrasResponseDto {
    id: string;
    userId: string;
    roadMapId: string;
    nestedRoadMapItemId?: string;
    extras: Record<string, any>[];
    uploadedDocuments?: ExtrasDocumentDto[];
    isResubmitted?: boolean;
    submittedAt?: Date;
    resubmittedAt?: Date;
    submissionNumber?: number;
    createdAt: Date;
    updatedAt: Date;
}

/** Mentor Review Center: roadmap / nested-task submission activity for one pastor. */
export class RoadmapSubmissionActivityDto {
    submissionId: string;
    userId: string;
    roadMapId: string;
    nestedRoadMapItemId?: string;
    parentRoadmapName: string;
    taskName: string;
    submittedAt: Date;
    resubmittedAt?: Date | null;
    isResubmission: boolean;
    submissionNumber: number;
    status: 'submitted' | 'resubmitted';
}
