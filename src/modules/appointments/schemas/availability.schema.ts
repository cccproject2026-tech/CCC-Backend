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

/** Weekly template keyed by weekday (0=Sunday … 6=Saturday), UTC-aligned with booking dates. */
@Schema({ _id: false })
export class RecurringWeekdayPattern {
    @Prop({ type: Number, required: true, min: 0, max: 6 })
    weekday: number;

    @Prop({ type: [SlotSchema], default: [] })
    rawSlots: Slot[];
}

export const RecurringWeekdayPatternSchema =
    SchemaFactory.createForClass(RecurringWeekdayPattern);

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

    /**
     * How this day's row was produced. Used when refreshing recurring materialization so
     * override rows are preserved and recurring-only rows can be cleared when weekdays drop off the template.
     * `legacy` = created before tagging existed or bulk import; not auto-pruned when the weekday leaves the recurring template.
     */
    @Prop({ type: String, enum: ['recurring', 'override', 'legacy'], required: false })
    generation?: 'recurring' | 'override' | 'legacy';
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

    /** Master repeating schedule (UTC weekdays). Empty when recurring is not configured. */
    @Prop({
        type: [RecurringWeekdayPatternSchema],
        default: [],
    })
    recurringWeeklyPattern?: RecurringWeekdayPattern[];

    /** How far ahead (from UTC today) auto-generated recurring days are refreshed. */
    @Prop({ type: Number, default: 60 })
    recurringHorizonDays?: number;

    /**
     * YYYY-MM-DD dates where recurring materialization produced no row (removed by user /
     * not refilled automatically while the weekday still appears in recurringWeeklyPattern).
     */
    @Prop({ type: [String], default: [] })
    recurringSuppressedDates?: string[];

    /**
     * YYYY-MM-DD dates with custom edits (different raw windows, reopened day, unavailable, etc.);
     * recurring refresh skips these dates.
     */
    @Prop({ type: [String], default: [] })
    recurringExceptionDates?: string[];
}

export const AvailabilitySchema =
    SchemaFactory.createForClass(Availability);
