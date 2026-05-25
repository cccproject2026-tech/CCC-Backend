import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsEnum, IsMongoId, IsBoolean, IsString, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ROLES } from '../../../common/constants/roles.constants';
import { USER_STATUSES } from '../../../common/constants/status.constants';

const VALID_ROLES = Object.values(ROLES);
const VALID_USER_STATUSES_ARRAY = Object.values(USER_STATUSES);

export class CreateUserDto {
    @IsNotEmpty()
    firstName: string;

    @IsNotEmpty()
    lastName: string;

    @IsEmail()
    email: string;

    @IsOptional()
    username?: string;

    @IsOptional()
    @MinLength(6)
    password?: string;

    @IsOptional()
    @IsEnum(VALID_ROLES)
    role?: string;

    @IsOptional()
    @IsEnum(VALID_USER_STATUSES_ARRAY)
    status?: string;

    @IsOptional()
    @IsMongoId()
    interestId?: Types.ObjectId;

    @IsOptional()
    profilePicture?: string;

    @IsOptional()
    @IsBoolean()
    isEmailVerified?: boolean;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    emailVerifiedAt?: Date;

    @IsOptional()
    @IsBoolean()
    isPasswordSet?: boolean;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    passwordCreatedAt?: Date;

    @IsOptional()
    @IsString()
    zoomUserId?: string;

    @IsOptional()
    @IsString()
    googleAccessToken?: string;

    @IsOptional()
    @IsString()
    googleRefreshToken?: string;

    @IsOptional()
    googleTokenExpiry?: number;

    @IsOptional()
    @IsString()
    googleCalendarId?: string;
}