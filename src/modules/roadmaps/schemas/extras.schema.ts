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
        files: {
            fileName: string;
            fileUrl: string;
            fileType: string;
            fileSize: number;
        }[];
    }[];

    @Prop({ type: Boolean, default: false })
    isResubmitted: boolean;

    @Prop({ type: Date, default: null })
    resubmittedAt?: Date;

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