import {
    IsString,
    IsOptional,
    IsBoolean,
    IsArray,
    IsNumber,
    IsEnum,
    ValidateNested,
    IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VALID_FIELD_TYPES } from '../schemas/interest-form-fields.schema';

export class DynamicFieldDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fieldId: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    label: string;

    @ApiProperty()
    @IsEnum(VALID_FIELD_TYPES)
    type: string;

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
    @IsString({ each: true })
    options?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    order?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    section?: string;
}

export class AddDynamicFieldDto extends DynamicFieldDto {}

export class UpdateDynamicFieldsDto {
    @ApiProperty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DynamicFieldDto)
    fields: DynamicFieldDto[];
}

export class DynamicFieldResponseDto {
    @ApiProperty()
    fieldId: string;
    @ApiProperty()
    label: string;
    @ApiProperty()
    type: string;
    @ApiPropertyOptional()
    placeholder?: string;
    @ApiProperty()
    required: boolean;
    @ApiProperty()
    options: string[];
    @ApiProperty()
    order: number;
    @ApiPropertyOptional()
    section?: string;
}

export class StaticFieldResponseDto {
    @ApiProperty()
    fieldId: string;
    @ApiProperty()
    label: string;
    @ApiProperty()
    type: string;
    @ApiProperty()
    required: boolean;
    @ApiPropertyOptional()
    options?: string[];
    @ApiProperty()
    section: string;
}

export class InterestFormFieldsResponseDto {
    @ApiProperty()
    staticFields: StaticFieldResponseDto[];
    @ApiProperty()
    dynamicFields: DynamicFieldResponseDto[];
}

export class DynamicFieldsConfigResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    fields: DynamicFieldResponseDto[];
    @ApiProperty()
    updatedAt: Date;
}
