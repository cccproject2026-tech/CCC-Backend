import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MentoringRescheduleRequestDocument = MentoringRescheduleRequest & Document & { _id: Types.ObjectId };

@Schema({ timestamps: true, collection: 'mentoring_reschedule_requests' })
export class MentoringRescheduleRequest {
    @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true, index: true })
    appointmentId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    pastorId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    mentorId: Types.ObjectId;

    @Prop({ type: Number, required: true })
    sessionNumber: number;

    @Prop({ type: String })
    reason?: string;

    @Prop({ type: String, enum: ['pending', 'applied', 'dismissed'], default: 'pending' })
    status: string;
}

export const MentoringRescheduleRequestSchema = SchemaFactory.createForClass(MentoringRescheduleRequest);

MentoringRescheduleRequestSchema.index({ mentorId: 1, status: 1 });
MentoringRescheduleRequestSchema.index({ pastorId: 1, appointmentId: 1 });
