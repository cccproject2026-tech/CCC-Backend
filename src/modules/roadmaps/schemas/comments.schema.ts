import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type CommentItemDocument = Document<unknown, {}, CommentItem> & CommentItem & {
    _id: Types.ObjectId;
};

@Schema()
export class CommentItem {

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    mentorId: Types.ObjectId;

    @Prop({ required: true })
    text: string;

    /** When set, comment is scoped to a nested roadmap task; omit for roadmap-level comments. */
    @Prop({ type: Types.ObjectId, default: null })
    nestedRoadMapItemId?: Types.ObjectId | null;

    @Prop({ type: Date, default: Date.now })
    addedDate: Date;
}

export const CommentItemSchema = SchemaFactory.createForClass(CommentItem);

export type CommentsDocument = Document<unknown, {}, Comments> & Comments & {
    _id: Types.ObjectId;
};

@Schema({ timestamps: true })
export class Comments {

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'RoadMap', required: true })
    roadMapId: Types.ObjectId;

    @Prop({ type: [CommentItemSchema], default: [] })
    comments: Types.Array<CommentItem>;
}

export const CommentsSchema = SchemaFactory.createForClass(Comments);

CommentsSchema.index({ userId: 1, roadMapId: 1 });
CommentsSchema.index({ roadMapId: 1 });
CommentsSchema.index({ userId: 1 });
// CommentsSchema.index({ 'comments.mentorId': 1 });
CommentsSchema.index({ createdAt: 1 });
CommentsSchema.index({ updatedAt: -1 });