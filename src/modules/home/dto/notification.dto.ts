import { IsNotEmpty, IsOptional, IsString, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddNotificationDto {
  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  details: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  module?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceId?: string;
}

export class GetNotificationDto {
  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  role?: string;
}

export class ClearNotificationDto {
  @ApiPropertyOptional()
  @IsMongoId()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  role?: string;
}

export class NotificationItemResponseDto {
  @ApiProperty()
  _id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  details: string;
  @ApiPropertyOptional()
  module?: string;
  @ApiPropertyOptional()
  referenceId?: string;
  @ApiPropertyOptional()
  read?: boolean;
  @ApiPropertyOptional()
  createdAt?: Date;
}

export class NotificationResponseDto {
  @ApiProperty()
  _id: string;

  @ApiPropertyOptional()
  userId?: string;
  @ApiPropertyOptional()
  role?: string;

  @ApiProperty()
  notifications: NotificationItemResponseDto[];

  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
}
