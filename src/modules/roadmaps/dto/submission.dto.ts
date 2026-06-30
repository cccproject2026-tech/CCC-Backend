import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExtrasDocumentDto } from './extras.dto';

export type SubmissionStatus =
    | 'submitted'
    | 'reviewed'
    | 'approved'
    | 'needs_revision'
    | 'resubmitted';

export class TaskSubmissionDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    roadMapId: string;
    @ApiPropertyOptional()
    nestedRoadMapItemId?: string;
    @ApiProperty()
    submittedBy: string;
    @ApiProperty()
    submissionNumber: number;
    @ApiProperty({ enum: ['submitted', 'reviewed', 'approved', 'needs_revision', 'resubmitted'] })
    status: SubmissionStatus;
    @ApiProperty({ type: 'array', items: { type: 'object' } })
    responses: Record<string, any>[];
    @ApiPropertyOptional({ type: [ExtrasDocumentDto] })
    uploadedDocuments?: ExtrasDocumentDto[];
    @ApiPropertyOptional({ nullable: true })
    resubmittedFromSubmissionId?: string | null;
    @ApiProperty()
    submittedAt: Date;
    @ApiProperty()
    createdAt: Date;
    @ApiProperty()
    updatedAt: Date;
}
