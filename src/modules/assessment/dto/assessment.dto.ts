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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VALID_ASSESSMENT_TYPES } from '../../../common/constants/status.constants';
import { Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';

/** Read assessment type from the raw JSON before nested `preSurvey[].type` transforms run. */
const assessmentTypeFromBody = ({ obj, value }: { obj?: Record<string, unknown>; value?: unknown }) => {
  const raw = value ?? obj?.type ?? obj?.assessmentType;
  return typeof raw === 'string' ? raw.trim() : raw;
};

export class ChoiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class RecommendationLevelDto {

  @ApiProperty()
  @IsNotEmpty()
  level: number;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  items: string[];

}

export class LayerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  choices?: ChoiceDto[];
}

export class PreSurveyQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty()
  @IsString()
  @IsIn(['text', 'number', 'date', 'select'])
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeholder?: string;

  @ApiProperty()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  required: boolean;
}

export class SectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayerDto)
  layers: LayerDto[];

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationLevelDto)
  recommendations: RecommendationLevelDto[];
}

export class CreateAssessmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  instructions?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bannerImage?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  roadmapId: string;

  @ApiProperty()
  @IsString()
  @IsIn(VALID_ASSESSMENT_TYPES)
  type: string;

  @ApiPropertyOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreSurveyQuestionDto)
  @IsOptional()
  preSurvey?: PreSurveyQuestionDto[];

  @ApiProperty()
  @IsArray()
  sections: SectionDto[];
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  instructions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(assessmentTypeFromBody)
  @IsString()
  @IsIn(VALID_ASSESSMENT_TYPES)
  type?: string;

  /** Legacy alias; prefer `type`. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = value ?? obj?.assessmentType ?? obj?.type;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsString()
  @IsIn(VALID_ASSESSMENT_TYPES)
  assessmentType?: string;

  /** Replaces the full pre-survey question list. Send `[]` to clear when pre-survey is disabled. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreSurveyQuestionDto)
  preSurvey?: PreSurveyQuestionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionDto)
  sections?: SectionDto[];
}

export class SectionRecommendationDto {

  @ApiProperty()
  @IsString()
  sectionTitle: string;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationLevelDto)
  recommendations: RecommendationLevelDto[];

}

export class AssignAssessmentDto {

  @ApiProperty()
  assessmentId: Types.ObjectId;
  @ApiProperty()
  userIds: Types.ObjectId[];
  @ApiProperty()
  assignedBy: Types.ObjectId;
  @ApiPropertyOptional()
  dueDate?: Date;

}

export class SendSectionRecommendationsDto {

  @ApiProperty()
  @IsMongoId()
  userId: string;

  @ApiProperty()
  @IsArray()
  sections: {
    sectionId: string;
    recommendations: string[];
  }[];

}

export class SectionRecommendationRuleDto {

  @ApiProperty()
  @IsMongoId()
  sectionId: string;

  @ApiProperty()
  @IsString()
  sectionTitle: string;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationLevelDto)
  recommendations: RecommendationLevelDto[];

}

export class SectionRecommendationPreviewDto {

  @ApiProperty()
  @IsMongoId()
  sectionId: string;

  @ApiProperty()
  @IsString()
  sectionTitle: string;

  @ApiProperty()
  score: number;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  recommendations: string[];

}
