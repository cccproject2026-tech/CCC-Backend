import { IsString, IsNotEmpty, IsOptional, IsMongoId } from 'class-validator';
import { PopulatedUserResponseDto } from './populated-response.dto';

export class AddCommentDto {
    @IsNotEmpty()
    @IsString()
    text: string;

    @IsNotEmpty()
    @IsString()
    userId: string;

    @IsNotEmpty()
    @IsString()
    mentorId: string;

    /** Nested roadmap task id (preferred). */
    @IsOptional()
    @IsMongoId()
    nestedRoadMapItemId?: string;

    /** Alias for nestedRoadMapItemId (frontend may send either). */
    @IsOptional()
    @IsMongoId()
    taskId?: string;
}

export class CommentItemResponseDto {
    _id: string;
    mentorId: PopulatedUserResponseDto;
    text: string;
    addedDate: Date;
    /** Present when comment belongs to a nested task; omitted/null for legacy roadmap-level comments. */
    nestedRoadMapItemId?: string | null;
    /** Same value as nestedRoadMapItemId for frontend convenience. */
    taskId?: string | null;
}

export class CommentsThreadResponseDto {
    _id: string;
    userId: string;
    roadMapId: string;
    comments: CommentItemResponseDto[];
    // createdAt: Date;
    // updatedAt: Date;
}