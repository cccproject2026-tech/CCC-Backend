import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Progress, ProgressDocument } from './schemas/progress.schema';
import { RoadMap, RoadMapDocument } from '../roadmaps/schemas/roadmap.schema';
import { Assessment, AssessmentDocument } from '../assessment/schemas/assessment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
    ProgressResponseDto,
    toProgressResponseDto,
    toBulkUserProgressDto,
    BulkUserProgressMap,
    UserOverallProgressDto,
    DirectorOverviewDto,
    MonthlyCompletionDto,
} from './utils/progress.mapper';
import {
    AssignRoadmapDto,
    AssignAssessmentDto,
    UpdateRoadmapProgressDto,
    UpdateAssessmentProgressDto,
    AddFinalCommentDto,
    UpdateFinalCommentDto,
    DeleteFinalCommentDto,
} from './dto/progress.dto';
import { ASSESSMENT_ASSIGNMENT_STATUSES, PROGRESS_STATUSES } from '../../common/constants/status.constants';
import { AssessmentAssigned, AssessmentAssignedDocument } from '../assessment/schemas/assessment_assigned';
import { UserAnswer, UserAnswerDocument } from '../assessment/schemas/answer.schema';
import { MailerService } from '../../common/utils/mail.util';
import { ROLES } from '../../common/constants/roles.constants';
import {
    countCompletedAnswerSections,
    assessmentProgressNeedsUpdate,
    type AnswerSectionSlice,
} from './utils/assessment-progress.util';
import { reconcileProgressAssessments } from './utils/reconcile-progress-assessments';
import {
    buildAssessmentProgressEntries,
    collectAssignedAssessmentIds,
    findMissingAssessmentIds,
} from './utils/sync-assigned-assessments.util';

function resolveAssignedRoadmapSteps(totalSteps?: number, extras?: any[], nestedRoadmaps?: any[]): number {
    if (typeof totalSteps === 'number' && totalSteps > 0) {
        return totalSteps;
    }

    const ownSteps = extras?.length ?? 0;
    const nestedSteps = (nestedRoadmaps || []).reduce(
        (sum: number, nested: any) => sum + (nested.totalSteps && nested.totalSteps > 0 ? nested.totalSteps : ((nested.extras?.length ?? 0) || 1)),
        0
    );

    return ownSteps + nestedSteps > 0 ? ownSteps + nestedSteps : 1;
}

@Injectable()
export class ProgressService {
    constructor(
        @InjectModel(Progress.name) private progressModel: Model<ProgressDocument>,
        @InjectModel(RoadMap.name) private roadMapModel: Model<RoadMapDocument>,
        @InjectModel(Assessment.name) private assessmentModel: Model<AssessmentDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(AssessmentAssigned.name) private assessmentAssignedModel: Model<AssessmentAssignedDocument>,
        @InjectModel(UserAnswer.name) private userAnswerModel: Model<UserAnswerDocument>,
        private readonly mailer: MailerService,
    ) { }

    private isPastoralLearnerRole(role?: string): boolean {
        const r = (role ?? '').trim().toLowerCase();
        return (
            r === ROLES.PASTOR ||
            r === ROLES.LAY_LEADER ||
            r === ROLES.SEMINARIAN
        );
    }

    private isMentorTrackRole(role?: string): boolean {
        const r = (role ?? '').trim().toLowerCase();
        return r === ROLES.MENTOR || r === ROLES.FIELD_MENTOR;
    }

    async getUserProgress(userId: Types.ObjectId): Promise<ProgressResponseDto | null> {
        const userObjectId: Types.ObjectId = userId;
        const userIdString: string = userId.toString();

        const progress = await this.progressModel.findOne({
            $or: [
                { userId: userObjectId },
                { userId: userIdString },
            ],
        }).exec();

        if (!progress) {
            return null;
        }

        await this.syncMissingAssignedAssessments(progress);
        await this.reconcileAndPersistAssessments(progress);
        return toProgressResponseDto(progress);
    }

    /**
     * Ensures every assessment assigned to the user (AssessmentAssigned or legacy
     * embedded assignments) has a row in progress.assessments so overall % includes them.
     */
    async syncMissingAssignedAssessments(
        progress: ProgressDocument,
    ): Promise<boolean> {
        const userIdRaw = progress.userId as Types.ObjectId | string;
        const userObjectId =
            userIdRaw instanceof Types.ObjectId
                ? userIdRaw
                : new Types.ObjectId(String(userIdRaw));
        const userIdString = userObjectId.toString();

        const [assignedRows, embeddedAssessments] = await Promise.all([
            this.assessmentAssignedModel
                .find({ userId: userObjectId }, { assessmentId: 1 })
                .lean()
                .exec(),
            this.assessmentModel
                .find({ 'assignments.userId': userObjectId }, { _id: 1 })
                .lean()
                .exec(),
        ]);

        const assignedIds = collectAssignedAssessmentIds(
            assignedRows.map((row) => ({
                assessmentId: row.assessmentId as Types.ObjectId,
            })),
            embeddedAssessments.map((doc) => ({
                _id: doc._id as Types.ObjectId,
            })),
        );

        const existingIds = (progress.assessments ?? []).map((entry) =>
            entry.assessmentId.toString(),
        );
        const missingIds = findMissingAssessmentIds(assignedIds, existingIds);

        if (missingIds.length === 0) {
            return false;
        }

        const missingObjectIds = missingIds.map((id) => new Types.ObjectId(id));
        const [templates, answerDocs] = await Promise.all([
            this.assessmentModel
                .find({ _id: { $in: missingObjectIds } }, { sections: 1 })
                .lean()
                .exec(),
            this.userAnswerModel
                .find(
                    {
                        $or: [
                            { userId: userObjectId },
                            { userId: userIdString },
                        ],
                        assessmentId: { $in: missingObjectIds },
                    },
                    { assessmentId: 1, sections: 1 },
                )
                .lean()
                .exec(),
        ]);

        const newEntries = buildAssessmentProgressEntries(
            templates.map((template) => ({
                _id: template._id as Types.ObjectId,
                sections: template.sections,
            })),
            answerDocs.map((doc) => ({
                assessmentId: doc.assessmentId as Types.ObjectId,
                sections: doc.sections,
            })),
        );

        if (newEntries.length === 0) {
            return false;
        }

        progress.assessments = [...(progress.assessments ?? []), ...newEntries];
        progress.markModified('assessments');
        await progress.save();

        return true;
    }

    /** Re-run aggregate fields after partial progress updates that skip Mongoose hooks. */
    async refreshAggregatesForUser(userId: Types.ObjectId | string): Promise<void> {
        const userObjectId =
            typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
        const userIdString = userObjectId.toString();

        const progress = await this.progressModel
            .findOne({
                $or: [{ userId: userObjectId }, { userId: userIdString }],
            })
            .exec();

        if (!progress) {
            return;
        }

        await this.syncMissingAssignedAssessments(progress);
        await progress.save();
    }

    /** Sync one assessment row from saved answers (submit vs mentor CDP). */
    async syncAssessmentProgressFromAnswers(
        userId: string,
        assessmentId: string,
    ): Promise<void> {
        if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(assessmentId)) {
            return;
        }

        const userObjectId = new Types.ObjectId(userId);
        const userIdString = userObjectId.toString();
        const assessmentObjectId = new Types.ObjectId(assessmentId);

        const progress = await this.progressModel
            .findOne({
                $or: [{ userId: userObjectId }, { userId: userIdString }],
                'assessments.assessmentId': assessmentObjectId,
            })
            .exec();

        if (!progress) {
            return;
        }

        const [template, answerDoc] = await Promise.all([
            this.assessmentModel
                .findById(assessmentObjectId)
                .select('sections')
                .lean()
                .exec(),
            this.userAnswerModel
                .findOne({
                    assessmentId: assessmentObjectId,
                    $or: [{ userId: userObjectId }, { userId: userIdString }],
                })
                .select('sections')
                .lean()
                .exec(),
        ]);

        const entry = progress.assessments.find(
            (item) => item.assessmentId.toString() === assessmentId,
        );
        if (!entry) {
            return;
        }

        const next = assessmentProgressNeedsUpdate(
            entry,
            template?.sections?.length ?? 0,
            answerDoc?.sections as AnswerSectionSlice[] | undefined,
        );

        if (!next.changed) {
            return;
        }

        entry.completedSections = next.completedSections;
        entry.totalSections = next.totalSections;
        entry.progressPercentage = next.progressPercentage;
        entry.status = next.status;
        progress.markModified('assessments');
        await progress.save();
    }

    /**
     * Removes orphaned assessment rows, syncs section counts from templates/answers,
     * and recalculates overall progress fields.
     */
    async reconcileAndPersistAssessments(
        progress: ProgressDocument,
    ): Promise<{
        changed: boolean;
        removedOrphanIds: string[];
        updatedAssessmentIds: string[];
    }> {
        if (!progress.assessments?.length) {
            return { changed: false, removedOrphanIds: [], updatedAssessmentIds: [] };
        }

        const assessmentIds = [
            ...new Set(progress.assessments.map((a) => a.assessmentId.toString())),
        ].map((id) => new Types.ObjectId(id));

        const [existingAssessments, answerDocs] = await Promise.all([
            this.assessmentModel
                .find({ _id: { $in: assessmentIds } }, { _id: 1, sections: 1 })
                .lean()
                .exec(),
            this.userAnswerModel
                .find(
                    {
                        $or: [
                            { userId: progress.userId },
                            { userId: progress.userId.toString() },
                        ],
                        assessmentId: { $in: assessmentIds },
                    },
                    { assessmentId: 1, sections: 1 },
                )
                .lean()
                .exec(),
        ]);

        const existingAssessmentIds = new Set(
            existingAssessments.map((a) => a._id.toString()),
        );
        const templateSectionCountByAssessmentId = new Map(
            existingAssessments.map((a) => [a._id.toString(), a.sections?.length ?? 0]),
        );
        const answerSectionsByAssessmentId = new Map(
            answerDocs.map((doc) => [doc.assessmentId.toString(), doc.sections ?? []]),
        );

        const result = reconcileProgressAssessments({
            assessments: progress.assessments,
            existingAssessmentIds,
            templateSectionCountByAssessmentId,
            answerSectionsByAssessmentId,
        });

        if (!result.changed) {
            return {
                changed: false,
                removedOrphanIds: [],
                updatedAssessmentIds: [],
            };
        }

        progress.assessments = result.assessments;
        progress.markModified('assessments');
        await progress.save();

        return {
            changed: true,
            removedOrphanIds: result.removedOrphanIds,
            updatedAssessmentIds: result.updatedAssessmentIds,
        };
    }

    async reconcileAllProgressDocuments(): Promise<{
        scanned: number;
        updated: number;
        orphansRemoved: number;
        assessmentsSynced: number;
    }> {
        const docs = await this.progressModel.find().exec();
        let updated = 0;
        let orphansRemoved = 0;
        let assessmentsSynced = 0;

        for (const doc of docs) {
            const beforeCount = doc.assessments?.length ?? 0;
            const outcome = await this.reconcileAndPersistAssessments(doc);
            if (!outcome.changed) {
                continue;
            }

            updated++;
            orphansRemoved += outcome.removedOrphanIds.length;
            assessmentsSynced += outcome.updatedAssessmentIds.length;

            if (doc.assessments.length < beforeCount) {
                continue;
            }
        }

        return {
            scanned: docs.length,
            updated,
            orphansRemoved,
            assessmentsSynced,
        };
    }

    async removeAssessmentsFromAllProgress(
        assessmentIds: Types.ObjectId[],
    ): Promise<number> {
        if (!assessmentIds.length) {
            return 0;
        }

        const affected = await this.progressModel
            .find({ 'assessments.assessmentId': { $in: assessmentIds } })
            .exec();

        let updated = 0;
        for (const doc of affected) {
            const before = doc.assessments.length;
            doc.assessments = doc.assessments.filter(
                (entry) =>
                    !assessmentIds.some((id) => id.equals(entry.assessmentId)),
            );
            if (doc.assessments.length === before) {
                continue;
            }
            doc.markModified('assessments');
            await doc.save();
            updated++;
        }

        return updated;
    }

    async findByUserId(userId: Types.ObjectId): Promise<ProgressResponseDto | null> {
        return this.getUserProgress(userId);
    }

    async getBulkUserProgress(userIds: Types.ObjectId[]): Promise<BulkUserProgressMap> {
        const uniqueUserIds = [...new Map(userIds.map((id) => [id.toString(), id])).values()];
        const userIdStrings = uniqueUserIds.map((id) => id.toString());

        const progressDocs = await this.progressModel.find({
            $or: [
                { userId: { $in: uniqueUserIds } },
                { userId: { $in: userIdStrings } },
            ],
        }).exec();

        const progressByUserId = new Map<string, ProgressDocument>();
        for (const doc of progressDocs) {
            progressByUserId.set(doc.userId.toString(), doc);
        }

        const results: BulkUserProgressMap = {};

        const settled = await Promise.allSettled(
            uniqueUserIds.map(async (userId) => {
                const userIdStr = userId.toString();
                try {
                    const doc = progressByUserId.get(userIdStr);
                    const progress = doc ? toProgressResponseDto(doc) : null;
                    return {
                        userIdStr,
                        item: toBulkUserProgressDto(progress, userIdStr),
                    };
                } catch (error) {
                    return {
                        userIdStr,
                        item: {
                            userId: userIdStr,
                            roadmapProgressPercent: 0,
                            roadmaps: [],
                            failed: true,
                            error: error instanceof Error ? error.message : 'Failed to fetch progress',
                        },
                    };
                }
            }),
        );

        for (const outcome of settled) {
            if (outcome.status === 'fulfilled') {
                results[outcome.value.userIdStr] = outcome.value.item;
                continue;
            }

            const reason = outcome.reason;
            const message = reason instanceof Error ? reason.message : 'Failed to fetch progress';
            const fallbackUserId = typeof reason?.userId === 'string' ? reason.userId : undefined;
            if (fallbackUserId) {
                results[fallbackUserId] = {
                    userId: fallbackUserId,
                    roadmapProgressPercent: 0,
                    roadmaps: [],
                    failed: true,
                    error: message,
                };
            }
        }

        return results;
    }

    async assignRoadmap(dto: AssignRoadmapDto): Promise<ProgressResponseDto[]> {
        // Step 1: Validate all roadmaps exist and fetch their data including nested roadmaps
        const roadMaps = await this.roadMapModel.find(
            { _id: { $in: dto.roadMapIds } },
            { _id: 1, name: 1, totalSteps: 1, extras: 1, roadmaps: 1 },
        ).lean().exec();

        if (roadMaps.length !== dto.roadMapIds.length) {
            const foundIds = roadMaps.map(r => r._id.toString());
            const missingIds = dto.roadMapIds.filter(id => !foundIds.includes(id.toString()));
            throw new NotFoundException(`RoadMap(s) not found: ${missingIds.join(', ')}`);
        }

        // Create a map for O(1) lookup of roadmap data by roadMapId
        const roadMapDataMap = new Map(
            roadMaps.map((r) => [
                r._id.toString(),
                {
                    name: (r as { name?: string }).name ?? 'Roadmap',
                    totalSteps: resolveAssignedRoadmapSteps(r.totalSteps, r.extras, r.roadmaps),
                    nestedRoadmaps: r.roadmaps || [],
                },
            ]),
        );

        // Step 2: Fetch all existing progress records for all users in a single query (prevents N+1 problem)
        const existingProgressRecords = await this.progressModel.find(
            { userId: { $in: dto.userIds } }
        ).lean().exec();

        // Create a map for O(1) lookup of existing progress by userId
        const progressByUserMap = new Map(
            existingProgressRecords.map(p => [p.userId.toString(), p])
        );

        const results: ProgressResponseDto[] = [];
        const errors: string[] = [];

        // Step 3: Process each user and assign roadmaps
        for (const userId of dto.userIds) {
            try {
                const existingProgress = progressByUserMap.get(userId.toString());

                // Get list of already assigned roadmap IDs for this user
                const existingRoadMapIds = existingProgress
                    ? existingProgress.roadmaps.map(r => r.roadMapId.toString())
                    : [];

                // Filter out roadmaps that are already assigned
                const newRoadMapIds = dto.roadMapIds.filter(
                    id => !existingRoadMapIds.includes(id.toString())
                );

                if (newRoadMapIds.length === 0) {
                    errors.push(`All roadmaps already assigned to user ${userId}`);
                    continue;
                }

                // Create entries for new roadmaps with nested roadmaps
                const newRoadmapEntries = newRoadMapIds.map(roadMapId => {
                    const roadMapData = roadMapDataMap.get(roadMapId.toString());
                    const nestedRoadmapsData = roadMapData?.nestedRoadmaps || [];

                    // Create nested roadmap entries
                    const nestedRoadmaps = nestedRoadmapsData.map((nested: any) => ({
                        nestedRoadmapId: nested._id,
                        completedSteps: 0,
                        totalSteps: nested.totalSteps && nested.totalSteps > 0
                            ? nested.totalSteps
                            : ((nested.extras?.length ?? 0) || 1),
                        progressPercentage: 0,
                        status: PROGRESS_STATUSES.NOT_STARTED,
                    }));

                    return {
                        roadMapId: roadMapId,
                        completedSteps: 0,
                        totalSteps: roadMapData?.totalSteps || 0,
                        progressPercentage: 0,
                        status: PROGRESS_STATUSES.NOT_STARTED,
                        assignedAt: new Date(),
                        assignedBy: dto.assignedBy ? new Types.ObjectId(dto.assignedBy) : null,
                        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                        nestedRoadmaps: nestedRoadmaps,
                    };
                });

                // Update progress with all new roadmaps in a single atomic operation
                const updatedProgress = await this.progressModel.findOneAndUpdate(
                    { userId: userId },
                    {
                        $push: { roadmaps: { $each: newRoadmapEntries } },
                        $setOnInsert: { userId: userId }
                    },
                    {
                        new: true,
                        upsert: true,
                    }
                ).exec();

                results.push(toProgressResponseDto(updatedProgress));

                const learner = await this.userModel
                    .findById(userId)
                    .select('email firstName lastName role assignedId')
                    .lean()
                    .exec();
                const roadmapPayload = newRoadMapIds.map((id) => {
                    const meta = roadMapDataMap.get(id.toString());
                    return {
                        id: id.toString(),
                        name: meta?.name ?? 'Roadmap',
                        totalSteps: meta?.totalSteps,
                    };
                });
                if (learner?.email) {
                    void this.mailer.sendRoadmapsAssigned({
                        to: learner.email,
                        recipientFirstName: learner.firstName,
                        roadmaps: roadmapPayload,
                        introLine:
                            roadmapPayload.length > 1
                                ? `${roadmapPayload.length} new roadmap(s) are now on your CCC dashboard — open each below for steps and milestones.`
                                : 'A new roadmap is now on your CCC dashboard — open it below for steps and milestones.',
                    });
                    if (
                        this.isPastoralLearnerRole((learner as { role?: string }).role) &&
                        (learner as { assignedId?: Types.ObjectId[] }).assignedId?.length
                    ) {
                        const pastorName = `${learner.firstName} ${learner.lastName}`;
                        const seen = new Set<string>();
                        for (const mentorRef of (learner as { assignedId: Types.ObjectId[] }).assignedId) {
                            const mid = mentorRef.toString();
                            if (seen.has(mid)) continue;
                            seen.add(mid);
                            const mentor = await this.userModel.findById(mentorRef).select('email firstName').lean().exec();
                            if (!mentor?.email || !this.isMentorTrackRole((mentor as { role?: string }).role)) {
                                continue;
                            }
                            void this.mailer.sendRoadmapsAssigned({
                                to: mentor.email,
                                recipientFirstName: mentor.firstName,
                                roadmaps: roadmapPayload,
                                introLine: `Roadmap(s) were assigned to ${pastorName} (connected to your mentee list). Steps and links appear below.`,
                            });
                        }
                    }
                }
            } catch (error) {
                errors.push(`Failed to assign roadmaps to user ${userId}: ${error.message}`);
            }
        }

        // If all assignments failed, throw an error
        if (errors.length > 0 && results.length === 0) {
            throw new BadRequestException(`Failed to assign roadmaps to all users: ${errors.join(', ')}`);
        }

        return results;
    }

    async assignAssessment(dto: AssignAssessmentDto): Promise<ProgressResponseDto[]> {
        // Step 1: Validate all assessments exist and fetch their data
        const assessments = await this.assessmentModel.find(
            { _id: { $in: dto.assessmentIds } },
            { _id: 1, sections: 1, name: 1 },
        ).lean().exec();

        if (assessments.length !== dto.assessmentIds.length) {
            const foundIds = assessments.map(a => a._id.toString());
            const missingIds = dto.assessmentIds.filter(id => !foundIds.includes(id.toString()));
            throw new NotFoundException(`Assessment(s) not found: ${missingIds.join(', ')}`);
        }

        // Create a map for O(1) lookup of assessment data by assessmentId
        const assessmentDataMap = new Map(
            assessments.map((a) => [
                a._id.toString(),
                {
                    name: (a as { name?: string }).name ?? 'Assessment',
                    totalSections: a.sections?.length || 0,
                },
            ]),
        );

        // Step 2: Fetch all existing progress records for all users in a single query (prevents N+1 problem)
        const existingProgressRecords = await this.progressModel.find(
            { userId: { $in: dto.userIds } }
        ).lean().exec();

        // Create a map for O(1) lookup of existing progress by userId
        const progressByUserMap = new Map(
            existingProgressRecords.map(p => [p.userId.toString(), p])
        );

        const results: ProgressResponseDto[] = [];
        const errors: string[] = [];

        // Step 3: Process each user and assign assessments
        for (const userId of dto.userIds) {
            try {
                const existingProgress = progressByUserMap.get(userId.toString());

                // Get list of already assigned assessment IDs for this user
                const existingAssessmentIds = existingProgress
                    ? existingProgress.assessments.map(a => a.assessmentId.toString())
                    : [];

                // Filter out assessments that are already assigned
                const newAssessmentIds = dto.assessmentIds.filter(
                    id => !existingAssessmentIds.includes(id.toString())
                );

                if (newAssessmentIds.length === 0) {
                    errors.push(`All assessments already assigned to user ${userId}`);
                    continue;
                }

                const answerDocs = await this.userAnswerModel
                    .find(
                        {
                            $or: [
                                { userId: new Types.ObjectId(userId) },
                                { userId: userId.toString() },
                            ],
                            assessmentId: { $in: newAssessmentIds },
                        },
                        { assessmentId: 1, sections: 1 },
                    )
                    .lean()
                    .exec();
                const completedSectionsByAssessmentId = new Map(
                    answerDocs.map((doc) => [
                        doc.assessmentId.toString(),
                        countCompletedAnswerSections(doc.sections),
                    ]),
                );

                // Create entries for new assessments
                const newAssessmentEntries = newAssessmentIds.map(assessmentId => {
                    const assessmentData = assessmentDataMap.get(assessmentId.toString());
                    const totalSections = assessmentData?.totalSections || 0;
                    const completedSections =
                        completedSectionsByAssessmentId.get(assessmentId.toString()) ?? 0;

                    return {
                        assessmentId,
                        completedSections,
                        totalSections,
                        progressPercentage: 0,
                        status: PROGRESS_STATUSES.NOT_STARTED,
                    };
                });

                // Update progress with all new assessments in a single atomic operation
                const updatedProgress = await this.progressModel.findOneAndUpdate(
                    { userId: userId },
                    {
                        $push: { assessments: { $each: newAssessmentEntries } },
                        $setOnInsert: { userId: userId }
                    },
                    {
                        new: true,
                        upsert: true,
                    }
                ).exec();
                // Create or update AssessmentAssigned records for ALL requested assessments.
                // Using bulkWrite with upsert so that re-assigning can update dueDate on existing records
                // without violating the unique index on (assessmentId, userId).
                // $set only updates dueDate; $setOnInsert only fires on new docs (preserves status of existing).
                await this.assessmentAssignedModel.bulkWrite(
                    dto.assessmentIds.map(assessmentId => ({
                        updateOne: {
                            filter: {
                                assessmentId: new Types.ObjectId(assessmentId),
                                userId: new Types.ObjectId(userId),
                            },
                            update: {
                                $set: {
                                    dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                                },
                                $setOnInsert: {
                                    assignedAt: new Date(),
                                    status: ASSESSMENT_ASSIGNMENT_STATUSES.ASSIGNED,
                                },
                            },
                            upsert: true,
                        },
                    }))
                );

                for (const assessmentId of newAssessmentIds) {
                    await this.assessmentModel.updateOne(
                        {
                            _id: assessmentId,
                            'assignments.userId': { $ne: userId },
                        },
                        {
                            $push: {
                                assignments: {
                                    userId: userId,
                                    assignedAt: new Date(),
                                    status: ASSESSMENT_ASSIGNMENT_STATUSES.ASSIGNED,
                                },
                            },
                        },
                    );
                }

                results.push(toProgressResponseDto(updatedProgress));

                const learner = await this.userModel
                    .findById(userId)
                    .select('email firstName lastName role assignedId')
                    .lean()
                    .exec();

                if (learner?.email) {
                    for (const assessmentId of newAssessmentIds) {
                        const meta = assessmentDataMap.get(assessmentId.toString());
                        void this.mailer.sendAssessmentAssigned({
                            to: learner.email,
                            firstName: learner.firstName,
                            assessmentTitle: meta?.name ?? 'Assessment',
                            assessmentId: assessmentId.toString(),
                        });
                    }
                    if (
                        this.isPastoralLearnerRole((learner as { role?: string }).role) &&
                        (learner as { assignedId?: Types.ObjectId[] }).assignedId?.length
                    ) {
                        const pastorName = `${learner.firstName} ${learner.lastName}`;
                        const seen = new Set<string>();
                        for (const mentorRef of (learner as { assignedId: Types.ObjectId[] }).assignedId) {
                            const mid = mentorRef.toString();
                            if (seen.has(mid)) continue;
                            seen.add(mid);
                            const mentor = await this.userModel
                                .findById(mentorRef)
                                .select('email firstName role')
                                .lean()
                                .exec();
                            if (
                                !mentor?.email ||
                                !this.isMentorTrackRole((mentor as { role?: string }).role)
                            ) {
                                continue;
                            }
                            for (const assessmentId of newAssessmentIds) {
                                const meta = assessmentDataMap.get(assessmentId.toString());
                                void this.mailer.sendAssessmentAssigned({
                                    to: mentor.email,
                                    firstName: mentor.firstName,
                                    assessmentTitle: `[Assigned to ${pastorName}] ${meta?.name ?? 'Assessment'}`,
                                    assessmentId: assessmentId.toString(),
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                errors.push(`Failed to assign assessments to user ${userId}: ${error.message}`);
            }
        }

        // If all assignments failed, throw an error
        if (errors.length > 0 && results.length === 0) {
            throw new BadRequestException(`Failed to assign assessments to all users: ${errors.join(', ')}`);
        }

        return results;
    }

    async updateRoadmapProgress(dto: UpdateRoadmapProgressDto): Promise<ProgressResponseDto> {
        const updatedProgress = await this.progressModel.findOneAndUpdate(
            { userId: dto.userId, 'roadmaps.roadMapId': dto.roadMapId },
            { $set: { 'roadmaps.$.completedSteps': dto.completedSteps } },
            { new: true }
        ).exec();

        if (!updatedProgress) {
            throw new NotFoundException(`Roadmap ${dto.roadMapId} not found for user ${dto.userId}.`);
        }
        return toProgressResponseDto(updatedProgress);
    }

    async updateAssessmentProgress(dto: UpdateAssessmentProgressDto): Promise<ProgressResponseDto> {
        const updatedProgress = await this.progressModel.findOneAndUpdate(
            { userId: dto.userId, 'assessments.assessmentId': dto.assessmentId },
            { $set: { 'assessments.$.completedSections': dto.completedSections } },
            { new: true }
        ).exec();

        if (!updatedProgress) {
            throw new NotFoundException(`Assessment ${dto.assessmentId} not found for user ${dto.userId}.`);
        }
        return toProgressResponseDto(updatedProgress);
    }

    async addFinalComment(dto: AddFinalCommentDto): Promise<ProgressResponseDto> {
        const newComment = {
            _id: new Types.ObjectId(),
            commentorId: dto.commentorId,
            comment: dto.comment,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const updatedProgress = await this.progressModel.findOneAndUpdate(
            { userId: dto.userId },
            {
                $push: { finalComments: newComment },
                $setOnInsert: { userId: dto.userId }
            },
            {
                new: true,
                upsert: true,
            }
        ).exec();

        if (!updatedProgress) {
            throw new NotFoundException(`Progress record not found for user ${dto.userId}.`);
        }

        return toProgressResponseDto(updatedProgress);
    }

    async getFinalComments(userId: Types.ObjectId): Promise<ProgressResponseDto['finalComments']> {
        const progress = await this.progressModel
            .findOne({ userId })
            .select('finalComments')
            .sort({ 'finalComments.createdAt': -1 })
            .exec();

        if (!progress) {
            return [];
        }

        return progress.finalComments || [];
    }

    async updateFinalComment(dto: UpdateFinalCommentDto): Promise<ProgressResponseDto> {
        const updatedProgress = await this.progressModel.findOneAndUpdate(
            {
                userId: dto.userId,
                'finalComments._id': dto.commentId
            },
            {
                $set: {
                    'finalComments.$.comment': dto.comment,
                    'finalComments.$.updatedAt': new Date(),
                }
            },
            { new: true }
        ).exec();

        if (!updatedProgress) {
            throw new NotFoundException(
                `Comment ${dto.commentId} not found for user ${dto.userId}.`
            );
        }

        return toProgressResponseDto(updatedProgress);
    }

    async deleteFinalComment(dto: DeleteFinalCommentDto): Promise<ProgressResponseDto> {
        const updatedProgress = await this.progressModel.findOneAndUpdate(
            { userId: dto.userId },
            {
                $pull: { finalComments: { _id: dto.commentId } }
            },
            { new: true }
        ).exec();

        if (!updatedProgress) {
            throw new NotFoundException(`Progress record not found for user ${dto.userId}.`);
        }

        return toProgressResponseDto(updatedProgress);
    }

    async getOverallProgressByRoles(roles: string[]): Promise<UserOverallProgressDto[]> {
        const users = await this.userModel.find(
            { role: { $in: roles } },
            { _id: 1, firstName: 1, lastName: 1, email: 1, role: 1, profilePicture: 1 }
        ).lean().exec();

        if (users.length === 0) {
            return [];
        }

        const userIds = users.map(u => u._id);
        const userIdStrings = users.map(u => u._id.toString());

        const progressRecords = await this.progressModel.find(
            { $or: [{ userId: { $in: userIds } }, { userId: { $in: userIdStrings } }] },
            {
                userId: 1,
                totalRoadmaps: 1,
                completedRoadmaps: 1,
                overallRoadmapProgress: 1,
                totalAssessments: 1,
                completedAssessments: 1,
                overallAssessmentProgress: 1,
                totalItems: 1,
                completedItems: 1,
                overallProgress: 1,
                overallCompleted: 1,
            }
        ).lean().exec();

        const progressMap = new Map(
            progressRecords.map(p => [p.userId.toString(), p])
        );

        const result: UserOverallProgressDto[] = users.map(user => {
            const progress = progressMap.get(user._id.toString());

            return {
                userId: user._id.toString(),
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                profilePicture: user.profilePicture || undefined,
                totalRoadmaps: progress?.totalRoadmaps || 0,
                completedRoadmaps: progress?.completedRoadmaps || 0,
                overallRoadmapProgress: progress?.overallRoadmapProgress || 0,
                totalAssessments: progress?.totalAssessments || 0,
                completedAssessments: progress?.completedAssessments || 0,
                overallAssessmentProgress: progress?.overallAssessmentProgress || 0,
                totalItems: progress?.totalItems || 0,
                completedItems: progress?.completedItems || 0,
                overallProgress: progress?.overallProgress || 0,
                overallCompleted: progress?.overallCompleted || false,
            };
        });

        return result;
    }

    async getDirectorOverview(period: string = 'yearly', year: number = new Date().getFullYear(), includeUserDetails: boolean = false): Promise<DirectorOverviewDto> {
        const mentorRoles = ['mentor', 'field-mentor'];
        const pastorRoles = ['pastor', 'lay-leader', 'seminarian'];
        const allRoles = [...mentorRoles, ...pastorRoles];

        const allUsers = await this.userModel.find(
            { role: { $in: allRoles } },
            { _id: 1, firstName: 1, lastName: 1, email: 1, role: 1, profilePicture: 1, createdAt: 1 }
        ).lean().exec();

        const mentorUsers = allUsers.filter(u => mentorRoles.includes(u.role));
        const pastorUsers = allUsers.filter(u => pastorRoles.includes(u.role));

        const allUserIds = allUsers.map(u => u._id);
        const mentorUserIds = mentorUsers.map(u => u._id);
        const pastorUserIds = pastorUsers.map(u => u._id);

        const progressRecords = await this.progressModel.find(
            { userId: { $in: allUserIds } },
            {
                userId: 1,
                totalRoadmaps: 1,
                completedRoadmaps: 1,
                overallRoadmapProgress: 1,
                totalAssessments: 1,
                completedAssessments: 1,
                overallAssessmentProgress: 1,
                totalItems: 1,
                completedItems: 1,
                overallProgress: 1,
                overallCompleted: 1,
                updatedAt: 1,
            }
        ).lean().exec();

        const progressMap = new Map(
            progressRecords.map(p => [p.userId.toString(), p])
        );

        let completedMentorsCount = 0;
        let totalMentorsProgress = 0;
        let mentorsWithProgress = 0;

        mentorUserIds.forEach(userId => {
            const progress = progressMap.get(userId.toString());
            if (progress) {
                if (progress.overallCompleted) {
                    completedMentorsCount++;
                }
                totalMentorsProgress += progress.overallProgress || 0;
                mentorsWithProgress++;
            }
        });

        const mentorsOverallProgress = mentorsWithProgress > 0
            ? parseFloat((totalMentorsProgress / mentorUserIds.length).toFixed(2))
            : 0;

        let completedPastorsCount = 0;
        let totalPastorsProgress = 0;
        let pastorsWithProgress = 0;

        pastorUserIds.forEach(userId => {
            const progress = progressMap.get(userId.toString());
            if (progress) {
                if (progress.overallCompleted) {
                    completedPastorsCount++;
                }
                totalPastorsProgress += progress.overallProgress || 0;
                pastorsWithProgress++;
            }
        });

        const pastorsOverallProgress = pastorsWithProgress > 0
            ? parseFloat((totalPastorsProgress / pastorUserIds.length).toFixed(2))
            : 0;

        const totalUsers = allUsers.length;
        const completedUsers = completedMentorsCount + completedPastorsCount;
        const combinedTotalProgress = totalMentorsProgress + totalPastorsProgress;
        const overallCombinedProgress = totalUsers > 0
            ? parseFloat((combinedTotalProgress / totalUsers).toFixed(2))
            : 0;

        const monthlyData = this.generateMonthlyData(
            progressRecords,
            mentorUserIds,
            pastorUserIds,
            period,
            year
        );

        let userDetails: UserOverallProgressDto[] | undefined = undefined;
        if (includeUserDetails) {
            userDetails = allUsers.map(user => {
                const progress = progressMap.get(user._id.toString());
                return {
                    userId: user._id.toString(),
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role,
                    profilePicture: user.profilePicture || undefined,
                    totalRoadmaps: progress?.totalRoadmaps || 0,
                    completedRoadmaps: progress?.completedRoadmaps || 0,
                    overallRoadmapProgress: progress?.overallRoadmapProgress || 0,
                    totalAssessments: progress?.totalAssessments || 0,
                    completedAssessments: progress?.completedAssessments || 0,
                    overallAssessmentProgress: progress?.overallAssessmentProgress || 0,
                    totalItems: progress?.totalItems || 0,
                    completedItems: progress?.completedItems || 0,
                    overallProgress: progress?.overallProgress || 0,
                    overallCompleted: progress?.overallCompleted || false,
                };
            });
        }

        return {
            totalMentors: mentorUsers.length,
            completedMentors: completedMentorsCount,
            mentorsOverallProgress,

            totalPastors: pastorUsers.length,
            completedPastors: completedPastorsCount,
            pastorsOverallProgress,

            totalUsers,
            completedUsers,
            overallCombinedProgress,

            monthlyData,
            users: userDetails,
        };
    }

    private generateMonthlyData(
        progressRecords: any[],
        mentorUserIds: Types.ObjectId[],
        pastorUserIds: Types.ObjectId[],
        period: string,
        year: number
    ): MonthlyCompletionDto[] {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        // Determine the months to include based on period
        let months: number[] = [];
        if (period === 'yearly') {
            months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // All 12 months
        } else if (period === 'half-yearly') {
            const currentMonth = new Date().getMonth();
            if (currentMonth < 6) {
                months = [0, 1, 2, 3, 4, 5]; // First half
            } else {
                months = [6, 7, 8, 9, 10, 11]; // Second half
            }
        }

        // Create a map of userId to progress completion date
        const completionMap = new Map<string, Date>();
        progressRecords.forEach(progress => {
            if (progress.overallCompleted && progress.updatedAt) {
                completionMap.set(progress.userId.toString(), new Date(progress.updatedAt));
            }
        });

        // Calculate completions per month
        const monthlyResults: MonthlyCompletionDto[] = months.map(month => {
            let mentorsCompleted = 0;
            let pastorsCompleted = 0;

            // Count mentor completions for this month
            mentorUserIds.forEach(userId => {
                const completionDate = completionMap.get(userId.toString());
                if (completionDate &&
                    completionDate.getFullYear() === year &&
                    completionDate.getMonth() === month) {
                    mentorsCompleted++;
                }
            });

            // Count pastor completions for this month
            pastorUserIds.forEach(userId => {
                const completionDate = completionMap.get(userId.toString());
                if (completionDate &&
                    completionDate.getFullYear() === year &&
                    completionDate.getMonth() === month) {
                    pastorsCompleted++;
                }
            });

            return {
                month: month + 1,
                year,
                monthName: monthNames[month],
                mentorsCompleted,
                pastorsCompleted,
            };
        });

        return monthlyResults;
    }
}