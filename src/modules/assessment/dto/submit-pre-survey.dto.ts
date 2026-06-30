import { IsString, IsNotEmpty, IsArray, ValidateNested, IsIn, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { VALID_ASSESSMENT_TYPES } from '../../../common/constants/status.constants';

export class PreSurveyAnswerDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    questionText: string;

    @ApiProperty()
    @IsNotEmpty()
    answer: string | number | boolean;
}

export class SubmitPreSurveyDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PreSurveyAnswerDto)
    preSurveyAnswers: PreSurveyAnswerDto[];
}

export class PreSurveyQuestionDto {
    @ApiProperty()
    @IsString()
    text: string;

    @ApiProperty()
    @IsIn(['text', 'number', 'date', 'select'])
    type: string;

    @ApiProperty()
    @Transform(({ value }) => {
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        return value;
    })
    @IsBoolean()
    required: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    placeholder?: string;
}

export class UpdatePreSurveyDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ obj, value }) => {
        const raw = value ?? obj?.type ?? obj?.assessmentType;
        return typeof raw === 'string' ? raw.trim() : raw;
    })
    @IsString()
    @IsIn(VALID_ASSESSMENT_TYPES)
    type?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ obj, value }) => {
        const raw = value ?? obj?.assessmentType ?? obj?.type;
        return typeof raw === 'string' ? raw.trim() : raw;
    })
    @IsString()
    @IsIn(VALID_ASSESSMENT_TYPES)
    assessmentType?: string;

    /** Full replacement list; send `[]` to clear pre-survey questions. */
    @ApiProperty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PreSurveyQuestionDto)
    preSurvey: PreSurveyQuestionDto[];
}
