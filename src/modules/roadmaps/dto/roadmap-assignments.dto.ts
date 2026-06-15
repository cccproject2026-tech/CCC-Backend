import { IsArray, ArrayMinSize, IsMongoId } from 'class-validator';

export class RemoveRoadmapAssignmentsDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsMongoId({ each: true })
    userIds: string[];
}

export class RoadmapAssignmentResponseDto {
    assignmentId?: string;
    userId: string;
    pastorName: string;
    email: string;
    profilePicture: string;
    status: string;
    assignedAt: string;
}

export class RemoveRoadmapAssignmentsResponseDto {
    removedUserIds: string[];
}
