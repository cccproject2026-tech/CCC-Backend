import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { VALID_APPOINTMENT_STATUSES, VALID_APPOINTMENT_PLATFORMS, APPOINTMENT_STATUSES, APPOINTMENT_PLATFORMS } from '../../../common/constants/status.constants';

export type AppointmentDocument = Document<unknown, {}, Appointment> & Appointment & {
    _id: Types.ObjectId;
};

@Schema({
    timestamps: true,
    collection: 'appointments'
})
export class Appointment {

    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    })
    userId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    })
    mentorId: Types.ObjectId;

    @Prop({
        type: Date,
        required: true
    })
    meetingDate: Date;

    @Prop({
        type: Date,
        required: true,
        default: () => {
            const date = new Date();
            date.setHours(date.getHours() + 1);
            return date;
        }
    })
    endTime: Date;

    @Prop({
        type: String,
        enum: VALID_APPOINTMENT_PLATFORMS,
        default: APPOINTMENT_PLATFORMS.ZOOM,
        required: true
    })
    platform: string;

    @Prop()
    meetingLink?: string;

    @Prop()
    notes?: string;

    @Prop({
        type: String,
        enum: VALID_APPOINTMENT_STATUSES,
        default: APPOINTMENT_STATUSES.SCHEDULED,
        required: true
    })
    status: string;

    @Prop({ type: Date, default: null })
    canceledAt?: Date;

    @Prop({ type: String, default: null })
    cancelReason?: string;

    // Zoom meeting fields
    @Prop({ type: String, default: null, index: true })
    zoomMeetingId?: string;

    @Prop({
        type: {
            meetingId: { type: String },
            joinUrl: { type: String },
            startUrl: { type: String },
            password: { type: String },
            hostEmail: { type: String },
            hostId: { type: String },
            topic: { type: String },
            duration: { type: Number },
            timezone: { type: String },
            createdAt: { type: Date },
        },
        default: null
    })
    zoomMeeting?: {
        meetingId: string;
        joinUrl: string;
        startUrl?: string;
        password?: string;
        hostEmail?: string;
        hostId?: string;
        topic?: string;
        duration?: number;
        timezone?: string;
        createdAt?: Date;
    };

    @Prop({ type: String, default: null })
    transcript?: string;

    @Prop({ type: Date, default: null })
    transcriptSavedAt?: Date;

    @Prop({
        type: {
            sessionOverview: { type: String, default: null },
            keyDiscussionPoints: { type: [String], default: [] },
            mentorGuidance: { type: [String], default: [] },
            actionItems: { type: [String], default: [] },
            followUp: { type: String, default: null },
        },
        default: null
    })
    transcriptSummary?: {
        sessionOverview: string;
        keyDiscussionPoints: string[];
        mentorGuidance: string[];
        actionItems: string[];
        followUp: string;
    };

    @Prop({ type: Date, default: null })
    transcriptSummarySavedAt?: Date;

    @Prop({ type: String, default: null })
    transcriptSummaryModel?: string;

    @Prop({ type: String, default: null })
    mentorGoogleCalendarEventId?: string;

    @Prop({ type: String, default: null })
    userGoogleCalendarEventId?: string;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

AppointmentSchema.pre('save', function (next) {
    if (this.isModified('meetingDate') && this.meetingDate) {
        const endTime = new Date(this.meetingDate.getTime() + 60 * 60 * 1000);
        (this as any).endTime = endTime;
    }
    next();
});

AppointmentSchema.index({ meetingDate: 1, endTime: 1 });
AppointmentSchema.index({ userId: 1, meetingDate: 1 });
AppointmentSchema.index({ mentorId: 1, meetingDate: 1 });
AppointmentSchema.index({ status: 1, mentorId: 1 });
AppointmentSchema.index({ status: 1, userId: 1 });
AppointmentSchema.index({ status: 1, meetingDate: -1 });
// Helps the cron query:
// updateMany({ status: scheduled, endTime: { $lt: now } })
AppointmentSchema.index({ status: 1, endTime: 1 });
AppointmentSchema.index({ platform: 'text', status: 'text', notes: 'text' });
AppointmentSchema.index({ zoomMeetingId: 1 });