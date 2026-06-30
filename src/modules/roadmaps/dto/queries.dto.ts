import { IsString, IsNotEmpty, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PopulatedUserResponseDto } from './populated-response.dto';

export class CreateQueryDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    actualQueryText: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    userId: string;

    /** Scoped to a nested roadmap task; recommended for pastor/mentor task views. */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    nestedRoadMapItemId?: string;
}

export class ReplyQueryDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    repliedAnswer: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    repliedMentorId: string;
}

/** Pastor updates own query text; userId must match the thread owner. */
export class UpdateQueryDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    userId: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    actualQueryText: string;
}

export class QueryItemResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    actualQueryText: string;
    @ApiProperty()
    createdDate: Date;
    @ApiPropertyOptional()
    repliedAnswer?: string;
    @ApiPropertyOptional()
    repliedDate?: Date;
    @ApiPropertyOptional({ type: () => PopulatedUserResponseDto })
    repliedMentorId?: PopulatedUserResponseDto;
    @ApiProperty({ enum: ['pending', 'answered'] })
    status: 'pending' | 'answered';
    @ApiPropertyOptional({ nullable: true })
    nestedRoadMapItemId?: string | null;
}

export class QueriesThreadResponseDto {
    @ApiProperty()
    _id: string;
    @ApiProperty()
    userId: string;
    @ApiProperty()
    roadMapId: string;
    @ApiProperty({ type: [QueryItemResponseDto] })
    queries: QueryItemResponseDto[];
    // createdAt: Date;
    // updatedAt: Date;
}
