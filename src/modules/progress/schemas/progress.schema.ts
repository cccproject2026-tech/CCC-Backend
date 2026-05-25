import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { VALID_PROGRESS_STATUSES, PROGRESS_STATUSES } from '../../../common/constants/status.constants';

export type ProgressDocument = Document<unknown, {}, Progress> & Progress & {
    _id: Types.ObjectId;
};
@Schema({ timestamps: true })
export class Progress {
    @Prop({ type: Types.ObjectId, ref: "User", required: true })
    userId: Types.ObjectId;

    @Prop([
        {
            _id: false,
            roadMapId: { type: Types.ObjectId, ref: "RoadMap", required: true },
            completedSteps: { type: Number, default: 0 },
            totalSteps: { type: Number, default: 0 },
            progressPercentage: { type: Number, default: 0 },
            status: {
                type: String,
                enum: VALID_PROGRESS_STATUSES,
                default: PROGRESS_STATUSES.NOT_STARTED,
            },
            assignedAt: { type: Date, default: Date.now },
            assignedBy: { type: Types.ObjectId, ref: "User", default: null },
            dueDate: { type: Date, default: null },
            nestedRoadmaps: {
                type: [{
                    _id: false,
                    nestedRoadmapId: { type: Types.ObjectId, required: true },
                    completedSteps: { type: Number, default: 0 },
                    totalSteps: { type: Number, default: 0 },
                    progressPercentage: { type: Number, default: 0 },
                    status: {
                        type: String,
                        enum: VALID_PROGRESS_STATUSES,
                        default: PROGRESS_STATUSES.NOT_STARTED,
                    },
                }],
                default: []
            },
        },
    ])
    roadmaps: {
        roadMapId: Types.ObjectId;
        completedSteps: number;
        totalSteps: number;
        progressPercentage: number;
        status: string;
        assignedAt?: Date;
        assignedBy?: Types.ObjectId;
        dueDate?: Date;
        nestedRoadmaps: {
            nestedRoadmapId: Types.ObjectId;
            completedSteps: number;
            totalSteps: number;
            progressPercentage: number;
            status: string;
        }[];
    }[];

    @Prop({ type: Number, default: 0 })
    totalRoadmaps: number;

    @Prop({ type: Number, default: 0 })
    completedRoadmaps: number;

    @Prop({ type: Number, default: 0 })
    overallRoadmapProgress: number;

    @Prop([
        {
            _id: false,
            assessmentId: { type: Types.ObjectId, ref: "Assessment", required: true },
            completedSections: { type: Number, default: 0 },
            totalSections: { type: Number, default: 0 },
            progressPercentage: { type: Number, default: 0 },
            status: {
                type: String,
                enum: VALID_PROGRESS_STATUSES.filter(s => s !== PROGRESS_STATUSES.DUE),
                default: PROGRESS_STATUSES.NOT_STARTED,
            },
        },
    ])
    assessments: {
        assessmentId: Types.ObjectId;
        completedSections: number;
        totalSections: number;
        progressPercentage: number;
        status: string;
    }[];

    @Prop({ type: Number, default: 0 })
    totalAssessments: number;

    @Prop({ type: Number, default: 0 })
    completedAssessments: number;

    @Prop({ type: Number, default: 0 })
    overallAssessmentProgress: number;

    @Prop({ type: Number, default: 0 })
    totalItems: number;

    @Prop({ type: Number, default: 0 })
    completedItems: number;

    @Prop({ type: Number, default: 0 })
    overallProgress: number;

    @Prop({ type: Boolean, default: false })
    overallCompleted: boolean;

    @Prop([
        {
            commentorId: { type: Types.ObjectId, ref: "User", required: true },
            comment: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now },
        },
    ])
    finalComments: {
        _id: Types.ObjectId;
        commentorId: Types.ObjectId;
        comment: string;
        createdAt: Date;
        updatedAt: Date;
    }[];
}

export const ProgressSchema = SchemaFactory.createForClass(Progress);

// Helper function to calculate progress (used by both save and findOneAndUpdate hooks)
function calculateProgress(doc: any) {
    let totalRoadmapPercent = 0;
    let totalAssessmentPercent = 0;

    // --- Roadmaps ---
    let completedRoadmaps = 0;
    doc.roadmaps.forEach((r: any) => {
        // Calculate nested roadmap progress first
        let hasNestedInProgress = false;
        let hasNestedCompleted = false;
        let allNestedCompleted = true;

        if (r.nestedRoadmaps && r.nestedRoadmaps.length > 0) {
            r.nestedRoadmaps.forEach((nested: any) => {
                // Calculate nested progress percentage
                if (nested.totalSteps > 0)
                    nested.progressPercentage = Math.min((nested.completedSteps / nested.totalSteps) * 100, 100);
                else nested.progressPercentage = 0;

                // Automatically update nested status based on progress
                if (nested.progressPercentage >= 100) {
                    nested.status = PROGRESS_STATUSES.COMPLETED;
                    hasNestedCompleted = true;
                } else if (nested.progressPercentage > 0) {
                    nested.status = PROGRESS_STATUSES.IN_PROGRESS;
                    hasNestedInProgress = true;
                    allNestedCompleted = false;
                } else {
                    nested.status = PROGRESS_STATUSES.NOT_STARTED;
                    allNestedCompleted = false;
                }
            });
        }

        // Calculate main roadmap progress percentage
        if (r.totalSteps > 0)
            r.progressPercentage = Math.min((r.completedSteps / r.totalSteps) * 100, 100);
        else r.progressPercentage = 0;

        // Automatically update main roadmap status based on progress and nested roadmaps
        if (r.progressPercentage >= 100) {
            r.status = PROGRESS_STATUSES.COMPLETED;
        } else if (r.progressPercentage > 0 || hasNestedInProgress || hasNestedCompleted) {
            // Main roadmap is IN_PROGRESS if:
            // - Its own completedSteps > 0, OR
            // - Any nested roadmap is IN_PROGRESS, OR
            // - Any nested roadmap is COMPLETED (but not all)
            r.status = PROGRESS_STATUSES.IN_PROGRESS;
        } else {
            r.status = PROGRESS_STATUSES.NOT_STARTED;
        }

        totalRoadmapPercent += r.progressPercentage;
        if (r.status === PROGRESS_STATUSES.COMPLETED) completedRoadmaps++;
    });

    doc.totalRoadmaps = doc.roadmaps.length;
    doc.completedRoadmaps = completedRoadmaps;
    doc.overallRoadmapProgress =
        doc.roadmaps.length > 0
            ? parseFloat((totalRoadmapPercent / doc.roadmaps.length).toFixed(2))
            : 0;

    // --- Assessments ---
    let completedAssessments = 0;
    doc.assessments.forEach((a: any) => {
        // Calculate progress percentage
        if (a.totalSections > 0)
            a.progressPercentage = Math.min((a.completedSections / a.totalSections) * 100, 100);
        else a.progressPercentage = 0;

        // Automatically update status based on progress
        if (a.progressPercentage >= 100) a.status = PROGRESS_STATUSES.COMPLETED;
        else if (a.progressPercentage > 0) a.status = PROGRESS_STATUSES.IN_PROGRESS;
        else a.status = PROGRESS_STATUSES.NOT_STARTED;

        totalAssessmentPercent += a.progressPercentage;
        if (a.status === PROGRESS_STATUSES.COMPLETED) completedAssessments++;
    });

    doc.totalAssessments = doc.assessments.length;
    doc.completedAssessments = completedAssessments;
    doc.overallAssessmentProgress =
        doc.assessments.length > 0
            ? parseFloat((totalAssessmentPercent / doc.assessments.length).toFixed(2))
            : 0;

    // --- Overall Progress (Combined Roadmaps + Assessments) ---
    doc.totalItems = doc.totalRoadmaps + doc.totalAssessments;
    doc.completedItems = doc.completedRoadmaps + doc.completedAssessments;

    // Calculate overall progress as weighted average of roadmap and assessment progress
    if (doc.totalItems > 0) {
        const roadmapWeight = doc.totalRoadmaps / doc.totalItems;
        const assessmentWeight = doc.totalAssessments / doc.totalItems;

        doc.overallProgress = parseFloat(
            (
                (doc.overallRoadmapProgress * roadmapWeight) +
                (doc.overallAssessmentProgress * assessmentWeight)
            ).toFixed(2)
        );
    } else {
        doc.overallProgress = 0;
    }
    doc.overallCompleted = doc.overallProgress >= 100;
}

// Pre-save hook (for .create() and .save() operations)
ProgressSchema.pre<ProgressDocument>("save", function (next) {
    calculateProgress(this);
    next();
});

// // Post-save hook to update user's hasCompleted
// ProgressSchema.post<ProgressDocument>("save", async function (doc) {
//     if (doc.overallCompleted) {
//         const db = doc.collection.conn.db;
//         if (db) {
//             await db.collection('users').updateOne(
//                 { _id: doc.userId },
//                 { $set: { hasCompleted: true } }
//             );
//         }
//     }
// });

// OPTIMIZED: Use updateOne instead of save() to prevent double writes
ProgressSchema.post("findOneAndUpdate", async function (doc) {
    if (doc) {
        calculateProgress(doc);
        await doc.collection.updateOne(
            { _id: doc._id },
            {
                $set: {
                    roadmaps: doc.roadmaps,
                    assessments: doc.assessments,
                    totalRoadmaps: doc.totalRoadmaps,
                    completedRoadmaps: doc.completedRoadmaps,
                    overallRoadmapProgress: doc.overallRoadmapProgress,
                    totalAssessments: doc.totalAssessments,
                    completedAssessments: doc.completedAssessments,
                    overallAssessmentProgress: doc.overallAssessmentProgress,
                    totalItems: doc.totalItems,
                    completedItems: doc.completedItems,
                    overallProgress: doc.overallProgress,
                    overallCompleted: doc.overallCompleted,
                }
            }
        );
    }
});

ProgressSchema.index({ userId: 1 });
ProgressSchema.index({ userId: 1, 'roadmaps.roadMapId': 1 });
ProgressSchema.index({ userId: 1, 'assessments.assessmentId': 1 });
ProgressSchema.index({ userId: 1, 'roadmaps.roadMapId': 1, 'roadmaps.nestedRoadmaps.nestedRoadmapId': 1 });
ProgressSchema.index({ 'roadmaps.roadMapId': 1 });
ProgressSchema.index({ createdAt: 1 });
ProgressSchema.index({ updatedAt: -1 });
ProgressSchema.index({ userId: 1, 'finalComments.createdAt': -1 });
ProgressSchema.index({ 'roadmaps.assignedBy': 1 });
ProgressSchema.index({ 'roadmaps.dueDate': 1 });
