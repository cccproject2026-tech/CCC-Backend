import { IsString, IsEmail, IsBoolean, IsOptional, IsDate, IsMongoId, IsArray, ArrayMinSize, IsEnum } from 'class-validator';
import { VALID_GOOGLE_CALENDAR_STATUSES } from '../../../common/constants/google-calendar.constants';

export class FieldMentorInvitationResponseDto {
    @IsMongoId()
    invitedBy: string;

    @IsDate()
    invitedAt: Date;

    @IsString()
    token: string;

    @IsDate()
    expiresAt: Date;
}

export class UserResponseDto {
    @IsString()
    id: string;

    @IsEmail()
    email: string;

    @IsString()
    firstName: string;

    @IsString()
    lastName: string;

    @IsString()
    @IsOptional()
    username?: string;

    @IsString()
    role: string;

    @IsString()
    roleId: string;

    @IsString()
    @IsOptional()
    profilePicture?: string;

    @IsString()
    @IsOptional()
    interestId?: string;

    @IsString()
    status: string;

    @IsBoolean()
    isEmailVerified: boolean;

    @IsBoolean()
    hasCompleted: boolean;

    @IsOptional()
    @IsDate()
    completedAt?: Date | null;

    @IsBoolean()
    hasIssuedCertificate: boolean;

    @IsOptional()
    certificate?: {
        certificateId: string;
        certificateUrl?: string | null;
        pdfUrl: string;
        issuedAt: Date;
        mentorName?: string | null;
    } | null;

    @IsString()
    @IsOptional()
    zoomUserId?: string;

    @IsOptional()
    @IsEnum(VALID_GOOGLE_CALENDAR_STATUSES)
    googleCalendarStatus?: string;

    @IsOptional()
    @IsDate()
    googleCalendarConnectedAt?: Date;

    @IsOptional()
    @IsDate()
    googleCalendarLastSyncAt?: Date;

    @IsOptional()
    @IsString()
    googleCalendarEmail?: string;

    @IsOptional()
    @IsString()
    googleCalendarLastError?: string | null;

    @IsDate()
    createdAt: Date;

    @IsDate()
    updatedAt: Date;

    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assignedId: string[];

    @IsOptional()
    fieldMentorInvitation?: FieldMentorInvitationResponseDto;
}

export class AssignMentorMenteeDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assignedId: string[];
}

export class RemoveMentorMenteeDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assignedId: string[];
}