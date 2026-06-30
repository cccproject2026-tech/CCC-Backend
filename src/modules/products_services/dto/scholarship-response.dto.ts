import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AwardedUserResponseDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  awardedDate: Date;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  academicYear?: string;

  @ApiProperty()
  @IsString()
  awardStatus: string;
}

export class ScholarshipResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsEnum(['active', 'inactive'])
  status: string;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardedUserResponseDto)
  awardedList: AwardedUserResponseDto[];

  @ApiProperty()
  @IsNumber()
  numberOfAwards: number;

  @ApiProperty()
  @IsNumber()
  totalAmount: number;

  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
}
