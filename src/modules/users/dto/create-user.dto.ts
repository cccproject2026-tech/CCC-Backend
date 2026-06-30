import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsEnum, IsMongoId, IsBoolean, IsString, IsDate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ROLES } from '../../../common/constants/roles.constants';
import { USER_STATUSES } from '../../../common/constants/status.constants';
import { VALID_GOOGLE_CALENDAR_STATUSES } from '../../../common/constants/google-calendar.constants';

const VALID_ROLES = Object.values(ROLES);
const VALID_USER_STATUSES_ARRAY = Object.values(USER_STATUSES);

export class CreateUserDto {
    @ApiProperty()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiPropertyOptional()
    @IsOptional()
    username?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @MinLength(6)
    password?: string;

    @ApiPropertyOptional({ enum: VALID_ROLES, example: ROLES.PASTOR })
    @IsOptional()
    @IsEnum(VALID_ROLES)
    role?: string;

    @ApiPropertyOptional({ enum: VALID_USER_STATUSES_ARRAY, example: USER_STATUSES.PENDING })
    @IsOptional()
    @IsEnum(VALID_USER_STATUSES_ARRAY)
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    interestId?: Types.ObjectId;

    @ApiPropertyOptional()
    @IsOptional()
    profilePicture?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isEmailVerified?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    emailVerifiedAt?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isPasswordSet?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    passwordCreatedAt?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    zoomUserId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleAccessToken?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleRefreshToken?: string;

    @ApiPropertyOptional()
    @IsOptional()
    googleTokenExpiry?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleCalendarId?: string;

    @ApiPropertyOptional({ enum: VALID_GOOGLE_CALENDAR_STATUSES })
    @IsOptional()
    @IsEnum(VALID_GOOGLE_CALENDAR_STATUSES)
    googleCalendarStatus?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    googleCalendarConnectedAt?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    googleCalendarLastSyncAt?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleCalendarEmail?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    googleCalendarLastError?: string | null;
}
