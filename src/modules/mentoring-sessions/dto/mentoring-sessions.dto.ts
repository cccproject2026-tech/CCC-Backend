import { IsMongoId, IsOptional, IsString } from 'class-validator';

/** Public user snippet shared across mentoring session payloads */
export interface MentoringUserPreview {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    profilePicture?: string | null;
}

/** Pending / recent reschedule request surfaced on session rows */
export interface MentoringRescheduleRequestSnippet {
    id: string;
    status: string;
    reason?: string;
    createdAt?: Date;
}

/**
 * Canonical session row shape returned on pastor lists, mentor grouped lists,
 * session detail, and reschedule/complete payloads.
 */
export interface UnifiedMentoringSessionDto {
    id: string;
    sessionNumber: number;
    title: string;
    status: string;
    scheduledDate: Date | string | null;
    pastorId: string;
    mentorId: string | null;
    pastor: MentoringUserPreview | null;
    mentor: MentoringUserPreview | null;
    appointmentId: string | null;
    platform: string | null;
    meetingLink: string | null;
    transcriptSummary: AppointmentTranscriptSummary | null;
    aiTranscript: string | null;
    mentorNote: string | null;
    pastorNote: string | null;
    rescheduleRequest: MentoringRescheduleRequestSnippet | null;
}

/** Subset of `Appointment.transcriptSummary` typing for API payloads */
export type AppointmentTranscriptSummary = {
    sessionOverview?: string | null;
    keyDiscussionPoints?: string[];
    mentorGuidance?: string[];
    actionItems?: string[];
    followUp?: string | null;
};

/**
 * Director dashboard: exactly one row per accepted pastor journey (no full session arrays).
 * Use `nextSession` for drill-down matching `UnifiedMentoringSessionDto`.
 */
export interface DirectorPastorJourneyDto {
    id: string;
    pastorId: string;
    mentorId: string | null;
    pastor: MentoringUserPreview | null;
    mentor: MentoringUserPreview | null;
    completedSessions: number;
    totalSessions: number;
    pendingRescheduleRequests: number;
    nextSessionNumber: number | null;
    nextMeetingDate: Date | string | null;
    journeyStatus: string;
    /** Next actionable session using the unified session schema; null when journey is finished or stalled */
    nextSession: UnifiedMentoringSessionDto | null;
}

/** Pastor requests mentor reschedule (`sessionId` = appointment `_id`; must match mentoring journey extras). */
export class PastorRescheduleRequestDto {
    @IsOptional()
    @IsString()
    reason?: string;

    /** Must match the appointment’s `userId` when unauthenticated callers pass it explicitly. */
    @IsMongoId()
    pastorId!: string;
}

/** Mentor assigns a new time (same semantics as appointments reschedule). */
export class MentorRescheduleDto {
    @IsMongoId()
    mentorId!: string;

    @IsString()
    newMeetingDate!: string;
}

export class MentorSessionActionDto {
    @IsMongoId()
    mentorId!: string;

    @IsOptional()
    @IsString()
    reason?: string;
}
