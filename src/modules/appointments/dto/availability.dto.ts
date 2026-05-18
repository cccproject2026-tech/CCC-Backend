import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_APPOINTMENT_PLATFORMS } from 'src/common/constants/status.constants';

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
    @IsNumber()
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

/** Patch mentor-level booking rules (duration, notice, caps, platform). Send at least one field. */
export class UpdateMentorAvailabilitySettingsDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(15)
    @Max(480)
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
