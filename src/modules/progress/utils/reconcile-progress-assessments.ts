import { Types } from 'mongoose';
import {
    assessmentProgressNeedsUpdate,
    AnswerSectionSlice,
    isOrphanAssessmentEntry,
} from './assessment-progress.util';

export type ProgressAssessmentEntry = {
    assessmentId: Types.ObjectId;
    completedSections: number;
    totalSections: number;
    progressPercentage: number;
    status: string;
};

export type ReconcileProgressAssessmentsInput = {
    assessments: ProgressAssessmentEntry[];
    existingAssessmentIds: Set<string>;
    templateSectionCountByAssessmentId: Map<string, number>;
    answerSectionsByAssessmentId: Map<string, AnswerSectionSlice[] | undefined>;
};

export type ReconcileProgressAssessmentsResult = {
    assessments: ProgressAssessmentEntry[];
    removedOrphanIds: string[];
    updatedAssessmentIds: string[];
    changed: boolean;
};

/** Drop deleted assessments and align section counts with templates + saved answers. */
export function reconcileProgressAssessments(
    input: ReconcileProgressAssessmentsInput,
): ReconcileProgressAssessmentsResult {
    const removedOrphanIds: string[] = [];
    const updatedAssessmentIds: string[] = [];

    const kept = input.assessments.filter((entry) => {
        const id = entry.assessmentId.toString();
        if (isOrphanAssessmentEntry(entry.assessmentId, input.existingAssessmentIds)) {
            removedOrphanIds.push(id);
            return false;
        }
        return true;
    });

    let changed = removedOrphanIds.length > 0;

    const assessments = kept.map((entry) => {
        const id = entry.assessmentId.toString();
        const templateSectionCount =
            input.templateSectionCountByAssessmentId.get(id) ?? entry.totalSections ?? 0;
        const answerSections = input.answerSectionsByAssessmentId.get(id);
        const next = assessmentProgressNeedsUpdate(
            entry,
            templateSectionCount,
            answerSections,
        );

        if (next.changed) {
            updatedAssessmentIds.push(id);
            changed = true;
            return {
                ...entry,
                completedSections: next.completedSections,
                totalSections: next.totalSections,
            };
        }

        return entry;
    });

    return {
        assessments,
        removedOrphanIds,
        updatedAssessmentIds,
        changed,
    };
}
