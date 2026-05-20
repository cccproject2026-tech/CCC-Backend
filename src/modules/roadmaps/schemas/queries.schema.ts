import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type QueryItemDocument = Document<unknown, {}, QueryItem> & QueryItem & {
    _id: Types.ObjectId;
};

@Schema({ _id: true })
export class QueryItem {
    readonly _id?: Types.ObjectId;

    @Prop({ required: true })
    actualQueryText: string;

    @Prop({ type: Date, default: Date.now })
    createdDate: Date;

    @Prop()
    repliedAnswer: string;

    @Prop({ type: Date })
    repliedDate: Date;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    repliedMentorId: Types.ObjectId;

    @Prop({ enum: ['pending', 'answered'], default: 'pending' })
    status: 'pending' | 'answered';

    /** Nested roadmap step/task this query belongs to (optional for legacy docs). */
    @Prop({ type: Types.ObjectId })
    nestedRoadMapItemId?: Types.ObjectId;
}

export const QueryItemSchema = SchemaFactory.createForClass(QueryItem);

export type QueriesDocument = Document<unknown, {}, Queries> & Queries & {
    _id: Types.ObjectId;
};

@Schema({ timestamps: true })
export class Queries {

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'RoadMap', required: true })
    roadMapId: Types.ObjectId;

    @Prop({ type: [QueryItemSchema], default: [] })
    queries: Types.Array<QueryItem>;
}

export const QueriesSchema = SchemaFactory.createForClass(Queries);

QueriesSchema.index({ userId: 1, roadMapId: 1 });
QueriesSchema.index({ roadMapId: 1 });
QueriesSchema.index({ userId: 1 });
QueriesSchema.index({ 'queries.status': 1 });
// QueriesSchema.index({ 'queries.repliedMentorId': 1 });
QueriesSchema.index({ createdAt: 1 });
QueriesSchema.index({ updatedAt: -1 });

QueriesSchema.pre('save', function (next) {
    const doc = this as QueriesDocument;

    doc.queries.forEach(query => {
        if (query.repliedAnswer && query.repliedMentorId) {
            query.status = 'answered';
        } else {
            query.status = 'pending';
        }
    });

    next();
});