import { ExtrasDocumentDto } from './extras.dto';

export type SubmissionStatus =
    | 'submitted'
    | 'reviewed'
    | 'approved'
    | 'needs_revision'
    | 'resubmitted';

export class TaskSubmissionDto {
    _id: string;
    roadMapId: string;
    nestedRoadMapItemId?: string;
    submittedBy: string;
    submissionNumber: number;
    status: SubmissionStatus;
    responses: Record<string, any>[];
    uploadedDocuments?: ExtrasDocumentDto[];
    resubmittedFromSubmissionId?: string | null;
    submittedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
