import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
    VOICE_NOTE_SOURCES,
    VOICE_NOTE_STATUSES,
} from '../interfaces/voice-note-status.interface';

export type VoiceNoteDocument = Document<unknown, {}, VoiceNote> & VoiceNote & {
    _id: Types.ObjectId;
};

@Schema({
    timestamps: true,
    collection: 'voice_notes',
})
export class VoiceNote {
    readonly _id?: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    })
    userId: Types.ObjectId;

    @Prop({ type: String, default: '' })
    title: string;

    @Prop({
        type: String,
        enum: VOICE_NOTE_SOURCES,
        default: 'upload',
        required: true,
    })
    source: string;

    @Prop({ type: String, required: true })
    audioUrl: string;

    @Prop({ type: String, required: true })
    audioMimeType: string;

    @Prop({ type: Number, required: true })
    fileSizeBytes: number;

    @Prop({ type: Number, default: null })
    recordingDurationSeconds?: number;

    @Prop({ type: String, default: null })
    recordingDeviceType?: string;

    @Prop({ type: String, default: null })
    recordingPlatform?: string;

    @Prop({
        type: String,
        enum: VOICE_NOTE_STATUSES,
        default: 'pending',
        required: true,
        index: true,
    })
    status: string;

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
        default: null,
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
    errorMessage?: string;

    createdAt?: Date;
    updatedAt?: Date;
}

export const VoiceNoteSchema = SchemaFactory.createForClass(VoiceNote);

VoiceNoteSchema.index({ userId: 1, createdAt: -1 });
