import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from '../users/schemas/user.schema';
import { Progress, ProgressDocument } from '../progress/schemas/progress.schema';
import { Extras, ExtrasDocument } from '../roadmaps/schemas/extras.schema';
import { RoadMap, RoadMapDocument } from '../roadmaps/schemas/roadmap.schema';
import {
    UserAnswer,
    UserAnswerDocument,
} from '../assessment/schemas/answer.schema';
import {
    Assessment,
    AssessmentDocument,
} from '../assessment/schemas/assessment.schema';
import { ReviewCenterCacheService } from '../review-center-cache/review-center-cache.service';
import {
    MentorReviewCenterResponseDto,
    ReviewItemDto,
    ReviewPastorMetaDto,
} from './dto/review-center.dto';
import {
    buildReviewItemsForMentor,
    RoadmapMeta,
} from './utils/build-review-items.util';

function uniqueOrdered(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const s = String(v ?? '').trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}

@Injectable()
export class MentorService {
    private readonly logger = new Logger(MentorService.name);
    private readonly maxRoadmapsPerMentee: number;
    private readonly maxAssessmentsPerMentee: number;

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Progress.name)
        private readonly progressModel: Model<ProgressDocument>,
        @InjectModel(Extras.name)
        private readonly extrasModel: Model<ExtrasDocument>,
        @InjectModel(RoadMap.name)
        private readonly roadMapModel: Model<RoadMapDocument>,
        @InjectModel(UserAnswer.name)
        private readonly userAnswerModel: Model<UserAnswerDocument>,
        @InjectModel(Assessment.name)
        private readonly assessmentModel: Model<AssessmentDocument>,
        private readonly configService: ConfigService,
        private readonly cache: ReviewCenterCacheService,
    ) {
        this.maxRoadmapsPerMentee =
            this.configService.get<number>('reviewCenter.maxRoadmapsPerMentee') ?? 6;
        this.maxAssessmentsPerMentee =
            this.configService.get<number>('reviewCenter.maxAssessmentsPerMentee') ?? 5;
    }

    /**
     * Aggregated Review Center payload for a mentor. Replaces the legacy
     * client-side fan-out (hundreds of requests) with a handful of bulk queries.
     */
    async getReviewCenter(
        mentorId: string,
    ): Promise<MentorReviewCenterResponseDto> {
        if (!Types.ObjectId.isValid(mentorId)) {
            throw new BadRequestException('Invalid mentor ID format');
        }

        const cacheKey = this.cache.keyForMentor(mentorId);
        const cached = this.cache.get<MentorReviewCenterResponseDto>(cacheKey);
        if (cached) {
            return { ...cached, cached: true };
        }

        const startedAt = Date.now();
        const mentorObjectId = new Types.ObjectId(mentorId);

        // 1) Assigned mentees (pastors) — single query.
        const mentees = await this.userModel
            .find(
                { assignedId: mentorObjectId },
                { _id: 1, firstName: 1, lastName: 1, profilePicture: 1 },
            )
            .lean()
            .exec();

        if (mentees.length === 0) {
            const empty: MentorReviewCenterResponseDto = {
                items: [],
                pastors: [],
                generatedInMs: Date.now() - startedAt,
                cached: false,
            };
            this.cache.set(cacheKey, empty, []);
            return empty;
        }

        const menteeObjectIds = mentees.map((m) => m._id);
        const menteeIdStrings = menteeObjectIds.map((id) => id.toString());
        const userIdMatch = {
            $or: [
                { userId: { $in: menteeObjectIds } },
                { userId: { $in: menteeIdStrings } },
            ],
        };

        const pastors: ReviewPastorMetaDto[] = mentees.map((m) => ({
            pastorId: m._id.toString(),
            pastorName:
                `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Pastor',
            profilePicture: (m as any).profilePicture ?? null,
        }));
        const pastorNameById = new Map(pastors.map((p) => [p.pastorId, p.pastorName]));

        // 2) Progress per mentee → assigned roadmap/assessment ids (capped + ordered).
        const progressDocs = await this.progressModel
            .find(userIdMatch, {
                userId: 1,
                'roadmaps.roadMapId': 1,
                'assessments.assessmentId': 1,
            })
            .lean()
            .exec();

        const assignedRoadmapIdsByPastor = new Map<string, string[]>();
        const assignedAssessmentIdsByPastor = new Map<string, string[]>();
        const allRoadmapIds = new Set<string>();
        const allAssessmentIds = new Set<string>();

        for (const doc of progressDocs) {
            const pastorId = doc.userId.toString();
            const roadmapIds = uniqueOrdered(
                (doc.roadmaps ?? [])
                    .map((r: any) => r?.roadMapId)
                    .filter(Boolean)
                    .map((id: any) => String(id)),
            ).slice(0, this.maxRoadmapsPerMentee);
            const assessmentIds = uniqueOrdered(
                (doc.assessments ?? [])
                    .map((a: any) => a?.assessmentId)
                    .filter(Boolean)
                    .map((id: any) => String(id)),
            ).slice(0, this.maxAssessmentsPerMentee);

            assignedRoadmapIdsByPastor.set(pastorId, roadmapIds);
            assignedAssessmentIdsByPastor.set(pastorId, assessmentIds);
            roadmapIds.forEach((id) => allRoadmapIds.add(id));
            assessmentIds.forEach((id) => allAssessmentIds.add(id));
        }

        const roadmapObjectIds = [...allRoadmapIds].map((id) => new Types.ObjectId(id));
        const assessmentObjectIds = [...allAssessmentIds].map(
            (id) => new Types.ObjectId(id),
        );

        // 3) Bulk fetch roadmaps (names + nested tasks), extras (submissions),
        //    assessments (names), and user answers — all in parallel.
        const [roadmapDocs, extrasDocs, assessmentDocs, answerDocs] =
            await Promise.all([
                roadmapObjectIds.length
                    ? this.roadMapModel
                          .find({ _id: { $in: roadmapObjectIds } }, { name: 1, roadmaps: 1 })
                          .lean()
                          .exec()
                    : Promise.resolve([]),
                roadmapObjectIds.length
                    ? this.extrasModel
                          .find({
                              roadMapId: { $in: roadmapObjectIds },
                              $or: [
                                  { userId: { $in: menteeObjectIds } },
                                  { userId: { $in: menteeIdStrings } },
                              ],
                          })
                          .lean()
                          .exec()
                    : Promise.resolve([]),
                assessmentObjectIds.length
                    ? this.assessmentModel
                          .find({ _id: { $in: assessmentObjectIds } }, { name: 1 })
                          .lean()
                          .exec()
                    : Promise.resolve([]),
                assessmentObjectIds.length
                    ? this.userAnswerModel
                          .find({
                              assessmentId: { $in: assessmentObjectIds },
                              $or: [
                                  { userId: { $in: menteeObjectIds } },
                                  { userId: { $in: menteeIdStrings } },
                              ],
                          })
                          .lean()
                          .exec()
                    : Promise.resolve([]),
            ]);

        const roadmapMetaById = new Map<string, RoadmapMeta>();
        for (const r of roadmapDocs as any[]) {
            const tasks = (r.roadmaps ?? [])
                .filter((t: any) => t?._id)
                .map((t: any) => ({
                    id: String(t._id),
                    name: String(t?.name ?? 'Task'),
                }));
            roadmapMetaById.set(String(r._id), {
                name: String(r?.name ?? 'Roadmap'),
                tasks,
            });
        }

        const extrasByPastorRoadmap = new Map<string, any[]>();
        for (const doc of extrasDocs as any[]) {
            const key = `${doc.userId?.toString()}:${doc.roadMapId?.toString()}`;
            const list = extrasByPastorRoadmap.get(key);
            if (list) list.push(doc);
            else extrasByPastorRoadmap.set(key, [doc]);
        }

        const assessmentNameById = new Map<string, string>();
        for (const a of assessmentDocs as any[]) {
            assessmentNameById.set(String(a._id), String(a?.name ?? 'Assessment'));
        }

        const answersByPastorAssessment = new Map<string, any>();
        for (const doc of answerDocs as any[]) {
            const key = `${doc.userId?.toString()}:${doc.assessmentId?.toString()}`;
            answersByPastorAssessment.set(key, doc);
        }

        const items: ReviewItemDto[] = buildReviewItemsForMentor({
            pastors: pastors.map((p) => ({
                pastorId: p.pastorId,
                pastorName: pastorNameById.get(p.pastorId) ?? 'Pastor',
            })),
            assignedRoadmapIdsByPastor,
            assignedAssessmentIdsByPastor,
            roadmapMetaById,
            extrasByPastorRoadmap,
            assessmentNameById,
            answersByPastorAssessment,
        });

        const generatedInMs = Date.now() - startedAt;
        const response: MentorReviewCenterResponseDto = {
            items,
            pastors,
            generatedInMs,
            cached: false,
        };

        this.logger.log(
            `Review Center aggregated for mentor=${mentorId}: ${mentees.length} mentees, ` +
                `${items.length} items in ${generatedInMs}ms ` +
                `(roadmaps=${roadmapObjectIds.length}, assessments=${assessmentObjectIds.length}, ` +
                `extrasDocs=${extrasDocs.length}, answerDocs=${answerDocs.length})`,
        );

        this.cache.set(cacheKey, response, menteeIdStrings);
        return response;
    }
}
