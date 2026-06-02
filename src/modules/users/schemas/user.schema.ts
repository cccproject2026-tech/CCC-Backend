import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoid } from 'nanoid';
import { ROLES } from '../../../common/constants/roles.constants';
import {
  USER_STATUSES,
  VALID_USER_STATUSES,
} from '../../../common/constants/status.constants';
import {
  GOOGLE_CALENDAR_STATUSES,
  VALID_GOOGLE_CALENDAR_STATUSES,
} from '../../../common/constants/google-calendar.constants';

export type UserDocument = Document<unknown, {}, User> &
  User & {
    _id: Types.ObjectId;
  };

const VALID_ROLES = Object.values(ROLES);

@Schema({ timestamps: true })
export class Note {
  readonly _id?: Types.ObjectId;

  @Prop({ required: true })
  content: string;
}

export const NoteSchema = SchemaFactory.createForClass(Note);

@Schema({ timestamps: true })
export class User {
  readonly _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Interest' })
  interestId?: Types.ObjectId;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ unique: true, sparse: true })
  username?: string;

  @Prop()
  password?: string;

  @Prop({ enum: VALID_ROLES, default: ROLES.PENDING })
  role: string;

  @Prop({
    required: true,
    unique: true,
    default: () => nanoid(),
    index: true,
  })
  roleId: string;

  @Prop()
  profilePicture?: string;

  @Prop({
    enum: VALID_USER_STATUSES,
    default: USER_STATUSES.PENDING,
  })
  status: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  emailVerifiedAt?: Date;

  @Prop({ default: false })
  isPasswordSet: boolean;

  @Prop()
  passwordCreatedAt?: Date;

  @Prop()
  refreshToken?: string;

  @Prop()
  googleAccessToken?: string;

  @Prop()
  googleRefreshToken?: string;

  @Prop()
  googleTokenExpiry?: number;

  /** Google Calendar ID for CCC sync (e.g. `primary`, or a calendar email). Default `primary` when unset. */
  @Prop()
  googleCalendarId?: string;

  @Prop({
    enum: VALID_GOOGLE_CALENDAR_STATUSES,
    default: GOOGLE_CALENDAR_STATUSES.DISCONNECTED,
  })
  googleCalendarStatus?: string;

  @Prop()
  googleCalendarConnectedAt?: Date;

  @Prop()
  googleCalendarLastSyncAt?: Date;

  @Prop()
  googleCalendarEmail?: string;

  @Prop({ type: String, default: null })
  googleCalendarLastError?: string | null;

  @Prop({ type: [String], default: [] })
  fcmTokens: string[];

  @Prop({ type: [String], default: [] })
  expoTokens: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  assignedId: Types.ObjectId[];

  @Prop({
    type: [{
      fileName: { type: String, required: true },
      fileUrl: { type: String, required: true },
      fileType: { type: String, required: true },
      fileSize: { type: Number, required: true },
      uploadedAt: { type: Date, default: Date.now },
    }],
    default: [],
  })
  uploadedDocuments: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    uploadedAt: Date;
  }[];

  @Prop({ type: Boolean, default: false })
  hasCompleted: boolean;

  @Prop({ type: Date, default: null })
  completedAt?: Date | null;

  @Prop({ type: Boolean, default: false })
  hasIssuedCertificate: boolean;

  @Prop({
    type: {
      invitedBy: { type: Types.ObjectId, ref: 'User' },
      invitedAt: { type: Date },
      token: { type: String },
      expiresAt: { type: Date },
    },
  })
  fieldMentorInvitation?: {
    invitedBy: Types.ObjectId;
    invitedAt: Date;
    token: string;
    expiresAt: Date;
  };

  @Prop({ type: String, default: null })
  zoomUserId?: string;

  @Prop({ type: [NoteSchema], default: [] })
  notes: Types.Array<Note>;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ interestId: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ assignedId: 1, status: 1 });
UserSchema.index({ firstName: 'text', lastName: 'text', email: 'text', username: 'text' });
UserSchema.index({ fcmTokens: 1 });
