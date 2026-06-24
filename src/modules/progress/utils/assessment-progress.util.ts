import { Types } from 'mongoose';
import { PROGRESS_STATUSES } from '../../../common/constants/status.constants';

export type AnswerSectionSlice = {
    sectionId?: Types.ObjectId | string;
    layers?: unknown[];
};

/** Matches save/submit paths: count answer rows that have at least one layer response. */
export function countCompletedAnswerSections(
    sections?: AnswerSectionSlice[] | null,
): number {
    if (!sections?.length) {
        return 0;
    }

    return sections.filter(
        (section) => Array.isArray(section.layers) && section.layers.length > 0,
    ).length;
}

export function resolveAssessmentTotalSections(
    templateSectionCount?: number | null,
    storedTotalSections?: number | null,
): number {
    if (typeof templateSectionCount === 'number' && templateSectionCount >= 0) {
        return templateSectionCount;
    }
    return storedTotalSections ?? 0;
}

export function deriveCompletedSectionsForProgress(
    answerSections: AnswerSectionSlice[] | null | undefined,
    storedCompletedSections?: number | null,
): number {
    const fromAnswers = countCompletedAnswerSections(answerSections);
    if (fromAnswers > 0) {
        return fromAnswers;
    }
    return storedCompletedSections ?? 0;
}

export function assessmentProgressNeedsUpdate(
    entry: {
        assessmentId: Types.ObjectId | string;
        completedSections?: number;
        totalSections?: number;
    },
    templateSectionCount: number,
    answerSections?: AnswerSectionSlice[] | null,
): {
    completedSections: number;
    totalSections: number;
    changed: boolean;
} {
    const completedSections = deriveCompletedSectionsForProgress(
        answerSections,
        entry.completedSections,
    );
    const totalSections = resolveAssessmentTotalSections(
        templateSectionCount,
        entry.totalSections,
    );

    const changed =
        completedSections !== (entry.completedSections ?? 0) ||
        totalSections !== (entry.totalSections ?? 0);

    return { completedSections, totalSections, changed };
}

export function isOrphanAssessmentEntry(
    assessmentId: Types.ObjectId | string,
    existingAssessmentIds: Set<string>,
): boolean {
    return !existingAssessmentIds.has(assessmentId.toString());
}

/** Pure helper for tests — mirrors calculateProgress assessment branch. */
export function computeOverallProgressFromBuckets(
    overallRoadmapProgress: number,
    overallAssessmentProgress: number,
    totalRoadmaps: number,
    totalAssessments: number,
): number {
    const totalItems = totalRoadmaps + totalAssessments;
    if (totalItems <= 0) {
        return 0;
    }

    const roadmapWeight = totalRoadmaps / totalItems;
    const assessmentWeight = totalAssessments / totalItems;

    return parseFloat(
        (
            (overallRoadmapProgress * roadmapWeight) +
            (overallAssessmentProgress * assessmentWeight)
        ).toFixed(2),
    );
}

export { PROGRESS_STATUSES };
