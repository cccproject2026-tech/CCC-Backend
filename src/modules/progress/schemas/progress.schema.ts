import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { VALID_PROGRESS_STATUSES, PROGRESS_STATUSES } from '../../../common/constants/status.constants';
import { calculateProgress } from '../utils/progress-calculator';

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
