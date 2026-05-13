import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
    APPOINTMENT_PLATFORMS,
    VALID_APPOINTMENT_PLATFORMS,
} from 'src/common/constants/status.constants';

export type AvailabilityDocument = Availability & Document;

@Schema()
export class Slot {
    @Prop({ type: String, required: true })
    startTime: string;

    @Prop({ type: String, required: true, enum: ['AM', 'PM'] })
    startPeriod: 'AM' | 'PM';

    @Prop({ type: String, required: true })
    endTime: string;

    @Prop({ type: String, required: true, enum: ['AM', 'PM'] })
    endPeriod: 'AM' | 'PM';
}

export const SlotSchema = SchemaFactory.createForClass(Slot);

@Schema()
export class DayAvailability {

    // @Prop({ type: Number, required: true })
    // day: number;

    @Prop({ type: Date, required: true })
    date: Date;

    @Prop({ type: [SlotSchema], default: [] })
    rawSlots: Slot[];

    @Prop({ type: [SlotSchema], default: [] })
    slots: Slot[];

    /** When true, the mentor blocked the whole day (no bookable slots). */
    @Prop({ type: Boolean, default: false })
    unavailable?: boolean;
}

export const DayAvailabilitySchema = SchemaFactory.createForClass(DayAvailability);

@Schema({ timestamps: true, collection: 'availability' })
export class Availability {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    mentorId: Types.ObjectId;

    @Prop({
        type: [DayAvailabilitySchema],
        default: [
            { day: 0, slots: [] },
            { day: 1, slots: [] },
            { day: 2, slots: [] },
            { day: 3, slots: [] },
            { day: 4, slots: [] },
            { day: 5, slots: [] },
            { day: 6, slots: [] },
        ],
    })
    weeklySlots: DayAvailability[];

    @Prop({ type: Number, default: 60 })
    meetingDuration: number;

    @Prop({ type: Number, default: 2 })
    minSchedulingNoticeHours: number;

    @Prop({ type: Number, default: 5 })
    maxBookingsPerDay: number;

    @Prop({
        type: String,
        enum: VALID_APPOINTMENT_PLATFORMS,
        default: APPOINTMENT_PLATFORMS.ZOOM,
    })
    preferredPlatform: string;
}

export const AvailabilitySchema =
    SchemaFactory.createForClass(Availability);
