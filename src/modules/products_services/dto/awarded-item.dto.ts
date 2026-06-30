import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AwardedUserDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional()
  user?: any;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  awardedDate: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  academicYear?: string;

  @ApiPropertyOptional()
  @IsEnum(['active', 'completed', 'revoked'])
  @IsOptional()
  awardStatus?: string;
}
