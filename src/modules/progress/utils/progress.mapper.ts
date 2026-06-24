import { Types } from 'mongoose';
import { ProgressDocument } from '../schemas/progress.schema';

class NestedRoadmapProgressDto {
    nestedRoadmapId: Types.ObjectId;
    completedSteps: number;
    totalSteps: number;
    progressPercentage: number;
    status: string;
}

class ProgressRoadmapDto {
    roadMapId: Types.ObjectId;
    completedSteps: number;
    totalSteps: number;
    progressPercentage: number;
    status: string;
    assignedAt?: Date;
    assignedBy?: Types.ObjectId;
    dueDate?: Date;
    nestedRoadmaps: NestedRoadmapProgressDto[];
}

class ProgressAssessmentDto {
    assessmentId: Types.ObjectId;
    completedSections: number;
    totalSections: number;
    progressPercentage: number;
    status: string;
}

class FinalCommentDto {
    _id: Types.ObjectId;
    commentorId: Types.ObjectId;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
}

export class ProgressResponseDto {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    roadmaps: ProgressRoadmapDto[];
    totalRoadmaps: number;
    completedRoadmaps: number;
    overallRoadmapProgress: number;
    assessments: ProgressAssessmentDto[];
    totalAssessments: number;
    completedAssessments: number;
    overallAssessmentProgress: number;
    totalItems: number;
    completedItems: number;
    overallProgress: number;
    overallCompleted: boolean;
    finalComments: FinalCommentDto[];
    // createdAt: Date;
    // updatedAt: Date;
}

export class BulkUserProgressDto {
    userId: string;
    roadmapProgressPercent: number;
    roadmaps?: ProgressRoadmapDto[];
    failed?: boolean;
    error?: string;
}

export type BulkUserProgressMap = Record<string, BulkUserProgressDto>;

export function toBulkUserProgressDto(
    progress: ProgressResponseDto | null,
    userId: string,
): BulkUserProgressDto {
    if (!progress) {
        return {
            userId,
            roadmapProgressPercent: 0,
            roadmaps: [],
        };
    }

    return {
        userId,
        roadmapProgressPercent: progress.overallRoadmapProgress,
        roadmaps: progress.roadmaps,
    };
}

export class UserOverallProgressDto {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    profilePicture?: string;
    totalRoadmaps: number;
    completedRoadmaps: number;
    overallRoadmapProgress: number;
    totalAssessments: number;
    completedAssessments: number;
    overallAssessmentProgress: number;
    totalItems: number;
    completedItems: number;
    overallProgress: number;
    overallCompleted: boolean;
}

export class MonthlyCompletionDto {
    month: number;
    year: number;
    monthName: string;
    mentorsCompleted: number;
    pastorsCompleted: number;
}

export class DirectorOverviewDto {
    totalMentors: number;
    completedMentors: number;
    mentorsOverallProgress: number;

    totalPastors: number;
    completedPastors: number;
    pastorsOverallProgress: number;

    totalUsers: number;
    completedUsers: number;
    overallCombinedProgress: number;

    monthlyData: MonthlyCompletionDto[];

    users?: UserOverallProgressDto[];
}

export function toProgressResponseDto(doc: ProgressDocument): ProgressResponseDto {
    return {
        _id: doc._id,
        userId: doc.userId,
        roadmaps: doc.roadmaps.map(r => ({
            roadMapId: r.roadMapId,
            completedSteps: r.completedSteps,
            totalSteps: r.totalSteps,
            progressPercentage: r.progressPercentage,
            status: r.status,
            assignedAt: r.assignedAt ?? undefined,
            assignedBy: r.assignedBy ?? undefined,
            dueDate: r.dueDate ?? undefined,
            nestedRoadmaps: (r.nestedRoadmaps || []).map(nested => ({
                nestedRoadmapId: nested.nestedRoadmapId,
                completedSteps: nested.completedSteps,
                totalSteps: nested.totalSteps,
                progressPercentage: nested.progressPercentage,
                status: nested.status,
            })),
        })),
        totalRoadmaps: doc.totalRoadmaps,
        completedRoadmaps: doc.completedRoadmaps,
        overallRoadmapProgress: doc.overallRoadmapProgress,
        assessments: doc.assessments.map(a => ({
            assessmentId: a.assessmentId,
            completedSections: a.completedSections,
            totalSections: a.totalSections,
            progressPercentage: a.progressPercentage,
            status: a.status,
        })),
        totalAssessments: doc.totalAssessments,
        completedAssessments: doc.completedAssessments,
        overallAssessmentProgress: doc.overallAssessmentProgress,
        totalItems: doc.totalItems,
        completedItems: doc.completedItems,
        overallProgress: doc.overallProgress,
        overallCompleted: doc.overallCompleted || false,
        finalComments: (doc.finalComments || []).map(c => ({
            _id: c._id,
            commentorId: c.commentorId,
            comment: c.comment,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        })),
        // createdAt: doc.createdAt,
        // updatedAt: doc.updatedAt,
    };
}