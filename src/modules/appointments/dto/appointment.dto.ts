import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, IsNotEmpty, IsBoolean, IsIn } from 'class-validator';
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { VALID_APPOINTMENT_PLATFORMS, VALID_APPOINTMENT_STATUSES } from '../../../common/constants/status.constants';

export class CreateAppointmentDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @IsOptional()
    @IsMongoId()
    assessmentAssignmentId?: string;

    @IsMongoId()
    @IsNotEmpty()
    mentorId: string;

    @IsDateString()
    @IsNotEmpty()
    meetingDate: string;

    @IsEnum(VALID_APPOINTMENT_PLATFORMS)
    platform: string;

    @IsOptional()
    @IsString()
    meetingLink?: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    initiatorRole?: string;

    /**
     * If the appointment `userId` is not the person whose Google Calendar should get the second event
     * (non-mentor party), pass that user’s Mongo id here — e.g. Director mentoring session while `userId`
     * holds another linked record.
     */
    @IsOptional()
    @IsMongoId()
    googleCalendarNonMentorUserId?: string;

    @IsOptional()
    @IsBoolean()
    isSessionBooking?: boolean
}

export class UpdateAppointmentDto extends PartialType(
    OmitType(CreateAppointmentDto, ['userId', 'mentorId'] as const)
) {
    @IsOptional()
    @IsEnum(VALID_APPOINTMENT_STATUSES)
    status?: string;
}

export class PersonInfoDto {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    profilePicture?: string;
    role?: string;
    roleId?: string;
    status?: string;
}

export class ZoomMeetingDto {
    meetingId?: string;
    joinUrl?: string;
    startUrl?: string;
    password?: string;
    hostEmail?: string;
    topic?: string;
    duration?: number;
}

export class SessionJoinAuditEntryDto {
    at: Date;
    userId: string;
    kind: 'host' | 'participant';
}

export class TranscriptSummaryDto {
    sessionOverview: string;
    keyDiscussionPoints: string[];
    mentorGuidance: string[];
    actionItems: string[];
    followUp: string;
}

export class AppointmentResponseDto {
    id: string;

    userId: string;
    mentorId: string;

    user: PersonInfoDto | null;
    mentor: PersonInfoDto | null;

    meetingDate: Date;
    endTime: Date;

    platform: string;
    meetingLink?: string;
    notes?: string;
    status: string;

    zoomMeetingId?: string;
    zoomMeeting?: ZoomMeetingDto;

    /** Zoom meeting password when present (mirrors `zoomMeeting.password`); use when join URL has no `pwd=`. */
    zoomPasscode?: string;

    hostJoinedAt?: Date;
    joinAudit?: SessionJoinAuditEntryDto[];

    transcript?: string;
    transcriptSavedAt?: Date;
    transcriptSummary?: TranscriptSummaryDto;
    transcriptSummarySavedAt?: Date;
    transcriptSummaryModel?: string;

    /** Google Calendar event ids when sync succeeded (mentor + participant calendars). */
    mentorGoogleCalendarEventId?: string | null;
    userGoogleCalendarEventId?: string | null;

    /** Populated on create when OAuth is missing or Calendar API errors; empty when both sides synced. */
    googleCalendarSyncWarnings?: string[];

    createdAt?: Date;
    updatedAt?: Date;
}

export class TranscriptSummaryResponseDto {
    appointmentId: string;
    transcript?: string;
    transcriptSavedAt?: Date;
    summary: TranscriptSummaryDto;
    generatedAt: Date;
    model: string;
    cached: boolean;
}

export class CancelAppointmentDto {
    readonly reason?: string;
}

/** Mentor/director marks a scheduled session as a no-show; join links are cleared (same as automatic missed processing). */
export class MarkMissedAppointmentDto {
    @IsOptional()
    @IsString()
    readonly reason?: string;
}

/** Records a host or participant joining the live session; host first join can move status to `in-progress`. */
export class RecordSessionJoinDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @IsIn(['host', 'participant'])
    kind: 'host' | 'participant';
}