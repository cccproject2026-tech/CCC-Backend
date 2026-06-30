import { IsMongoId, IsNumber, IsNotEmpty, Min, IsArray, ArrayMinSize, ArrayMaxSize, IsString, MaxLength, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Types } from 'mongoose';

export class AssignRoadmapDto {
    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    userIds: Types.ObjectId[];

    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    roadMapIds: Types.ObjectId[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    assignedBy?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dueDate?: string;
}

export class AssignAssessmentDto {

    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    userIds: Types.ObjectId[];

    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    assessmentIds: Types.ObjectId[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dueDate?: string;

}

export class UpdateRoadmapProgressDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    roadMapId: Types.ObjectId;

    @ApiProperty()
    @IsNumber()
    @Min(0)
    completedSteps: number;
}

export class UpdateAssessmentProgressDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    assessmentId: Types.ObjectId;

    @ApiProperty()
    @IsNumber()
    @Min(0)
    completedSections: number;
}

export class AddFinalCommentDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    commentorId: Types.ObjectId;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    comment: string;
}

export class UpdateFinalCommentDto extends PartialType(OmitType(AddFinalCommentDto, ['userId', 'commentorId'] as const)) {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    commentId: Types.ObjectId;
}

export class DeleteFinalCommentDto {
    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    userId: Types.ObjectId;

    @ApiProperty()
    @IsMongoId()
    @IsNotEmpty()
    commentId: Types.ObjectId;
}

export const BULK_PROGRESS_MAX_USER_IDS = 100;

export class BulkProgressRequestDto {
    @ApiProperty()
    @IsArray()
    @ArrayMinSize(1, { message: 'userIds must contain at least one user ID' })
    @ArrayMaxSize(BULK_PROGRESS_MAX_USER_IDS, { message: `userIds cannot exceed ${BULK_PROGRESS_MAX_USER_IDS} entries` })
    @IsMongoId({ each: true })
    userIds: Types.ObjectId[];
}
