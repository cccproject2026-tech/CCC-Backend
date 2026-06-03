import { IsString, IsNotEmpty, IsArray, ValidateNested, IsIn, IsBoolean, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PreSurveyAnswerDto {
    @IsString()
    @IsNotEmpty()
    questionText: string;

    @IsNotEmpty()
    answer: string | number | boolean;
}

export class SubmitPreSurveyDto {
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PreSurveyAnswerDto)
    preSurveyAnswers: PreSurveyAnswerDto[];
}

export class PreSurveyQuestionDto {
    @IsString()
    text: string;

    @IsIn(['text', 'number', 'date', 'select'])
    type: string;

    @Transform(({ value }) => {
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        return value;
    })
    @IsBoolean()
    required: boolean;

    @IsOptional()
    @IsString()
    placeholder?: string;
}

export class UpdatePreSurveyDto {
    /** Full replacement list; send `[]` to clear pre-survey questions. */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PreSurveyQuestionDto)
    preSurvey: PreSurveyQuestionDto[];
}
