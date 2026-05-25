import { AppointmentDocument } from '../schemas/appointment.schema';
import { AppointmentResponseDto } from '../dto/appointment.dto';

// Accept ANY shape coming from Mongoose — populated OR not, with timestamps OR not
type LooseAppointment = AppointmentDocument & {
    userId?: any;
    mentorId?: any;
    createdAt?: Date;
    updatedAt?: Date;
    zoomMeetingId?: string;
    zoomMeeting?: any;
    transcript?: string;
    transcriptSavedAt?: Date;
    transcriptSummary?: {
        sessionOverview: string;
        keyDiscussionPoints: string[];
        mentorGuidance: string[];
        actionItems: string[];
        followUp: string;
    };
    transcriptSummarySavedAt?: Date;
    transcriptSummaryModel?: string;
    mentorGoogleCalendarEventId?: string | null;
    userGoogleCalendarEventId?: string | null;
};

export const toAppointmentResponseDto = (
    appointment: LooseAppointment
): AppointmentResponseDto => {

    const userPopulated =
        appointment.userId && typeof appointment.userId === 'object'
            ? {
                id: appointment.userId._id?.toString(),
                firstName: appointment.userId.firstName,
                lastName: appointment.userId.lastName,
                email: appointment.userId.email,
                phoneNumber: appointment.userId.phoneNumber,
                profilePicture: appointment.userId.profilePicture || null,
                role: appointment.userId.role,
                roleId: appointment.userId.roleId?.toString(),
                status: appointment.userId.status,
            }
            : null;

    const mentorPopulated =
        appointment.mentorId && typeof appointment.mentorId === 'object'
            ? {
                id: appointment.mentorId._id?.toString(),
                firstName: appointment.mentorId.firstName,
                lastName: appointment.mentorId.lastName,
                email: appointment.mentorId.email,
                phoneNumber: appointment.mentorId.phoneNumber,
                profilePicture: appointment.mentorId.profilePicture || null,
                role: appointment.mentorId.role,
                roleId: appointment.mentorId.roleId?.toString(),
                status: appointment.mentorId.status,
            }
            : null;

    return {
        id: appointment._id.toString(),
        userId:
            appointment.userId?._id?.toString() ??
            appointment.userId?.toString(),
        mentorId:
            appointment.mentorId?._id?.toString() ??
            appointment.mentorId?.toString(),

        meetingDate: appointment.meetingDate,
        endTime: appointment.endTime,

        platform: appointment.platform,
        meetingLink: appointment.meetingLink,
        status: appointment.status,
        notes: appointment.notes,

        // Zoom meeting details
        zoomMeetingId: appointment.zoomMeetingId ?? undefined,
        zoomMeeting: appointment.zoomMeeting ? {
            meetingId: appointment.zoomMeeting.meetingId,
            joinUrl: appointment.zoomMeeting.joinUrl,
            startUrl: appointment.zoomMeeting.startUrl,
            password: appointment.zoomMeeting.password,
            hostEmail: appointment.zoomMeeting.hostEmail,
            topic: appointment.zoomMeeting.topic,
            duration: appointment.zoomMeeting.duration,
        } : undefined,

        createdAt: appointment.createdAt ?? undefined,
        updatedAt: appointment.updatedAt ?? undefined,

        transcript: appointment.transcript ?? undefined,
        transcriptSavedAt: appointment.transcriptSavedAt ?? undefined,
        transcriptSummary: appointment.transcriptSummary ?? undefined,
        transcriptSummarySavedAt: appointment.transcriptSummarySavedAt ?? undefined,
        transcriptSummaryModel: appointment.transcriptSummaryModel ?? undefined,

        mentorGoogleCalendarEventId: appointment.mentorGoogleCalendarEventId ?? undefined,
        userGoogleCalendarEventId: appointment.userGoogleCalendarEventId ?? undefined,

        user: userPopulated,
        mentor: mentorPopulated
    };
};
