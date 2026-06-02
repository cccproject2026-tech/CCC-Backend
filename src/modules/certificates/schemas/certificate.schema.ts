import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CertificateDocument = Document<unknown, {}, Certificate> & Certificate & {
    _id: Types.ObjectId;
};

@Schema({ timestamps: true })
export class Certificate {
    @Prop({ type: String, required: true, unique: true, index: true })
    certificateId: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true, unique: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    issuedBy: Types.ObjectId;

    @Prop({ type: String, required: true })
    issuedByName: string;

    @Prop({ type: String, required: true })
    pastorName: string;

    @Prop({ type: String, default: null })
    mentorName?: string | null;

    @Prop({ type: String, required: true })
    programName: string;

    @Prop({ type: Date, required: true })
    completionDate: Date;

    @Prop({ type: Date, required: true })
    issuedAt: Date;

    @Prop({ type: String, default: null })
    personalMessage?: string | null;

    /** Optional rendered certificate image URL; may match `pdfUrl` when only PDF is generated. */
    @Prop({ type: String, default: null })
    certificateUrl?: string | null;

    @Prop({ type: String, required: true })
    pdfUrl: string;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);

CertificateSchema.index({ userId: 1, issuedAt: -1 });
