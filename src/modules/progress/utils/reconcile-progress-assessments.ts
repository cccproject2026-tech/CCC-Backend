import { Types } from 'mongoose';
import {
    assessmentProgressNeedsUpdate,
    AnswerSectionSlice,
    deriveAssessmentProgressFromAnswers,
    isOrphanAssessmentEntry,
    PROGRESS_STATUSES,
    resolveAssessmentTotalSections,
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
        const totalSections = resolveAssessmentTotalSections(
            templateSectionCount,
            entry.totalSections,
        );

        if (answerSections?.length) {
            const derived = deriveAssessmentProgressFromAnswers(
                answerSections,
                totalSections,
            );
            const updated = {
                ...entry,
                completedSections: derived.completedSections,
                totalSections,
                progressPercentage: derived.progressPercentage,
                status: derived.status,
            };
            const entryChanged =
                updated.completedSections !== (entry.completedSections ?? 0) ||
                updated.totalSections !== (entry.totalSections ?? 0) ||
                updated.progressPercentage !== (entry.progressPercentage ?? 0) ||
                updated.status !== (entry.status ?? PROGRESS_STATUSES.NOT_STARTED);

            if (entryChanged) {
                updatedAssessmentIds.push(id);
                changed = true;
            }

            return updated;
        }

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
                progressPercentage: next.progressPercentage,
                status: next.status,
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
