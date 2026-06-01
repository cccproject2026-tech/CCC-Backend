import { IsString, IsNotEmpty, IsArray, ValidateNested, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

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

    @IsBoolean()
    required: boolean;

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
