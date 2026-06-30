/**
 * Mentor Review Center aggregated response contract.
 *
 * `ReviewItemDto` is a 1:1 mirror of the frontend `ReviewItem` interface
 * (lib/mentor/reviewCenter.types.ts). The client overlays `isSeen` from
 * AsyncStorage, so the server always returns `isSeen: false`.
 */

export type ReviewStatus =
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'REVIEWED'
    | 'RESUBMITTED'
    | 'APPROVED';

export type ReviewItemType = 'roadmap' | 'assessment';

export type ReviewCategory =
    | 'pending_review'
    | 'reviewed'
    | 'resubmitted'
    | 'not_started';

export class ReviewItemDto {
    id: string;
    type: ReviewItemType;
    pastorId: string;
    pastorName: string;
    title: string;
    status: ReviewStatus;
    category: ReviewCategory;
    submittedAt: string | null;
    resubmissionCount: number;
    isSeen: boolean;
    roadmapId?: string;
    roadmapName?: string;
    nestedRoadMapItemId?: string;
    assessmentId?: string;
    taskName?: string;
}

/** Lightweight pastor metadata so the client can render avatars without a per-mentee fetch. */
export class ReviewPastorMetaDto {
    pastorId: string;
    pastorName: string;
    profilePicture?: string | null;
}

export class MentorReviewCenterResponseDto {
    items: ReviewItemDto[];
    pastors: ReviewPastorMetaDto[];
    /** Server-side generation time in ms (for old-vs-new performance comparison). */
    generatedInMs: number;
    /** True when this payload was served from the in-memory cache. */
    cached: boolean;
}
