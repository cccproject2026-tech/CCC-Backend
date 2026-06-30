import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, IsNotEmpty, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
    VALID_APPOINTMENT_PLATFORMS,
    VALID_APPOINTMENT_STATUSES,
    VALID_RECORDING_STATUSES,
    VALID_SESSION_MODES,
} from '../../../common/constants/status.constants';

export class CreateAppointmentDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    assessmentAssignmentId?: string;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    mentorId: string;

    @ApiProperty()
    @IsDateString()
    @IsNotEmpty()
    meetingDate: string;

    @ApiProperty({ enum: VALID_APPOINTMENT_PLATFORMS })
    @IsEnum(VALID_APPOINTMENT_PLATFORMS)
    platform: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    meetingLink?: string;

    @ApiPropertyOptional({ enum: VALID_SESSION_MODES })
    @IsOptional()
    @IsEnum(VALID_SESSION_MODES)
    sessionMode?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    meetingLocation?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    /** Optional override for Google Calendar event title; falls back to `title` or default. */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleCalendarTitle?: string;

    /** Optional override for Google Calendar event description; falls back to `description` / `notes`. */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleCalendarDescription?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    initiatorRole?: string;

    /**
     * If the appointment `userId` is not the person whose Google Calendar should get the second event
     * (non-mentor party), pass that user's Mongo id here — e.g. Director mentoring session while `userId`
     * holds another linked record.
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    googleCalendarNonMentorUserId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isSessionBooking?: boolean
}

export class UpdateAppointmentDto extends PartialType(
    OmitType(CreateAppointmentDto, ['userId', 'mentorId', 'sessionMode'] as const)
) {
    @ApiPropertyOptional({ enum: VALID_APPOINTMENT_STATUSES })
    @IsOptional()
    @IsEnum(VALID_APPOINTMENT_STATUSES)
    status?: string;
}

export class PersonInfoDto {
    @ApiProperty()
    id: string;
    @ApiPropertyOptional()
    firstName?: string;
    @ApiPropertyOptional()
    lastName?: string;
    @ApiPropertyOptional()
    email?: string;
    @ApiPropertyOptional()
    phoneNumber?: string;
    @ApiPropertyOptional()
    profilePicture?: string;
    @ApiPropertyOptional()
    role?: string;
    @ApiPropertyOptional()
    roleId?: string;
    @ApiPropertyOptional()
    status?: string;
}

export class ZoomMeetingDto {
    @ApiPropertyOptional()
    meetingId?: string;
    @ApiPropertyOptional()
    joinUrl?: string;
    @ApiPropertyOptional()
    startUrl?: string;
    @ApiPropertyOptional()
    password?: string;
    @ApiPropertyOptional()
    hostEmail?: string;
    @ApiPropertyOptional()
    topic?: string;
    @ApiPropertyOptional()
    duration?: number;
}

export class SessionJoinAuditEntryDto {
    @ApiProperty()
    at: Date;
    @ApiProperty()
    userId: string;
    @ApiProperty({ enum: ['host', 'participant'] })
    kind: 'host' | 'participant';
}

export class TranscriptSummaryDto {
    @ApiProperty()
    sessionOverview: string;
    @ApiProperty({ type: [String] })
    keyDiscussionPoints: string[];
    @ApiProperty({ type: [String] })
    mentorGuidance: string[];
    @ApiProperty({ type: [String] })
    actionItems: string[];
    @ApiProperty()
    followUp: string;
}

export class AppointmentResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    userId: string;
    @ApiProperty()
    mentorId: string;

    @ApiPropertyOptional({ type: () => PersonInfoDto, nullable: true })
    user: PersonInfoDto | null;
    @ApiPropertyOptional({ type: () => PersonInfoDto, nullable: true })
    mentor: PersonInfoDto | null;

    @ApiProperty()
    meetingDate: Date;
    @ApiProperty()
    endTime: Date;

    @ApiProperty()
    platform: string;
    @ApiPropertyOptional()
    sessionMode?: string;
    @ApiPropertyOptional()
    meetingLink?: string;
    @ApiPropertyOptional({ nullable: true })
    meetingLocation?: string | null;
    @ApiPropertyOptional({ nullable: true })
    recordingUrl?: string | null;
    @ApiPropertyOptional()
    recordingStatus?: string;
    @ApiPropertyOptional()
    notes?: string;
    @ApiPropertyOptional()
    title?: string;
    @ApiPropertyOptional()
    description?: string;
    @ApiProperty()
    status: string;

    @ApiPropertyOptional()
    zoomMeetingId?: string;
    @ApiPropertyOptional({ type: () => ZoomMeetingDto })
    zoomMeeting?: ZoomMeetingDto;

    /** Zoom meeting password when present (mirrors `zoomMeeting.password`); use when join URL has no `pwd=`. */
    @ApiPropertyOptional()
    zoomPasscode?: string;

    @ApiPropertyOptional()
    hostJoinedAt?: Date;
    @ApiPropertyOptional({ type: [SessionJoinAuditEntryDto] })
    joinAudit?: SessionJoinAuditEntryDto[];

    @ApiPropertyOptional()
    transcript?: string;
    @ApiPropertyOptional()
    transcriptSavedAt?: Date;
    @ApiPropertyOptional({ type: () => TranscriptSummaryDto })
    transcriptSummary?: TranscriptSummaryDto;
    @ApiPropertyOptional()
    transcriptSummarySavedAt?: Date;
    @ApiPropertyOptional()
    transcriptSummaryModel?: string;

    /** Google Calendar event ids when sync succeeded (mentor + participant calendars). */
    @ApiPropertyOptional({ nullable: true })
    mentorGoogleCalendarEventId?: string | null;
    @ApiPropertyOptional({ nullable: true })
    userGoogleCalendarEventId?: string | null;

    /** Populated on create when OAuth is missing or Calendar API errors; empty when both sides synced. */
    @ApiPropertyOptional({ type: [String] })
    googleCalendarSyncWarnings?: string[];

    @ApiPropertyOptional()
    createdAt?: Date;
    @ApiPropertyOptional()
    updatedAt?: Date;
}

export class TranscriptSummaryResponseDto {
    @ApiProperty()
    appointmentId: string;
    @ApiPropertyOptional()
    transcript?: string;
    @ApiPropertyOptional()
    transcriptSavedAt?: Date;
    @ApiProperty({ type: () => TranscriptSummaryDto })
    summary: TranscriptSummaryDto;
    @ApiProperty()
    generatedAt: Date;
    @ApiProperty()
    model: string;
    @ApiProperty()
    cached: boolean;
}

export class CancelAppointmentDto {
    @ApiPropertyOptional()
    readonly reason?: string;
}

export class UpdateAppointmentSessionModeDto {
    @ApiProperty({ enum: VALID_SESSION_MODES })
    @IsEnum(VALID_SESSION_MODES)
    @IsNotEmpty()
    sessionMode: string;
}

export class UploadAppointmentRecordingResponseDto {
    @ApiProperty()
    appointmentId: string;
    @ApiProperty()
    recordingUrl: string;
    @ApiProperty()
    recordingStatus: string;
    @ApiPropertyOptional()
    transcriptSavedAt?: Date;
    @ApiPropertyOptional()
    transcriptSummarySavedAt?: Date;
}

/** Mentor/director marks a scheduled session as a no-show; join links are cleared (same as automatic missed processing). */
export class MarkMissedAppointmentDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    readonly reason?: string;
}

/** Records a host or participant joining the live session; host first join can move status to `in-progress`. */
export class RecordSessionJoinDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ enum: ['host', 'participant'] })
    @IsIn(['host', 'participant'])
    kind: 'host' | 'participant';
}
