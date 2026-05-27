import { IsString, IsOptional, IsDateString, IsBoolean, IsEnum, IsArray, ArrayMinSize, ValidateNested, IsNumber, IsMongoId, ValidateIf, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

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
    @IsEnum(ExtraType)
    type: ExtraType.TEXT_FIELD;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    placeHolder?: string;

    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class TextAreaExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.TEXT_AREA;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    placeHolder?: string;

    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class TestDisplayExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.TEXT_DISPLAY;

    @IsString()
    name: string;
}

export class CheckboxExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.CHECKBOX;

    @IsString()
    name: string;

    @IsBoolean()
    haveButton: boolean;

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
    @IsOptional()
    @IsEnum(ExtraType)
    type?: ExtraType.CHECKBOX;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsBoolean()
    checked?: boolean;

    @IsOptional()
    @IsBoolean()
    haveButton?: boolean;

    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class UploadExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.UPLOAD;

    @IsString()
    @IsNotEmpty()
    name: string;
}

export class DatePickerExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.DATE_PICKER;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    date?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtraCheckboxEntryDto)
    checkboxes?: ExtraCheckboxEntryDto[];

    @IsOptional()
    @IsBoolean()
    haveButton?: boolean;

    @IsOptional()
    @IsString()
    buttonName?: string;
}

export class AssessmentExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.ASSESSMENT;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsMongoId()
    assessmentId: string;

    @IsOptional()
    @IsString()
    buttonName?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtraCheckboxEntryDto)
    checkboxes?: ExtraCheckboxEntryDto[];
}

export class SignatureExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.SIGNATURE;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    buttonName?: string;

    @IsOptional()
    @IsString()
    signatureData?: string;

    @IsOptional()
    @IsString()
    signedAt?: string;
}

export class SectionExtraDto {
    @IsEnum(ExtraType)
    type: ExtraType.SECTION;

    @IsString()
    name: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExtraCheckboxEntryDto)
    checkboxes?: ExtraCheckboxEntryDto[];

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

    @IsOptional()
    @IsMongoId()
    readonly _id?: string;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    roadMapDetails?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsEnum(['in progress', 'not started', 'completed'])
    @IsOptional()
    status?: 'in progress' | 'not started' | 'completed';

    @IsString()
    duration: string;

    @IsOptional()
    @IsDateString()
    startDate?: Date;

    @IsOptional()
    @IsDateString()
    endDate?: Date;

    @IsOptional()
    @IsDateString()
    completedOn?: Date;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    meetings?: Date[];

    @IsOptional()
    @IsString()
    phase?: string;

    @IsOptional()
    @IsNumber()
    totalSteps?: number;

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
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    orderedRoadmapIds!: string[];
}

export class CreateRoadMapDto {
    @IsString()
    type: string;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    roadMapDetails?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsEnum(['in progress', 'not started', 'completed'])
    @IsOptional()
    status?: 'in progress' | 'not started' | 'completed';

    @IsString()
    duration: string;

    @IsOptional()
    @IsDateString()
    startDate?: Date;

    @IsOptional()
    @IsDateString()
    endDate?: Date;

    @IsOptional()
    @IsDateString()
    completedOn?: Date;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    meetings?: Date[];

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

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    divisions?: string[];

    @IsOptional()
    @IsString()
    phase?: string;

    @IsOptional()
    @IsMongoId()
    assesmentId?: string;

    @IsOptional()
    @IsNumber()
    totalSteps?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => NestedRoadMapItemDto)
    roadmaps?: NestedRoadMapItemDto[];
}

export class UpdateRoadMapDto extends PartialType(CreateRoadMapDto) { }

export class UpdateNestedRoadMapItemDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    roadMapDetails?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(['in progress', 'not started', 'completed'])
    status?: 'in progress' | 'not started' | 'completed';

    @IsOptional()
    @IsString()
    duration?: string;

    @IsOptional()
    @IsDateString()
    startDate?: Date;

    @IsOptional()
    @IsDateString()
    endDate?: Date;

    @IsOptional()
    @IsDateString()
    completedOn?: Date;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsOptional()
    @IsArray()
    @IsDateString({}, { each: true })
    meetings?: Date[];

    @IsOptional()
    @IsString()
    phase?: string;

    @IsOptional()
    @IsNumber()
    totalSteps?: number;

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
    _id: string;
    type: string;
    name: string;
    roadMapDetails?: string;
    description?: string;
    status: string;
    duration?: string;
    startDate?: Date;
    endDate?: Date;
    completedOn?: Date;
    imageUrl?: string;
    meetings?: Date[];
    extras?: ExtraItemDto[];
    divisions?: string[];
    haveNextedRoadMaps: boolean;
    phase?: string;
    assesmentId?: string;
    totalSteps?: number;
    roadmaps: NestedRoadMapItemDto[];
    /** Library order when set via PATCH /roadmaps/reorder */
    displayOrder?: number;
    createdAt?: Date;
    updatedAt?: Date;
}
