import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types, Schema as MongooseSchema } from "mongoose";
import { VALID_ROADMAP_STATUSES, ROADMAP_STATUSES } from '../../../common/constants/status.constants';

@Schema({ _id: false })
export class TextFieldExtra {
    @Prop({ required: true, enum: ['TEXT_FIELD'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    placeHolder?: string;

    @Prop()
    buttonName?: string;
}

@Schema({ _id: false })
export class TextAreaExtra {
    @Prop({ required: true, enum: ['TEXT_AREA'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    placeHolder?: string;

    @Prop()
    buttonName?: string;
}

@Schema({ _id: false })
export class TextDisplayExtra {
    @Prop({ required: true, enum: ['TEXT_DISPLAY'] })
    type: string;

    @Prop({ required: true })
    name: string;
}

@Schema({ _id: false })
export class CheckboxExtra {
    @Prop({ required: true, enum: ['CHECKBOX'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    haveButton: boolean;

    @Prop()
    buttonName?: string;
}

@Schema({ _id: false })
export class UploadExtra {
    @Prop({ required: true, enum: ['UPLOAD'] })
    type: string;

    @Prop({ required: true })
    name: string;
}

@Schema({ _id: false })
export class DatePickerExtra {
    @Prop({ required: true, enum: ['DATE_PICKER'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    date?: string;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    checkboxes?: any[];

    @Prop()
    buttonName?: string;
}

@Schema({ _id: false })
export class AssessmentExtra {
    @Prop({ required: true, enum: ['ASSESSMENT'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop({ type: Types.ObjectId, ref: 'Assessment', required: true })
    assessmentId: Types.ObjectId;

    @Prop()
    buttonName?: string;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    checkboxes?: any[];
}

@Schema({ _id: false })
export class SectionExtra {
    @Prop({ required: true, enum: ['SECTION'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    checkboxes?: any[];

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    sections?: any[];
}

@Schema({ _id: false })
export class SignatureExtra {
    @Prop({ required: true, enum: ['SIGNATURE'] })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    buttonName?: string;

    @Prop()
    signatureData?: string;

    @Prop({ type: Date })
    signedAt?: Date;
}

@Schema({ _id: true, timestamps: true })
export class RoadmapAppointments {

    @Prop({ required: true })
    sessionNumber: number;

    @Prop({ required: true })
    title: string;

    @Prop({ type: Date, required: true })
    originalDate: Date;

    @Prop({ type: Date })
    scheduledDate: Date;

    @Prop({ type: Date })
    completedAt?: Date;

    @Prop({ default: false })
    isCompleted: boolean;

    @Prop({ default: false })
    isConfirmed: boolean;

    @Prop({ default: false })
    isRedo: boolean;

    @Prop({ type: Date })
    redoScheduledDate?: Date;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    mentorId?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    pastorId?: Types.ObjectId;

    @Prop({
        enum: ['PENDING', 'SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED'],
        default: 'PENDING'
    })
    status: string;

    @Prop({ default: "" })
    mentorNote: string;

    @Prop({ default: "" })
    pastorNote: string;
}

export const SignatureExtraSchema = SchemaFactory.createForClass(SignatureExtra);

export const TextFieldExtraSchema = SchemaFactory.createForClass(TextFieldExtra);
export const TextAreaExtraSchema = SchemaFactory.createForClass(TextAreaExtra);
export const TextDisplayExtraSchema = SchemaFactory.createForClass(TextDisplayExtra);
export const CheckboxExtraSchema = SchemaFactory.createForClass(CheckboxExtra);
export const UploadExtraSchema = SchemaFactory.createForClass(UploadExtra);
export const DatePickerExtraSchema = SchemaFactory.createForClass(DatePickerExtra);
export const AssessmentExtraSchema = SchemaFactory.createForClass(AssessmentExtra);
export const SectionExtraSchema = SchemaFactory.createForClass(SectionExtra);
export const RoadmapAppointmentsSchema = SchemaFactory.createForClass(RoadmapAppointments);

@Schema()
export class NestedRoadMapItem {
    readonly _id?: Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop()
    roadMapDetails: string;

    @Prop()
    description: string;

    @Prop({ enum: VALID_ROADMAP_STATUSES, default: ROADMAP_STATUSES.NOT_STARTED })
    status: string;

    @Prop({ required: true })
    duration: string;

    @Prop({ type: Date })
    startDate: Date;

    @Prop({ type: Date })
    endDate: Date;

    @Prop({ type: Date })
    completedOn: Date;

    @Prop()
    imageUrl: string;

    @Prop({ type: [Date], default: [] })
    meetings: Date[];

    @Prop({ default: "" })
    phase: string;

    @Prop({ default: 0, type: Number })
    totalSteps: number;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    extras?: any[];
}

export const NestedRoadMapItemSchema = SchemaFactory.createForClass(NestedRoadMapItem);

@Schema({ timestamps: true })
export class RoadMap {

    @Prop({ required: true })
    type: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    roadMapDetails: string;

    @Prop()
    description: string;

    @Prop({ enum: VALID_ROADMAP_STATUSES, default: ROADMAP_STATUSES.NOT_STARTED })
    status: string;

    @Prop({ required: true })
    duration: string;

    @Prop({ type: Date })
    startDate?: Date;

    @Prop({ type: Date })
    endDate?: Date;

    @Prop({ type: Date })
    completedOn?: Date;

    @Prop()
    imageUrl?: string;

    @Prop({ type: [Date], default: [] })
    meetings: Date[];

    @Prop({ default: [] })
    divisions: string[];

    @Prop({ default: false })
    haveNextedRoadMaps: boolean;

    @Prop({ default: "" })
    phase: string;

    @Prop({ type: Types.ObjectId, ref: 'Assessment', required: false })
    assesmentId?: Types.ObjectId;

    @Prop({ default: 0, type: Number })
    totalSteps: number;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    extras?: any[];

    @Prop({ type: [NestedRoadMapItemSchema], default: [] })
    roadmaps: Types.Array<NestedRoadMapItem>;

    /** Director library sort order (1-based). Omitted on legacy documents until reordered. */
    @Prop({ type: Number, required: false })
    displayOrder?: number;
}

export const RoadMapSchema = SchemaFactory.createForClass(RoadMap);

export type RoadMapDocument = Document<unknown, {}, RoadMap> & RoadMap & {
    _id: Types.ObjectId;
};

RoadMapSchema.index({ name: 'text', description: 'text', roadMapDetails: 'text' });
RoadMapSchema.index({ status: 1, createdAt: -1 });
RoadMapSchema.index({ type: 1, status: 1 });
RoadMapSchema.index({ displayOrder: 1, createdAt: 1 });

RoadMapSchema.pre('save', function (next) {
    const doc = this as RoadMapDocument;
    doc.haveNextedRoadMaps = doc.roadmaps && doc.roadmaps.length > 0;
    next();
});