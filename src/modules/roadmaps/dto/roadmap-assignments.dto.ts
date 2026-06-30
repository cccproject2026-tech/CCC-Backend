import { IsArray, ArrayMinSize, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RemoveRoadmapAssignmentsDto {
    @ApiProperty({ type: [String] })
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    userIds: string[];
}

export class RoadmapAssignmentResponseDto {
    @ApiPropertyOptional()
    assignmentId?: string;
    @ApiProperty()
    userId: string;
    @ApiProperty()
    pastorName: string;
    @ApiProperty()
    email: string;
    @ApiProperty()
    profilePicture: string;
    @ApiProperty()
    status: string;
    @ApiProperty()
    assignedAt: string;
}

export class RemoveRoadmapAssignmentsResponseDto {
    @ApiProperty({ type: [String] })
    removedUserIds: string[];
}
