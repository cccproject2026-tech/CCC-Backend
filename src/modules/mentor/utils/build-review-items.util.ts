import { buildTaskSubmissionsFromExtras } from '../../roadmaps/utils/submission-history.util';
import {
    ReviewCategory,
    ReviewItemDto,
    ReviewStatus,
} from '../dto/review-center.dto';

/**
 * Status / category mapping — kept byte-for-byte equivalent to the frontend
 * helpers in `lib/mentor/reviewCenter.types.ts` so the aggregated endpoint
 * produces the exact same review semantics as the legacy client-side scan.
 */
export function mapSubmissionStatusToReview(
    status: string | undefined | null,
): ReviewStatus {
    if (!status) return 'NOT_STARTED';
    const s = status.toLowerCase().replace(/[\s_-]/g, '');
    switch (s) {
        case 'submitted':
            return 'SUBMITTED';
        case 'reviewed':
            return 'REVIEWED';
        case 'approved':
            return 'APPROVED';
        case 'needsrevision':
            return 'SUBMITTED';
        case 'resubmitted':
            return 'RESUBMITTED';
        case 'inprogress':
            return 'IN_PROGRESS';
        default:
            return 'NOT_STARTED';
    }
}

export function getReviewCategory(status: ReviewStatus): ReviewCategory {
    switch (status) {
        case 'SUBMITTED':
            return 'pending_review';
        case 'REVIEWED':
        case 'APPROVED':
            return 'reviewed';
        case 'RESUBMITTED':
            return 'resubmitted';
        case 'NOT_STARTED':
        case 'IN_PROGRESS':
        default:
            return 'not_started';
    }
}

function toIso(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface RoadmapTaskMeta {
    id: string;
    name: string;
}

export interface RoadmapMeta {
    name: string;
    tasks: RoadmapTaskMeta[];
}

export interface BuildReviewItemsInput {
    pastors: { pastorId: string; pastorName: string }[];
    /** Assigned roadmap ids per pastor, already capped/ordered like the legacy scan. */
    assignedRoadmapIdsByPastor: Map<string, string[]>;
    /** Assigned assessment ids per pastor, already capped/ordered like the legacy scan. */
    assignedAssessmentIdsByPastor: Map<string, string[]>;
    roadmapMetaById: Map<string, RoadmapMeta>;
    /** Extras docs keyed by `${pastorId}:${roadmapId}`. */
    extrasByPastorRoadmap: Map<string, any[]>;
    assessmentNameById: Map<string, string>;
    /** UserAnswer docs keyed by `${pastorId}:${assessmentId}`. */
    answersByPastorAssessment: Map<string, any>;
}

function buildRoadmapItems(
    pastorId: string,
    pastorName: string,
    roadmapId: string,
    meta: RoadmapMeta,
    extrasDocs: any[],
): ReviewItemDto[] {
    const items: ReviewItemDto[] = [];
    const tasks = meta.tasks ?? [];
    const roadmapName = meta.name ?? 'Roadmap';

    // Latest submission per nested task, derived from the same util the
    // per-task submissions endpoint uses (single source of truth).
    const latestByTask = new Map<string, ReturnType<typeof buildTaskSubmissionsFromExtras>[number]>();
    for (const doc of extrasDocs) {
        const taskId = doc?.nestedRoadMapItemId
            ? String(doc.nestedRoadMapItemId)
            : null;
        if (!taskId) continue; // parent-level extras have no reviewable task target
        const subs = buildTaskSubmissionsFromExtras(doc);
        if (subs.length === 0) continue;
        const latest = subs.reduce((acc, cur) =>
            cur.submissionNumber > acc.submissionNumber ? cur : acc,
        );
        const existing = latestByTask.get(taskId);
        if (!existing || latest.submissionNumber > existing.submissionNumber) {
            latestByTask.set(taskId, latest);
        }
    }

    if (latestByTask.size > 0) {
        for (const [taskId, sub] of latestByTask) {
            const taskMeta = tasks.find((t) => t.id === taskId);
            const reviewStatus = mapSubmissionStatusToReview(sub.status);
            const category = getReviewCategory(reviewStatus);
            items.push({
                id: `roadmap-${roadmapId}-${taskId}-${pastorId}`,
                type: 'roadmap',
                pastorId,
                pastorName,
                title: taskMeta?.name ?? 'Task',
                status: reviewStatus,
                category,
                submittedAt: toIso(sub.submittedAt) ?? toIso(sub.createdAt),
                resubmissionCount: Math.max(0, sub.submissionNumber - 1),
                isSeen: false,
                roadmapId,
                roadmapName,
                nestedRoadMapItemId: taskId,
                taskName: taskMeta?.name,
            });
        }
        return items;
    }

    // No submissions anywhere for this roadmap → every task is NOT_STARTED,
    // mirroring the legacy client fallback path.
    if (extrasDocs.length === 0) {
        for (const task of tasks) {
            items.push({
                id: `roadmap-${roadmapId}-${task.id}-${pastorId}`,
                type: 'roadmap',
                pastorId,
                pastorName,
                title: task.name,
                status: 'NOT_STARTED',
                category: 'not_started',
                submittedAt: null,
                resubmissionCount: 0,
                isSeen: false,
                roadmapId,
                roadmapName,
                nestedRoadMapItemId: task.id,
                taskName: task.name,
            });
        }
    }

    return items;
}

function buildAssessmentItem(
    pastorId: string,
    pastorName: string,
    assessmentId: string,
    title: string,
    answer: any | undefined,
): ReviewItemDto {
    const baseId = `assessment-${assessmentId}-${pastorId}`;
    const notStarted: ReviewItemDto = {
        id: baseId,
        type: 'assessment',
        pastorId,
        pastorName,
        title,
        status: 'NOT_STARTED',
        category: 'not_started',
        submittedAt: null,
        resubmissionCount: 0,
        isSeen: false,
        assessmentId,
    };

    if (!answer) return notStarted;

    const hasSections = Array.isArray(answer.sections) && answer.sections.length > 0;
    const hasPreSurvey = !!answer.preSurveySubmittedAt;
    if (!hasSections && !hasPreSurvey) return notStarted;

    const isReviewed = answer.recommendationsSentByMentor === true;
    const reviewStatus: ReviewStatus = isReviewed ? 'REVIEWED' : 'SUBMITTED';

    return {
        id: baseId,
        type: 'assessment',
        pastorId,
        pastorName,
        title,
        status: reviewStatus,
        category: getReviewCategory(reviewStatus),
        submittedAt: toIso(answer.preSurveySubmittedAt) ?? toIso(answer.createdAt),
        resubmissionCount: 0,
        isSeen: false,
        assessmentId,
    };
}

/** Build the full Review Center item list for a mentor, matching the legacy scan output. */
export function buildReviewItemsForMentor(
    input: BuildReviewItemsInput,
): ReviewItemDto[] {
    const items: ReviewItemDto[] = [];

    for (const { pastorId, pastorName } of input.pastors) {
        const roadmapIds = input.assignedRoadmapIdsByPastor.get(pastorId) ?? [];
        for (const roadmapId of roadmapIds) {
            const meta = input.roadmapMetaById.get(roadmapId);
            if (!meta) continue;
            const extrasDocs =
                input.extrasByPastorRoadmap.get(`${pastorId}:${roadmapId}`) ?? [];
            items.push(
                ...buildRoadmapItems(pastorId, pastorName, roadmapId, meta, extrasDocs),
            );
        }

        const assessmentIds = input.assignedAssessmentIdsByPastor.get(pastorId) ?? [];
        for (const assessmentId of assessmentIds) {
            const title = input.assessmentNameById.get(assessmentId) ?? 'Assessment';
            const answer = input.answersByPastorAssessment.get(
                `${pastorId}:${assessmentId}`,
            );
            items.push(
                buildAssessmentItem(pastorId, pastorName, assessmentId, title, answer),
            );
        }
    }

    return items;
}
