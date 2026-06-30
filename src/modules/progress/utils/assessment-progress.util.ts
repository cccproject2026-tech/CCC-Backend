import { Types } from 'mongoose';
import { PROGRESS_STATUSES } from '../../../common/constants/status.constants';

export type AnswerSectionSlice = {
    sectionId?: Types.ObjectId | string;
    layers?: unknown[];
    recommendations?: string[];
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

export function hasMentorCdpInAnswerSections(
    sections?: AnswerSectionSlice[] | null,
): boolean {
    return !!sections?.some(
        (section) =>
            Array.isArray(section.recommendations) && section.recommendations.length > 0,
    );
}

export function isPastorAssessmentFullySubmitted(
    sections: AnswerSectionSlice[] | null | undefined,
    totalSections: number,
): boolean {
    if (totalSections <= 0) {
        return false;
    }
    return countCompletedAnswerSections(sections) >= totalSections;
}

/**
 * Pastor submit ≠ programme complete. Credit 100% only after mentor sends CDP.
 * Submitted (all sections, no CDP) contributes 0% to overall assessment progress.
 */
export function deriveAssessmentProgressFromAnswers(
    answerSections: AnswerSectionSlice[] | null | undefined,
    totalSections: number,
): {
    completedSections: number;
    progressPercentage: number;
    status: string;
} {
    const total = totalSections > 0 ? totalSections : 0;
    const completedSections = countCompletedAnswerSections(answerSections);

    if (hasMentorCdpInAnswerSections(answerSections)) {
        return {
            completedSections: total > 0 ? total : completedSections,
            progressPercentage: 100,
            status: PROGRESS_STATUSES.COMPLETED,
        };
    }

    if (total > 0 && isPastorAssessmentFullySubmitted(answerSections, total)) {
        return {
            completedSections,
            progressPercentage: 0,
            status: PROGRESS_STATUSES.SUBMITTED,
        };
    }

    if (completedSections > 0 && total > 0) {
        const progressPercentage = parseFloat(
            Math.min((completedSections / total) * 100, 99).toFixed(2),
        );
        return {
            completedSections,
            progressPercentage,
            status: PROGRESS_STATUSES.IN_PROGRESS,
        };
    }

    return {
        completedSections,
        progressPercentage: 0,
        status: PROGRESS_STATUSES.NOT_STARTED,
    };
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
        progressPercentage?: number;
        status?: string;
    },
    templateSectionCount: number,
    answerSections?: AnswerSectionSlice[] | null,
): {
    completedSections: number;
    totalSections: number;
    progressPercentage: number;
    status: string;
    changed: boolean;
} {
    const totalSections = resolveAssessmentTotalSections(
        templateSectionCount,
        entry.totalSections,
    );

    if (!answerSections?.length) {
        return {
            completedSections: entry.completedSections ?? 0,
            totalSections,
            progressPercentage: entry.progressPercentage ?? 0,
            status: entry.status ?? PROGRESS_STATUSES.NOT_STARTED,
            changed: totalSections !== (entry.totalSections ?? 0),
        };
    }

    const derived = deriveAssessmentProgressFromAnswers(answerSections, totalSections);

    const changed =
        derived.completedSections !== (entry.completedSections ?? 0) ||
        totalSections !== (entry.totalSections ?? 0) ||
        derived.progressPercentage !== (entry.progressPercentage ?? 0) ||
        derived.status !== (entry.status ?? PROGRESS_STATUSES.NOT_STARTED);

    return {
        ...derived,
        totalSections,
        changed,
    };
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
