import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateZoomMeetingDto {
    @ApiProperty()
    @IsString()
    topic: string;

    @ApiProperty()
    @IsDateString()
    startTime: string;

    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    timezone?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    agenda?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    hostUserId?: string;
}

export class ZoomMeetingResponseDto {
    @ApiProperty()
    meetingId: string;
    @ApiProperty()
    joinUrl: string;
    @ApiProperty()
    startUrl: string;
    @ApiProperty()
    password: string;
    @ApiProperty()
    hostEmail: string;
    @ApiProperty()
    hostId: string;
    @ApiProperty()
    topic: string;
    @ApiProperty()
    duration: number;
    @ApiProperty()
    timezone: string;
    @ApiProperty()
    startTime: string;
    @ApiProperty()
    createdAt: Date;
}

export class UpdateZoomMeetingDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    topic?: string;

    @ApiPropertyOptional()
    @IsDateString()
    @IsOptional()
    startTime?: string;

    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    agenda?: string;
}
