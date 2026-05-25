import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export type AssessmentAssignedDocument = AssessmentAssigned & Document;

@Schema({ timestamps: true })
export class AssessmentAssigned {

    @Prop({ type: Types.ObjectId, ref: 'Assessment', required: true })
    assessmentId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    /** When assigned (mirrors embedded `Assessment.assignments[].assignedAt` when present). */
    @Prop({ type: Date })
    assignedAt?: Date;

    @Prop({ type: Date })
    dueDate?: Date;

    @Prop({
        type: String,
        enum: ['assigned', 'in_progress', 'in-progress', 'submitted', 'reviewed', 'completed'],
        default: 'assigned'
    })
    status: string;

    @Prop({ type: Date })
    startedAt?: Date;

    @Prop({ type: Date })
    submittedAt?: Date;

    @Prop({ type: Types.ObjectId, ref: 'UserAnswer' })
    answerId?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Appointment' })
    appointmentId?: Types.ObjectId;
}

export const AssessmentAssignedSchema =
    SchemaFactory.createForClass(AssessmentAssigned);


AssessmentAssignedSchema.index({ userId: 1 });
AssessmentAssignedSchema.index({ assessmentId: 1 });
AssessmentAssignedSchema.index({ userId: 1, status: 1 });
AssessmentAssignedSchema.index(
    { assessmentId: 1, userId: 1 },
    { unique: true }
);