import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoadMap, RoadMapDocument } from './schemas/roadmap.schema';
import { Extras, ExtrasDocument } from './schemas/extras.schema';
import { Progress, ProgressDocument } from '../progress/schemas/progress.schema';
import { Assessment, AssessmentDocument } from '../assessment/schemas/assessment.schema';
import { UserAnswer } from '../assessment/schemas/answer.schema';
import { RoadMapsService } from './roadmaps.service';
import { toObjectId } from 'src/common/pipes/to-object-id.pipe';

const MENTOR_CDP_TRIGGER = 'mentor_cdp_complete';

interface AssessmentRoadmapScope {
    roadMapId: string;
    nestedRoadMapItemId?: string;
    extraNames: string[];
}

@Injectable()
export class RoadmapAssessmentCompletionService {
    private readonly logger = new Logger(RoadmapAssessmentCompletionService.name);

    constructor(
        @InjectModel(RoadMap.name) private readonly roadMapModel: Model<RoadMapDocument>,
        @InjectModel(Extras.name) private readonly extrasModel: Model<ExtrasDocument>,
        @InjectModel(Progress.name) private readonly progressModel: Model<ProgressDocument>,
        @InjectModel(Assessment.name) private readonly assessmentModel: Model<AssessmentDocument>,
        @InjectModel(UserAnswer.name) private readonly userAnswerModel: Model<UserAnswer>,
        private readonly roadMapsService: RoadMapsService,
    ) {}

    /**
     * Called after a section recommendation is saved. Returns the number of roadmap
     * steps completed (0 when mentor review is not yet fully done).
     */
    async tryCompleteRoadmapTasksAfterCdp(
        userId: string,
        assessmentId: string,
        userAnswer?: { sections?: { sectionId?: Types.ObjectId; recommendations?: string[] }[] },
    ): Promise<number> {
        if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(assessmentId)) {
            return 0;
        }

        const reviewComplete = await this.isMentorReviewComplete(
            assessmentId,
            userId,
            userAnswer,
        );
        if (!reviewComplete) {
            return 0;
        }

        return this.completeAssessmentRoadmapTasks(userId, assessmentId);
    }

    async isMentorReviewComplete(
        assessmentId: string,
        userId: string,
        userAnswer?: { sections?: { sectionId?: Types.ObjectId; recommendations?: string[] }[] },
    ): Promise<boolean> {
        const assessment = await this.assessmentModel
            .findById(assessmentId)
            .select('sections')
            .lean();

        const templateSections = assessment?.sections ?? [];
        if (templateSections.length === 0) {
            return false;
        }

        const answer =
            userAnswer ??
            (await this.userAnswerModel
                .findOne({
                    assessmentId: new Types.ObjectId(assessmentId),
                    userId: new Types.ObjectId(userId),
                })
                .lean());

        if (!answer?.sections?.length) {
            return false;
        }

        return templateSections.every((templateSection) => {
            const sectionId = String((templateSection as { _id?: Types.ObjectId })._id);
            const sectionAnswer = answer.sections!.find(
                (s) => String(s.sectionId) === sectionId,
            );
            return (
                sectionAnswer &&
                Array.isArray(sectionAnswer.recommendations) &&
                sectionAnswer.recommendations.length > 0
            );
        });
    }

    private async completeAssessmentRoadmapTasks(
        userId: string,
        assessmentId: string,
    ): Promise<number> {
        const userObjectId = toObjectId(userId);
        if (!userObjectId) {
            return 0;
        }

        const scopes = await this.findAssessmentRoadmapScopes(userObjectId, assessmentId);
        let completedCount = 0;

        for (const scope of scopes) {
            const added = await this.completeScopeIfNeeded(userId, assessmentId, scope);
            completedCount += added;
        }

        if (completedCount > 0) {
            this.logger.log(
                `Completed ${completedCount} roadmap assessment step(s) for user ${userId}, assessment ${assessmentId}`,
            );
        }

        return completedCount;
    }

    private async findAssessmentRoadmapScopes(
        userId: Types.ObjectId,
        assessmentId: string,
    ): Promise<AssessmentRoadmapScope[]> {
        const userIdString = userId.toString();
        const progress = await this.progressModel
            .findOne({
                $or: [{ userId }, { userId: userIdString }],
            })
            .lean();

        if (!progress?.roadmaps?.length) {
            return [];
        }

        const assignedRoadMapIds = progress.roadmaps.map((r) => r.roadMapId);
        const roadmaps = await this.roadMapModel
            .find({ _id: { $in: assignedRoadMapIds } })
            .lean();

        const scopeMap = new Map<string, AssessmentRoadmapScope>();

        for (const roadmap of roadmaps) {
            const roadMapId = roadmap._id.toString();
            const isAssigned = progress.roadmaps.some(
                (r) => r.roadMapId?.toString() === roadMapId,
            );
            if (!isAssigned) {
                continue;
            }

            this.collectAssessmentExtrasFromTemplate(
                scopeMap,
                roadMapId,
                undefined,
                roadmap.extras,
                assessmentId,
            );

            for (const nested of roadmap.roadmaps ?? []) {
                if (!nested._id) {
                    continue;
                }
                this.collectAssessmentExtrasFromTemplate(
                    scopeMap,
                    roadMapId,
                    nested._id.toString(),
                    nested.extras,
                    assessmentId,
                );
            }
        }

        return Array.from(scopeMap.values());
    }

    private collectAssessmentExtrasFromTemplate(
        scopeMap: Map<string, AssessmentRoadmapScope>,
        roadMapId: string,
        nestedRoadMapItemId: string | undefined,
        extras: any[] | undefined,
        assessmentId: string,
    ): void {
        for (const extra of extras ?? []) {
            if (extra?.type !== 'ASSESSMENT') {
                continue;
            }
            if (String(extra.assessmentId) !== assessmentId) {
                continue;
            }

            const scopeKey = `${roadMapId}:${nestedRoadMapItemId ?? ''}`;
            const existing = scopeMap.get(scopeKey);
            const extraName = extra.name ?? 'Assessment';

            if (existing) {
                existing.extraNames.push(extraName);
            } else {
                scopeMap.set(scopeKey, {
                    roadMapId,
                    nestedRoadMapItemId,
                    extraNames: [extraName],
                });
            }
        }
    }

    private countMatchingAssessmentExtras(
        extras: any[] | undefined,
        assessmentId: string,
    ): number {
        return (extras ?? []).filter(
            (e) =>
                e?.type === 'ASSESSMENT' && String(e.assessmentId) === assessmentId,
        ).length;
    }

    private buildAssessmentCompletionExtra(assessmentId: string, name: string) {
        return {
            type: 'ASSESSMENT',
            assessmentId,
            name,
            completedAt: new Date().toISOString(),
            completedBy: 'system',
            trigger: MENTOR_CDP_TRIGGER,
        };
    }

    private buildExtrasExistsQuery(
        userId: Types.ObjectId,
        roadMapId: string,
        nestedRoadMapItemId?: string,
    ): Record<string, unknown> {
        const query: Record<string, unknown> = {
            userId,
            roadMapId: new Types.ObjectId(roadMapId),
        };

        if (nestedRoadMapItemId) {
            query.nestedRoadMapItemId = new Types.ObjectId(nestedRoadMapItemId);
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } },
            ];
        }

        return query;
    }

    private async completeScopeIfNeeded(
        userId: string,
        assessmentId: string,
        scope: AssessmentRoadmapScope,
    ): Promise<number> {
        const userObjectId = toObjectId(userId);
        if (!userObjectId) {
            return 0;
        }

        const neededCount = scope.extraNames.length;
        if (neededCount === 0) {
            return 0;
        }

        const existsQuery = this.buildExtrasExistsQuery(
            userObjectId,
            scope.roadMapId,
            scope.nestedRoadMapItemId,
        );
        const extrasDoc = await this.extrasModel.findOne(existsQuery).lean();
        const existingCount = this.countMatchingAssessmentExtras(
            extrasDoc?.extras,
            assessmentId,
        );

        const toAdd = neededCount - existingCount;
        if (toAdd <= 0) {
            return 0;
        }

        const newExtras = scope.extraNames
            .slice(existingCount, existingCount + toAdd)
            .map((name) => this.buildAssessmentCompletionExtra(assessmentId, name));

        if (extrasDoc) {
            await this.roadMapsService.updateExtras(
                scope.roadMapId,
                userId,
                { extras: newExtras },
                scope.nestedRoadMapItemId,
            );
        } else {
            await this.roadMapsService.saveExtras(scope.roadMapId, {
                userId,
                nestedRoadMapItemId: scope.nestedRoadMapItemId,
                extras: newExtras,
            });
        }

        return newExtras.length;
    }
}
