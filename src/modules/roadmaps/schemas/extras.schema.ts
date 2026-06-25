import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Extras {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'RoadMap', required: true, index: true })
    roadMapId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'NestedRoadMapItem', required: false })
    nestedRoadMapItemId?: Types.ObjectId;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    extras: any[];

    @Prop({
        type: [{
            uploadBatchId: { type: String, required: true },
            uploadedAt: { type: Date, default: Date.now },
            name: { type: String },
            /** Which extras save/resubmit version this batch belongs to (1-based). */
            historyVersion: { type: Number, min: 1 },
            files: [{
                fileName: { type: String, required: true },
                fileUrl: { type: String, required: true },
                fileType: { type: String, required: true },
                fileSize: { type: Number, required: true },
            }]
        }],
        default: [],
    })
    uploadedDocuments: {
        uploadBatchId: string;
        uploadedAt: Date;
        name?: string;
        historyVersion?: number;
        files: {
            fileName: string;
            fileUrl: string;
            fileType: string;
            fileSize: number;
        }[];
    }[];

    @Prop({ type: Boolean, default: false })
    isResubmitted: boolean;

    /** First pastor submission timestamp for this roadmap / nested task scope. */
    @Prop({ type: Date, default: null })
    submittedAt?: Date;

    @Prop({ type: Date, default: null })
    resubmittedAt?: Date;

    /** 1 = first submission; increments on each resubmission after completion. */
    @Prop({ type: Number, default: 1, min: 1 })
    submissionNumber: number;

    createdAt?: Date;
    updatedAt?: Date;
}

export type ExtrasDocument = Document<unknown, {}, Extras> & Extras & {
    _id: Types.ObjectId;
};

export const ExtrasSchema = SchemaFactory.createForClass(Extras);

ExtrasSchema.index({ userId: 1, roadMapId: 1 });
ExtrasSchema.index({ userId: 1, roadMapId: 1, nestedRoadMapItemId: 1 }, { unique: true });
ExtrasSchema.index({ isResubmitted: 1, userId: 1 });
ExtrasSchema.index({ userId: 1, submittedAt: 1 });
ExtrasSchema.index({ userId: 1, resubmittedAt: 1 });