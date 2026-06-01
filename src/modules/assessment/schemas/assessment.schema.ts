import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  VALID_ASSESSMENT_ASSIGNMENT_STATUSES,
  ASSESSMENT_ASSIGNMENT_STATUSES,
  VALID_ASSESSMENT_TYPES,
} from '../../../common/constants/status.constants';

import type { AssessmentType } from '../../../common/constants/status.constants';

@Schema()
export class Choice {
  @Prop({ required: true })
  text: string;
}
export const ChoiceSchema = SchemaFactory.createForClass(Choice);

@Schema()
export class RecommendationLevel {

  @Prop({ required: true })
  level: number;

  @Prop({ type: [String], default: [] })
  items: string[];

}

export const RecommendationLevelSchema =
  SchemaFactory.createForClass(RecommendationLevel);


@Schema()
export class PreSurveyQuestion {
  @Prop({ required: true })
  text: string;

  @Prop({
    type: String,
    required: true,
    enum: ['text', 'number', 'date', 'select'],
  })
  type: string;

  @Prop()
  placeholder?: string;

  @Prop({ required: true })
  required: boolean;
}

export const PreSurveyQuestionSchema =
  SchemaFactory.createForClass(PreSurveyQuestion);

@Schema()
export class Layer {
  @Prop({ required: true })
  title: string;

  @Prop({ type: [ChoiceSchema], default: [] })
  choices: Choice[];
}
export const LayerSchema = SchemaFactory.createForClass(Layer);

@Schema()
export class AssignTo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  assignedAt: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({
    type: String,
    enum: VALID_ASSESSMENT_ASSIGNMENT_STATUSES,
    default: ASSESSMENT_ASSIGNMENT_STATUSES.ASSIGNED,
  })
  status: string;
}
export const AssignmentSchema = SchemaFactory.createForClass(AssignTo);

@Schema()
export class Section {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [LayerSchema], default: [] })
  layers: Layer[];

  @Prop({ type: [RecommendationLevelSchema], default: [] })
  recommendations: RecommendationLevel[];
}
export const SectionSchema = SchemaFactory.createForClass(Section);

export type AssessmentDocument = Assessment & Document;

@Schema({ timestamps: true })
export class Assessment {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  instructions: string[];

  @Prop()
  bannerImage?: string;

  @Prop({ type: [SectionSchema], default: [] })
  sections: Section[];

  @Prop({ type: [AssignmentSchema], default: [] })
  assignments: AssignTo[];

  @Prop({
    type: String,
    enum: VALID_ASSESSMENT_TYPES,
    required: true,
  })
  type: AssessmentType;

  @Prop({
    type: [PreSurveyQuestionSchema],
    required: false,
    validate: {
      validator: function (this: Assessment, value: any) {
        const arr = Array.isArray(value) ? value : [];
        if (this.type === 'CMA') {
          return value === undefined || value === null || Array.isArray(value);
        }
        return arr.length === 0;
      },
      message: () => 'preSurvey is only allowed for CMA assessments.',
    },
  })
  preSurvey?: PreSurveyQuestion[];
}

export const AssessmentSchema = SchemaFactory.createForClass(Assessment);

AssessmentSchema.index({ 'assignments.status': 1 });
AssessmentSchema.index({ 'userAnswers.userId': 1 });
AssessmentSchema.index({ createdAt: -1 });
AssessmentSchema.index({ 'assignments.userId': 1, 'assignments.status': 1 });
AssessmentSchema.index({ 'assignments.status': 1, createdAt: -1 });
AssessmentSchema.index({ type: 1, createdAt: -1 });
AssessmentSchema.index({ name: 'text', description: 'text', type: 'text' });