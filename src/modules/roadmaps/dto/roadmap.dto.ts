import { IsString, IsOptional, IsDateString, IsBoolean, IsEnum, IsArray, ArrayMinSize, ValidateNested, IsNumber, IsMongoId, ValidateIf, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export enum ExtraType {
  TEXT_FIELD = 'TEXT_FIELD',
  TEXT_AREA = 'TEXT_AREA',
  TEXT_DISPLAY = 'TEXT_DISPLAY',
  CHECKBOX = 'CHECKBOX',
  UPLOAD = 'UPLOAD',
  DATE_PICKER = 'DATE_PICKER',
  SECTION = 'SECTION',
  ASSESSMENT = 'ASSESSMENT',
  SIGNATURE = 'SIGNATURE',
}

export class TextFieldExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.TEXT_FIELD;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    placeHolder?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class TextAreaExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.TEXT_AREA;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    placeHolder?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class TestDisplayExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.TEXT_DISPLAY;

    @ApiProperty()
    @IsString()
    name: string;
}

export class CheckboxExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.CHECKBOX;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    checkboxLabel?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    haveButton?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;
}

/**
 * Checkbox rows embedded under extras (DATE_PICKER, SECTION, ASSESSMENT) often carry
 * runtime fields (`checked`, etc.) and may omit template-only props; keep full CHECKBOX
 * validation on CheckboxExtraDto for standalone CHECKBOX extras.
 */
export class ExtraCheckboxEntryDto {
    @ApiPropertyOptional({ enum: ExtraType })
    @IsOptional()
    @IsEnum(ExtraType)
    type?: ExtraType.CHECKBOX;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    checkboxLabel?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    checked?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    haveButton?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class UploadExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.UPLOAD;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;
}

export class DatePickerExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.DATE_PICKER;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    date?: string;

    @ApiPropertyOptional({ type: [ExtraCheckboxEntryDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtraCheckboxEntryDto)
    checkboxes?: ExtraCheckboxEntryDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    haveButton?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class AssessmentExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.ASSESSMENT;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty()
    @IsMongoId()
    assessmentId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;

    @ApiPropertyOptional({ type: [ExtraCheckboxEntryDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtraCheckboxEntryDto)
    checkboxes?: ExtraCheckboxEntryDto[];
}

export class SignatureExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.SIGNATURE;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    buttonName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    signatureData?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    signedAt?: string;
}

export class SectionExtraDto {
    @ApiProperty({ enum: ExtraType })
    @IsEnum(ExtraType)
    type: ExtraType.SECTION;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional({ type: [ExtraCheckboxEntryDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtraCheckboxEntryDto)
    checkboxes?: ExtraCheckboxEntryDto[];

    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => Object, {
        discriminator: {
            property: 'type',
            subTypes: [
                { value: TextFieldExtraDto, name: 'TEXT_FIELD' },
                { value: TextAreaExtraDto, name: 'TEXT_AREA' },
                { value: TestDisplayExtraDto, name: 'TEXT_DISPLAY' },
                { value: CheckboxExtraDto, name: 'CHECKBOX' },
                { value: UploadExtraDto, name: 'UPLOAD' },
                { value: DatePickerExtraDto, name: 'DATE_PICKER' },
                { value: AssessmentExtraDto, name: 'ASSESSMENT' },
                { value: SignatureExtraDto, name: 'SIGNATURE' },
                /** Recursive SECTION nesting; omitting this made nested SECTION fall back to `Object` and whitelist strip children. */
                { value: SectionExtraDto, name: 'SECTION' },
            ],
        },
        keepDiscriminatorProperty: true,
    })
    sections?: (
        | TextFieldExtraDto
        | TextAreaExtraDto
        | TestDisplayExtraDto
        | CheckboxExtraDto
        | UploadExtraDto
        | DatePickerExtraDto
        | AssessmentExtraDto
        | SignatureExtraDto
        | SectionExtraDto
    )[];
}


export type ExtraItemDto = TextFieldExtraDto | TextAreaExtraDto | TestDisplayExtraDto | CheckboxExtraDto | UploadExtraDto | DatePickerExtraDto | SectionExtraDto | AssessmentExtraDto | SignatureExtraDto;

export class NestedRoadMapItemDto {

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    readonly _id?: string;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    roadMapDetails?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: ['in progress', 'not started', 'completed'] })
    @IsEnum(['in progress', 'not started', 'completed'])
    @IsOptional()
    status?: 'in progress' | 'not started' | 'completed';

    @ApiProperty()
    @IsString()
    duration: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    startDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    endDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    completedOn?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiPropertyOptional({ type: [Date] })
    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    meetings?: Date[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phase?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    totalSteps?: number;

    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => Object, {
        discriminator: {
            property: 'type',
            subTypes: [
                { value: TextFieldExtraDto, name: 'TEXT_FIELD' },
                { value: TextAreaExtraDto, name: 'TEXT_AREA' },
                { value: TestDisplayExtraDto, name: 'TEXT_DISPLAY' },
                { value: CheckboxExtraDto, name: 'CHECKBOX' },
                { value: UploadExtraDto, name: 'UPLOAD' },
                { value: DatePickerExtraDto, name: 'DATE_PICKER' },
                { value: SectionExtraDto, name: 'SECTION' },
                { value: AssessmentExtraDto, name: 'ASSESSMENT' },
                { value: SignatureExtraDto, name: 'SIGNATURE' },
            ],
        },
        keepDiscriminatorProperty: true,
    })
    extras?: ExtraItemDto[];
}

export class ReorderRoadmapsDto {
    @ApiProperty({ type: [String] })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    orderedRoadmapIds!: string[];
}

export class CreateRoadMapDto {
    @ApiProperty()
    @IsString()
    type: string;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    roadMapDetails?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: ['in progress', 'not started', 'completed'] })
    @IsEnum(['in progress', 'not started', 'completed'])
    @IsOptional()
    status?: 'in progress' | 'not started' | 'completed';

    @ApiProperty()
    @IsString()
    duration: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    startDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    endDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    completedOn?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiPropertyOptional({ type: [Date] })
    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    meetings?: Date[];

    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => Object, {
        discriminator: {
            property: 'type',
            subTypes: [
                { value: TextFieldExtraDto, name: 'TEXT_FIELD' },
                { value: TextAreaExtraDto, name: 'TEXT_AREA' },
                { value: TestDisplayExtraDto, name: 'TEXT_DISPLAY' },
                { value: CheckboxExtraDto, name: 'CHECKBOX' },
                { value: UploadExtraDto, name: 'UPLOAD' },
                { value: DatePickerExtraDto, name: 'DATE_PICKER' },
                { value: SectionExtraDto, name: 'SECTION' },
                { value: AssessmentExtraDto, name: 'ASSESSMENT' },
                { value: SignatureExtraDto, name: 'SIGNATURE' },
            ],
        },
        keepDiscriminatorProperty: true,
    })
    extras?: ExtraItemDto[];

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    divisions?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phase?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    assesmentId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    totalSteps?: number;

    @ApiPropertyOptional({ type: [NestedRoadMapItemDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => NestedRoadMapItemDto)
    roadmaps?: NestedRoadMapItemDto[];
}

export class UpdateRoadMapDto extends PartialType(CreateRoadMapDto) { }

export class UpdateNestedRoadMapItemDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    roadMapDetails?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: ['in progress', 'not started', 'completed'] })
    @IsOptional()
    @IsEnum(['in progress', 'not started', 'completed'])
    status?: 'in progress' | 'not started' | 'completed';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    duration?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    startDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    endDate?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    completedOn?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiPropertyOptional({ type: [Date] })
    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    meetings?: Date[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phase?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    totalSteps?: number;

    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => Object, {
        discriminator: {
            property: 'type',
            subTypes: [
                { value: TextFieldExtraDto, name: 'TEXT_FIELD' },
                { value: TextAreaExtraDto, name: 'TEXT_AREA' },
                { value: TestDisplayExtraDto, name: 'TEXT_DISPLAY' },
                { value: CheckboxExtraDto, name: 'CHECKBOX' },
                { value: UploadExtraDto, name: 'UPLOAD' },
                { value: DatePickerExtraDto, name: 'DATE_PICKER' },
                { value: SectionExtraDto, name: 'SECTION' },
                { value: AssessmentExtraDto, name: 'ASSESSMENT' },
                { value: SignatureExtraDto, name: 'SIGNATURE' },
            ],
        },
        keepDiscriminatorProperty: true,
    })
    extras?: ExtraItemDto[];
}

export class RoadMapResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    type: string;
    @ApiProperty()
    name: string;
    @ApiPropertyOptional()
    roadMapDetails?: string;
    @ApiPropertyOptional()
    description?: string;
    @ApiProperty()
    status: string;
    @ApiPropertyOptional()
    duration?: string;
    @ApiPropertyOptional()
    startDate?: Date;
    @ApiPropertyOptional()
    endDate?: Date;
    @ApiPropertyOptional()
    completedOn?: Date;
    @ApiPropertyOptional()
    imageUrl?: string;
    @ApiPropertyOptional({ type: [Date] })
    meetings?: Date[];
    @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
    extras?: ExtraItemDto[];
    @ApiPropertyOptional({ type: [String] })
    divisions?: string[];
    @ApiProperty()
    haveNextedRoadMaps: boolean;
    @ApiPropertyOptional()
    phase?: string;
    @ApiPropertyOptional()
    assesmentId?: string;
    @ApiPropertyOptional()
    totalSteps?: number;
    @ApiProperty({ type: [NestedRoadMapItemDto] })
    roadmaps: NestedRoadMapItemDto[];
    /** Library order when set via PATCH /roadmaps/reorder */
    @ApiPropertyOptional()
    displayOrder?: number;
    @ApiPropertyOptional()
    createdAt?: Date;
    @ApiPropertyOptional()
    updatedAt?: Date;
}
