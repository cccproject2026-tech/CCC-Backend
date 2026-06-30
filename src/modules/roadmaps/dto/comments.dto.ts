import { IsString, IsNotEmpty, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PopulatedUserResponseDto } from './populated-response.dto';

export class AddCommentDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    text: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    userId: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    mentorId: string;

    /** Nested roadmap task id (preferred). */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    nestedRoadMapItemId?: string;

    /** Alias for nestedRoadMapItemId (frontend may send either). */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    taskId?: string;
}

export class CommentItemResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty({ type: () => PopulatedUserResponseDto })
    mentorId: PopulatedUserResponseDto;
    @ApiProperty()
    text: string;
    @ApiProperty()
    addedDate: Date;
    /** Present when comment belongs to a nested task; omitted/null for legacy roadmap-level comments. */
    @ApiPropertyOptional({ nullable: true })
    nestedRoadMapItemId?: string | null;
    /** Same value as nestedRoadMapItemId for frontend convenience. */
    @ApiPropertyOptional({ nullable: true })
    taskId?: string | null;
}

export class CommentsThreadResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    userId: string;
    @ApiProperty()
    roadMapId: string;
    @ApiProperty({ type: [CommentItemResponseDto] })
    comments: CommentItemResponseDto[];
    // createdAt: Date;
    // updatedAt: Date;
}
