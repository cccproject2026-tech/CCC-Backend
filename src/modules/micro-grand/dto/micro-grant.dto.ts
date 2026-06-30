import {
  IsString,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsOptional,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VALID_USER_APPLICATION_STATUSES } from '../../../common/constants/status.constants';

export class FieldDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  options?: string[];
}

export class SectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  section_title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  section_intro?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportingProcedure?: string;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  fields: FieldDto[];
}


export class CreateOrUpdateFormDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionDto)
  sections: SectionDto[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reportingProcedure?: string;
}

export class ApplyMicroGrantDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @ApiProperty()
  @IsNotEmpty()
  answers: any;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supportingDoc?: string;
}

export class UpdateApplicationStatusDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEnum(VALID_USER_APPLICATION_STATUSES, {
    message: `Status must be one of: ${VALID_USER_APPLICATION_STATUSES.join(', ')}`,
  })
  status: string;
}
