import { Types } from 'mongoose';
import { PROGRESS_STATUSES } from '../../../common/constants/status.constants';
import { countCompletedAnswerSections } from './assessment-progress.util';

export type ProgressAssessmentEntry = {
    assessmentId: Types.ObjectId;
    completedSections: number;
    totalSections: number;
    progressPercentage: number;
    status: string;
};

type AssessmentTemplateSlice = {
    _id: Types.ObjectId;
    sections?: unknown[] | null;
};

type AnswerDocSlice = {
    assessmentId: Types.ObjectId;
    sections?: { layers?: unknown[] }[] | null;
};

export function collectAssignedAssessmentIds(
    assignedRows: { assessmentId: Types.ObjectId }[],
    embeddedAssessments: { _id: Types.ObjectId }[],
): string[] {
    const ids = new Set<string>();
    for (const row of assignedRows) {
        ids.add(row.assessmentId.toString());
    }
    for (const doc of embeddedAssessments) {
        ids.add(doc._id.toString());
    }
    return [...ids];
}

export function findMissingAssessmentIds(
    assignedIds: string[],
    existingProgressAssessmentIds: string[],
): string[] {
    const existing = new Set(existingProgressAssessmentIds);
    return assignedIds.filter((id) => !existing.has(id));
}

export function buildAssessmentProgressEntries(
    templates: AssessmentTemplateSlice[],
    answerDocs: AnswerDocSlice[],
): ProgressAssessmentEntry[] {
    const completedSectionsByAssessmentId = new Map(
        answerDocs.map((doc) => [
            doc.assessmentId.toString(),
            countCompletedAnswerSections(doc.sections),
        ]),
    );

    return templates.map((template) => {
        const id = template._id.toString();
        const totalSections = template.sections?.length ?? 0;
        const completedSections = completedSectionsByAssessmentId.get(id) ?? 0;

        return {
            assessmentId: template._id,
            completedSections,
            totalSections,
            progressPercentage: 0,
            status: PROGRESS_STATUSES.NOT_STARTED,
        };
    });
}
