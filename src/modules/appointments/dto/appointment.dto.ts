import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, IsNotEmpty, IsBoolean } from 'class-validator';
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