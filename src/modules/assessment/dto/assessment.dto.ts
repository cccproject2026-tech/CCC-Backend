import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { VALID_ASSESSMENT_TYPES } from '../../../common/constants/status.constants';
import { Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';

/** Read assessment type from the raw JSON before nested `preSurvey[].type` transforms run. */
const assessmentTypeFromBody = ({ obj, value }: { obj?: Record<string, unknown>; value?: unknown }) => {
  const raw = value ?? obj?.type ?? obj?.assessmentType;
  return typeof raw === 'string' ? raw.trim() : raw;
};

export class ChoiceDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class RecommendationLevelDto {

  @IsNotEmpty()
  level: number;

  @IsArray()
  @IsString({ each: true })
  items: string[];

}

export class LayerDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsArray()
  @IsOptional()
  choices?: ChoiceDto[];
}

export class PreSurveyQuestionDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsIn(['text', 'number', 'date', 'select'])
  type: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  required: boolean;
}

export class SectionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayerDto)
  layers: LayerDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationLevelDto)
  recommendations: RecommendationLevelDto[];
}

export class CreateAssessmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsOptional()
  instructions?: string[];

  @IsString()
  @IsOptional()
  bannerImage?: string;

  @IsString()
  @IsOptional()
  roadmapId: string;

  @IsString()
  @IsIn(VALID_ASSESSMENT_TYPES)
  type: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreSurveyQuestionDto)
  @IsOptional()
  preSurvey?: PreSurveyQuestionDto[];

  @IsArray()
  sections: SectionDto[];
}

export class UpdateAssessmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  instructions?: string[];

  @IsOptional()
  @Transform(assessmentTypeFromBody)
  @IsString()
  @IsIn(VALID_ASSESSMENT_TYPES)
  type?: string;

  /** Legacy alias; prefer `type`. */
  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = value ?? obj?.assessmentType ?? obj?.type;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsString()
  @IsIn(VALID_ASSESSMENT_TYPES)
  assessmentType?: string;

  /** Replaces the full pre-survey question list. Send `[]` to clear when pre-survey is disabled. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreSurveyQuestionDto)
  preSurvey?: PreSurveyQuestionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionDto)
  sections?: SectionDto[];
}

export class SectionRecommendationDto {

  @IsString()
  sectionTitle: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationLevelDto)
  recommendations: RecommendationLevelDto[];

}

export class AssignAssessmentDto {

  assessmentId: Types.ObjectId;
  userIds: Types.ObjectId[];
  assignedBy: Types.ObjectId;
  dueDate?: Date;

}

export class SendSectionRecommendationsDto {

  @IsMongoId()
  userId: string;

  @IsArray()
  sections: {
    sectionId: string;
    recommendations: string[];
  }[];

}

export class SectionRecommendationRuleDto {

  @IsMongoId()
  sectionId: string;

  @IsString()
  sectionTitle: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationLevelDto)
  recommendations: RecommendationLevelDto[];

}

export class SectionRecommendationPreviewDto {

  @IsMongoId()
  sectionId: string;

  @IsString()
  sectionTitle: string;

  score: number;

  @IsArray()
  @IsString({ each: true })
  recommendations: string[];

}