import { IsString, IsEmail, IsBoolean, IsOptional, IsDate, IsMongoId, IsArray, ArrayMinSize, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VALID_GOOGLE_CALENDAR_STATUSES } from '../../../common/constants/google-calendar.constants';

export class FieldMentorInvitationResponseDto {
    @ApiProperty()
    @IsMongoId()
    invitedBy: string;

    @ApiProperty()
    @IsDate()
    invitedAt: Date;

    @ApiProperty()
    @IsString()
    token: string;

    @ApiProperty()
    @IsDate()
    expiresAt: Date;
}

export class UserResponseDto {
    @ApiProperty()
    @IsString()
    id: string;

    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty()
    @IsString()
    firstName: string;

    @ApiProperty()
    @IsString()
    lastName: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    username?: string;

    @ApiProperty()
    @IsString()
    role: string;

    @ApiProperty()
    @IsString()
    roleId: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    profilePicture?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    interestId?: string;

    @ApiProperty()
    @IsString()
    status: string;

    @ApiProperty()
    @IsBoolean()
    isEmailVerified: boolean;

    @ApiProperty()
    @IsBoolean()
    hasCompleted: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDate()
    completedAt?: Date | null;

    @ApiProperty()
    @IsBoolean()
    hasIssuedCertificate: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    certificate?: {
        certificateId: string;
        certificateUrl?: string | null;
        pdfUrl: string;
        issuedAt: Date;
        mentorName?: string | null;
    } | null;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    zoomUserId?: string;

    @ApiPropertyOptional({ enum: VALID_GOOGLE_CALENDAR_STATUSES })
    @IsOptional()
    @IsEnum(VALID_GOOGLE_CALENDAR_STATUSES)
    googleCalendarStatus?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDate()
    googleCalendarConnectedAt?: Date;

    @ApiPropertyOptional()
    @IsOptional()
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

    @ApiProperty()
    @IsDate()
    createdAt: Date;

    @ApiProperty()
    @IsDate()
    updatedAt: Date;

    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assignedId: string[];

    @ApiPropertyOptional({ type: FieldMentorInvitationResponseDto })
    @IsOptional()
    fieldMentorInvitation?: FieldMentorInvitationResponseDto;
}

export class AssignMentorMenteeDto {
    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assignedId: string[];
}

export class RemoveMentorMenteeDto {
    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assignedId: string[];
}
