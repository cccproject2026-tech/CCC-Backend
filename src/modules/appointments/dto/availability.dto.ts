import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_APPOINTMENT_PLATFORMS } from 'src/common/constants/status.constants';
import { CCC_ALLOWED_MEETING_DURATION_MINUTES } from '../booking-rules.constants';

const SLOT_TIME_REGEX = /^(0?[1-9]|1[0-2]):00$/;

export class TimeSlotDto {
    @IsString()
    startTime!: string;

    @IsEnum(['AM', 'PM'])
    startPeriod!: 'AM' | 'PM';

    @IsString()
    endTime!: string;

    @IsEnum(['AM', 'PM'])
    endPeriod!: 'AM' | 'PM';
}

export class DayAvailabilityDto {
    // @IsNumber()
    // day: number;

    @IsString()
    date!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TimeSlotDto)
    slots!: TimeSlotDto[];
}

export class AvailabilityDto {
    @IsString()
    mentorId!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DayAvailabilityDto)
    weeklySlots!: DayAvailabilityDto[];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsIn([...CCC_ALLOWED_MEETING_DURATION_MINUTES], {
        message: 'meetingDuration must be one of the allowed durations (currently 30 or 60 minutes).',
    })
    meetingDuration?: number;

    @IsOptional()
    @IsNumber()
    minSchedulingNoticeHours?: number;

    @IsOptional()
    @IsNumber()
    maxBookingsPerDay?: number;

    @IsOptional()
    @IsIn(VALID_APPOINTMENT_PLATFORMS)
    preferredPlatform?: string;
}

export class DeleteAvailabilitySlotDto {
    @IsMongoId({ message: 'slotId must be a valid Mongo ObjectId.' })
    slotId!: string;

    @IsOptional()
    @IsDateString()
    date?: string;
}

/** Single calendar day (YYYY-MM-DD) for block. */
export class MentorAvailabilityDayDto {
    @IsDateString()
    date!: string;
}

/** Re-open a day with user-defined hours (one or more windows per day). */
export class OpenMentorDayDto {
    @IsDateString()
    date!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => TimeSlotDto)
    slots!: TimeSlotDto[];
}

/**
 * Saves a repeating weekly master from one concrete week of selections.
 * Each `templateWeeklySlots[].date` weekday is extracted; overlapping dates for the same weekday merge windows.
 */
export class CreateRecurringAvailabilityDto {
    @IsMongoId()
    mentorId!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DayAvailabilityDto)
    templateWeeklySlots!: DayAvailabilityDto[];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(7)
    @Max(120)
    horizonDays?: number;

    /** When true, clears exception/suppression lists before materializing so all days follow the new template only. */
    @IsOptional()
    @IsBoolean()
    clearPersonalizations?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsIn([...CCC_ALLOWED_MEETING_DURATION_MINUTES], {
        message: 'meetingDuration must be one of the allowed durations (currently 30 or 60 minutes).',
    })
    meetingDuration?: number;

    @IsOptional()
    @IsNumber()
    minSchedulingNoticeHours?: number;

    @IsOptional()
    @IsNumber()
    maxBookingsPerDay?: number;

    @IsOptional()
    @IsIn(VALID_APPOINTMENT_PLATFORMS)
    preferredPlatform?: string;
}

/** Upsert slots for exactly one UTC calendar day — marks date as recurring exception (immune to template refresh). */
export class UpsertSingleDayAvailabilityDto {
    @IsDateString()
    date!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => TimeSlotDto)
    slots!: TimeSlotDto[];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsIn([...CCC_ALLOWED_MEETING_DURATION_MINUTES], {
        message: 'meetingDuration must be one of the allowed durations (currently 30 or 60 minutes).',
    })
    meetingDuration?: number;

    @IsOptional()
    @IsNumber()
    minSchedulingNoticeHours?: number;

    @IsOptional()
    @IsNumber()
    maxBookingsPerDay?: number;

    @IsOptional()
    @IsIn(VALID_APPOINTMENT_PLATFORMS)
    preferredPlatform?: string;
}

/** Patch mentor-level booking rules (duration, notice, caps, platform). Send at least one field. */
export class UpdateMentorAvailabilitySettingsDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsIn([...CCC_ALLOWED_MEETING_DURATION_MINUTES], {
        message: 'meetingDuration must be one of the allowed durations (currently 30 or 60 minutes).',
    })
    meetingDuration?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(168)
    minSchedulingNoticeHours?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    maxBookingsPerDay?: number;

    @IsOptional()
    @IsIn(VALID_APPOINTMENT_PLATFORMS)
    preferredPlatform?: string;
}
