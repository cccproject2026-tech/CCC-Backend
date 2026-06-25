import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class NotificationItem {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  details: string;

  @Prop()
  module?: string;

  @Prop()
  referenceId?: string;

  @Prop({ default: false })
  read: boolean;

  @Prop({ default: Date.now })
  createdAt?: Date;
}
export const NotificationItemSchema =
  SchemaFactory.createForClass(NotificationItem);

export type NotificationDocument = Document<unknown, {}, Notification> &
  Notification & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ timestamps: true })
export class Notification {
  readonly _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: string;

  @Prop({ required: false })
  role?: string;

  @Prop({
    type: [NotificationItemSchema],
    default: [],
  })
  notifications: NotificationItem[];
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1 });
NotificationSchema.index({ role: 1 });
NotificationSchema.index({ 'notifications.read': 1 });
NotificationSchema.index({ createdAt: 1 });
NotificationSchema.index({ updatedAt: -1 });
