import { ExtrasDocument } from '../schemas/extras.schema';
import { ExtrasResponseDto } from '../dto/extras.dto';

export const toExtrasResponseDto = (doc: ExtrasDocument | any): ExtrasResponseDto => {
    return {
        id: doc._id?.toString() || String(doc._id),
        userId: doc.userId?.toString() || String(doc.userId),
        roadMapId: doc.roadMapId?.toString() || String(doc.roadMapId),
        nestedRoadMapItemId: doc.nestedRoadMapItemId?.toString(),
        extras: doc.extras || [],
        uploadedDocuments: doc.uploadedDocuments || [],
        isResubmitted: doc.isResubmitted ?? false,
        submittedAt: doc.submittedAt ?? doc.createdAt ?? undefined,
        resubmittedAt: doc.resubmittedAt ?? undefined,
        submissionNumber: doc.submissionNumber ?? (doc.isResubmitted ? 2 : 1),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};
