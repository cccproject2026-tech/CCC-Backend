import { IsMongoId, IsNumber, IsNotEmpty, Min, IsArray, ArrayMinSize, ArrayMaxSize, IsString, MaxLength, IsOptional, IsDateString } from 'class-validator';
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { Types } from 'mongoose';

export class AssignRoadmapDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    userIds: Types.ObjectId[];

    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    roadMapIds: Types.ObjectId[];

    @IsOptional()
    @IsMongoId()
    assignedBy?: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;
}

export class AssignAssessmentDto {

    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    userIds: Types.ObjectId[];

    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assessmentIds: Types.ObjectId[];

    @IsOptional()
    @IsDateString()
    dueDate?: string;

}

export class UpdateRoadmapProgressDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @IsMongoId()
    @IsNotEmpty()
    roadMapId: Types.ObjectId;

    @IsNumber()
    @Min(0)
    completedSteps: number;
}

export class UpdateAssessmentProgressDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @IsMongoId()
    @IsNotEmpty()
    assessmentId: Types.ObjectId;

    @IsNumber()
    @Min(0)
    completedSections: number;
}

export class AddFinalCommentDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @IsMongoId()
    @IsNotEmpty()
    commentorId: Types.ObjectId;

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    comment: string;
}

export class UpdateFinalCommentDto extends PartialType(OmitType(AddFinalCommentDto, ['userId', 'commentorId'] as const)) {
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @IsMongoId()
    @IsNotEmpty()
    commentId: Types.ObjectId;
}

export class DeleteFinalCommentDto {
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @IsMongoId()
    @IsNotEmpty()
    commentId: Types.ObjectId;
}

export const BULK_PROGRESS_MAX_USER_IDS = 100;

export class BulkProgressRequestDto {
    @IsArray()
    @ArrayMinSize(1, { message: 'userIds must contain at least one user ID' })
    @ArrayMaxSize(BULK_PROGRESS_MAX_USER_IDS, { message: `userIds cannot exceed ${BULK_PROGRESS_MAX_USER_IDS} entries` })
    @IsMongoId({ each: true })
    userIds: Types.ObjectId[];
}