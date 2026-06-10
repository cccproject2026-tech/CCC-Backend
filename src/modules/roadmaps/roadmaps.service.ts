import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoadMap, RoadMapDocument } from './schemas/roadmap.schema';
import { CommentItem, Comments, CommentsDocument } from './schemas/comments.schema';
import { CreateRoadMapDto, RoadMapResponseDto, UpdateRoadMapDto, UpdateNestedRoadMapItemDto, NestedRoadMapItemDto } from './dto/roadmap.dto';
import { toRoadMapResponseDto } from './utils/roadmaps.mapper';
import { Queries, QueriesDocument, QueryItem } from './schemas/queries.schema';
import { AddCommentDto, CommentsThreadResponseDto } from './dto/comments.dto';
import { CreateQueryDto, QueriesThreadResponseDto, ReplyQueryDto, UpdateQueryDto } from './dto/queries.dto';
import { toCommentsThreadResponseDto } from './utils/comments.mapper';
import { toQueriesThreadResponseDto } from './utils/queries.mapper';
import { VALID_ROADMAP_STATUSES, ROADMAP_STATUSES, QUERY_STATUSES } from '../../common/constants/status.constants';
import { Extras, ExtrasDocument } from './schemas/extras.schema';
import {
    CreateExtrasDto,
    UpdateExtrasDto,
    ExtrasResponseDto,
    ExtrasDocumentDto,
    RoadmapSubmissionActivityDto,
} from './dto/extras.dto';
import { toExtrasResponseDto } from './utils/extras.mapper';
import { Progress, ProgressDocument } from '../progress/schemas/progress.schema';
import { toObjectId } from 'src/common/pipes/to-object-id.pipe';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Availability, AvailabilityDocument } from '../appointments/schemas/availability.schema';
import { Appointment, AppointmentDocument } from '../appointments/schemas/appointment.schema';
import { buildMeetingDate, normalizeRoadmapName, SESSION_FLOW, SESSION_NOTES } from './utils/helper';
import { AppointmentsService } from '../appointments/appointments.service';
import { S3Service } from '../s3/s3.service';
import { MailerService } from '../../common/utils/mail.util';
import { ROLES } from '../../common/constants/roles.constants';
import { APPOINTMENT_PLATFORMS, APPOINTMENT_STATUSES, PROGRESS_STATUSES } from '../../common/constants/status.constants';

function resolveDefaultSteps(totalSteps?: number, extras?: any[]): number {
    if (typeof totalSteps === 'number' && totalSteps > 0) {
        return totalSteps;
    }

    const extrasCount = extras?.length ?? 0;
    return extrasCount > 0 ? extrasCount : 1;
}

/** Align with progress assignment: parent + nested template steps when progress.totalSteps is unset. */
function resolveRoadmapProgressTotalSteps(roadmap?: {
    totalSteps?: number;
    extras?: unknown[];
    roadmaps?: { totalSteps?: number; extras?: unknown[] }[];
} | null): number {
    if (!roadmap) return 0;
    if (typeof roadmap.totalSteps === 'number' && roadmap.totalSteps > 0) {
        return roadmap.totalSteps;
    }
    const ownSteps = roadmap.extras?.length ?? 0;
    const nestedSteps = (roadmap.roadmaps ?? []).reduce((sum, nested) => {
        if (typeof nested?.totalSteps === 'number' && nested.totalSteps > 0) {
            return sum + nested.totalSteps;
        }
        const nestedExtras = nested?.extras?.length ?? 0;
        return sum + (nestedExtras > 0 ? nestedExtras : 1);
    }, 0);
    return ownSteps + nestedSteps > 0 ? ownSteps + nestedSteps : 1;
}

const MENTORING_JOURNEY_SESSION_MAX = SESSION_NOTES.length;

const JUMPSTART_MENTOR_NO_AVAILABILITY_MSG =
    'Your assigned mentor has not configured availability. Please ask your mentor to set availability before completing Jumpstart.';

const JUMPSTART_NO_MENTOR_MSG =
    'No mentor is assigned to your account. Please contact support before completing Jumpstart.';

const JUMPSTART_NO_SLOTS_MSG =
    'No available mentoring slots were found for the assigned mentor. Please ask the mentor to update their availability.';

const JUMPSTART_NO_SLOTS_NOTICE_MSG =
    'No available mentoring slots were found that satisfy the minimum scheduling notice period.';

type AvailabilitySlotLike = {
    startTime: string;
    startPeriod: string;
    endTime?: string;
    endPeriod?: string;
};

type AvailabilityDayLike = {
    date: Date;
    unavailable?: boolean;
    slots?: AvailabilitySlotLike[];
};

type MentorSlotBookingResult = {
    appointment: { id: string };
    meetingDate: Date;
    selectedSlot: AvailabilitySlotLike;
    selectedDay: AvailabilityDayLike;
};

@Injectable()
export class RoadMapsService {
    private readonly logger = new Logger(RoadMapsService.name);

    constructor(
        @InjectModel(RoadMap.name) private roadMapModel: Model<RoadMapDocument>,
        @InjectModel(Comments.name) private commentsModel: Model<CommentsDocument>,
        @InjectModel(Queries.name) private queriesModel: Model<QueriesDocument>,
        @InjectModel(Extras.name) private extrasModel: Model<ExtrasDocument>,
        @InjectModel(Progress.name) private progressModel: Model<ProgressDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(Availability.name) private availabilityModel: Model<AvailabilityDocument>,
        @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
        private readonly s3Service: S3Service,
        private readonly appointmentService: AppointmentsService,
        private readonly mailer: MailerService,
        private readonly configService: ConfigService,
    ) { }

    /** Hours after Jumpstart completion before Session 1 may start (`JUMPSTART_MIN_NOTICE_HOURS`, default 2). */
    private getJumpstartMinNoticeHours(): number {
        const raw = this.configService.get<number | string>('jumpstart.minNoticeHours');
        const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '2'));
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
    }

    private async assertJumpstartFirstBookableSlot(
        mentorIdStr: string,
        pastorUserIdStr: string,
    ): Promise<void> {
        const minNoticeHours = this.getJumpstartMinNoticeHours();
        const slotNotes = 'Mentoring Session 1 scheduled from Jumpstart completion.';

        const withNotice = await this.findFirstBookableMentorSlot(mentorIdStr, pastorUserIdStr, {
            notes: slotNotes,
            book: false,
            minNoticeHours,
        });
        if (withNotice) {
            return;
        }

        const withoutNotice = await this.findFirstBookableMentorSlot(mentorIdStr, pastorUserIdStr, {
            notes: slotNotes,
            book: false,
        });
        if (withoutNotice) {
            throw new BadRequestException(JUMPSTART_NO_SLOTS_NOTICE_MSG);
        }

        throw new BadRequestException(JUMPSTART_NO_SLOTS_MSG);
    }

    private excerpt(raw: string, max = 500): string {
        const text = (raw ?? '').trim();
        if (!text.length) return '';
        if (text.length <= max) return text;
        return `${text.slice(0, max).trimEnd()}…`;
    }

    /**
     * Director library listing: ordered roadmaps first by displayOrder ascending;
     * items without displayOrder sort after, by createdAt ascending.
     */
    private sortRoadmapsByLibraryOrder<
        T extends { _id: Types.ObjectId; displayOrder?: number; createdAt?: Date },
    >(items: T[]): T[] {
        return [...items].sort((a, b) => {
            const ao = a.displayOrder;
            const bo = b.displayOrder;
            const aHas = typeof ao === 'number' && Number.isFinite(ao);
            const bHas = typeof bo === 'number' && Number.isFinite(bo);
            if (aHas && bHas && ao !== bo) return ao - bo;
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return ac - bc;
        });
    }

    private isPastoralLearnerRole(role?: string): boolean {
        const r = (role ?? '').trim().toLowerCase();
        return r === ROLES.PASTOR || r === ROLES.LAY_LEADER || r === ROLES.SEMINARIAN;
    }

    private isMentorTrackRole(role?: string): boolean {
        const r = (role ?? '').trim().toLowerCase();
        return r === ROLES.MENTOR || r === ROLES.FIELD_MENTOR;
    }

    /**
     * Creates a mentoring appointment via AppointmentsService so Zoom link generation
     * and related side-effects are consistently applied for session flows too.
     */
    private async createMentoringSessionAppointment(
        userId: Types.ObjectId,
        mentorId: Types.ObjectId,
        meetingDate: Date,
        notes: string,
    ): Promise<{ id: string }> {
        const created = await this.appointmentService.create({
            userId: userId.toString(),
            mentorId: mentorId.toString(),
            meetingDate: meetingDate.toISOString(),
            platform: APPOINTMENT_PLATFORMS.ZOOM,
            notes,
            initiatorRole: 'director',
            isSessionBooking: true,
        });
        return { id: created.id };
    }

    private toMentorObjectId(mentorId: Types.ObjectId | string): Types.ObjectId {
        return mentorId instanceof Types.ObjectId
            ? mentorId
            : new Types.ObjectId(String(mentorId));
    }

    private sortAvailabilityDays(days: AvailabilityDayLike[]): AvailabilityDayLike[] {
        return [...days].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
    }

    private slotMeetingTimeMs(day: AvailabilityDayLike, slot: AvailabilitySlotLike): number {
        return buildMeetingDate(day.date, slot).getTime();
    }

    private sortSlotsForDay(
        day: AvailabilityDayLike,
        slots: AvailabilitySlotLike[],
    ): AvailabilitySlotLike[] {
        return [...slots].sort(
            (a, b) => this.slotMeetingTimeMs(day, a) - this.slotMeetingTimeMs(day, b),
        );
    }

    private async mentorSlotHasOverlap(
        mentorOid: Types.ObjectId,
        tryDate: Date,
        durationMinutes: number,
    ): Promise<boolean> {
        const endTime = new Date(tryDate.getTime() + durationMinutes * 60000);
        const overlap = await this.appointmentModel.findOne({
            mentorId: mentorOid,
            meetingDate: { $lt: endTime },
            endTime: { $gt: tryDate },
            status: {
                $in: [APPOINTMENT_STATUSES.SCHEDULED, APPOINTMENT_STATUSES.IN_PROGRESS],
            },
        });
        return Boolean(overlap);
    }

    private isSlotBookingConflictError(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return (
            msg.includes('already booked') ||
            msg.includes('not available') ||
            msg.includes('maximum bookings')
        );
    }

    /**
     * Walks mentor weekly availability in chronological order and returns the first future
     * bookable slot. Shared by Jumpstart Session 1, {@link getMentorFromPastor}, and redo flows.
     */
    private async findFirstBookableMentorSlot(
        mentorId: Types.ObjectId | string,
        pastorUserId: string,
        options: { notes: string; book: boolean; minNoticeHours?: number },
    ): Promise<MentorSlotBookingResult | null> {
        const mentorOid = this.toMentorObjectId(mentorId);
        const availability = await this.availabilityModel.findOne({ mentorId: mentorOid }).lean().exec();
        if (!availability?.weeklySlots?.length) {
            return null;
        }

        const now = Date.now();
        const earliestAllowedMs =
            options.minNoticeHours != null && options.minNoticeHours > 0
                ? now + options.minNoticeHours * 60 * 60 * 1000
                : now;
        const durationMinutes = availability.meetingDuration ?? 60;
        const days = this.sortAvailabilityDays(availability.weeklySlots as AvailabilityDayLike[]);

        for (const day of days) {
            if (day.unavailable) {
                continue;
            }

            const slots = this.sortSlotsForDay(day, day.slots ?? []);
            for (const slot of slots) {
                const tryDate = buildMeetingDate(day.date, slot);
                if (tryDate.getTime() < earliestAllowedMs) {
                    continue;
                }

                if (!options.book) {
                    const hasOverlap = await this.mentorSlotHasOverlap(
                        mentorOid,
                        tryDate,
                        durationMinutes,
                    );
                    if (hasOverlap) {
                        continue;
                    }

                    return {
                        appointment: { id: '' },
                        meetingDate: tryDate,
                        selectedSlot: slot,
                        selectedDay: day,
                    };
                }

                try {
                    const appointment = await this.appointmentService.create({
                        userId: pastorUserId,
                        mentorId: mentorOid.toString(),
                        meetingDate: tryDate.toISOString(),
                        platform: APPOINTMENT_PLATFORMS.ZOOM,
                        notes: options.notes,
                        initiatorRole: 'director',
                        isSessionBooking: true,
                    });

                    return {
                        appointment: { id: appointment.id },
                        meetingDate: tryDate,
                        selectedSlot: slot,
                        selectedDay: day,
                    };
                } catch (err: unknown) {
                    if (this.isSlotBookingConflictError(err)) {
                        continue;
                    }
                    throw err;
                }
            }
        }

        return null;
    }

    private async removeBookedSlotFromMentorAvailability(
        mentorId: Types.ObjectId | string,
        selectedDay: AvailabilityDayLike,
        selectedSlot: AvailabilitySlotLike,
    ): Promise<void> {
        const mentorOid = this.toMentorObjectId(mentorId);
        await this.availabilityModel.updateOne(
            { mentorId: mentorOid },
            {
                $pull: {
                    'weeklySlots.$[day].slots': {
                        startTime: selectedSlot.startTime,
                        startPeriod: selectedSlot.startPeriod,
                        endTime: selectedSlot.endTime,
                        endPeriod: selectedSlot.endPeriod,
                    },
                },
            },
            {
                arrayFilters: [{ 'day.date': selectedDay.date }],
            },
        );
    }

    async create(dto: CreateRoadMapDto, image?: Express.Multer.File): Promise<RoadMapResponseDto> {
        const existing = await this.roadMapModel.findOne({ name: dto.name }).lean().exec();
        if (existing) {
            throw new BadRequestException(`RoadMap with name '${dto.name}' already exists.`);
        }

        let imageUrl: string | undefined;

        if (image) {
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedMimeTypes.includes(image.mimetype)) {
                throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed');
            }

            const maxSize = 5 * 1024 * 1024; // 5MB
            if (image.size > maxSize) {
                throw new BadRequestException('File size exceeds 5MB limit');
            }

            const timestamp = Date.now();
            const fileExtension = image.originalname.split('.').pop();
            const key = `roadmaps/images/${timestamp}.${fileExtension}`;

            imageUrl = await this.s3Service.uploadFile(key, image.buffer, image.mimetype);
        }

        const roadmapsWithSteps = (dto.roadmaps || []).map(nested => ({
            ...nested,
            totalSteps: resolveDefaultSteps(nested.totalSteps, nested.extras),
        }));

        const nestedTotalSteps = roadmapsWithSteps.reduce(
            (sum, nested) => sum + nested.totalSteps,
            0
        );
        const mainExtrasSteps = dto.extras?.length ?? 0;
        const computedTotalSteps = dto.totalSteps && dto.totalSteps > 0
            ? dto.totalSteps
            : mainExtrasSteps + nestedTotalSteps > 0
                ? mainExtrasSteps + nestedTotalSteps
                : 1;

        const roadMap = await this.roadMapModel.create({
            ...dto,
            roadmaps: roadmapsWithSteps,
            totalSteps: computedTotalSteps,
            ...(imageUrl && { imageUrl }),
        });
        return toRoadMapResponseDto(roadMap);
    }

    async findAll(status: string, search: string): Promise<RoadMapResponseDto[]> {
        const query: any = {};

        const normalizedStatus = status?.toLowerCase();

        if (normalizedStatus && normalizedStatus !== ROADMAP_STATUSES.ALL && VALID_ROADMAP_STATUSES.includes(normalizedStatus as any)) {
            query.status = normalizedStatus;
        }

        if (search) {
            // Escape special regex characters to prevent ReDoS attacks
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.name = { $regex: escapedSearch, $options: 'i' };
        }

        const roadmaps = await this.roadMapModel.find(query).lean().exec();
        const sorted = this.sortRoadmapsByLibraryOrder(roadmaps);
        return sorted.map(rm => toRoadMapResponseDto(rm as any));
    }

    /**
     * Sets displayOrder from 1-based index in orderedRoadmapIds (array position).
     * Invalid Mongo ids and ids that do not exist are skipped (no error).
     * Duplicate ids: first occurrence wins.
     */
    async reorderRoadmaps(orderedRoadmapIds: string[]): Promise<{ updatedCount: number }> {
        if (!Array.isArray(orderedRoadmapIds) || orderedRoadmapIds.length === 0) {
            throw new BadRequestException('orderedRoadmapIds must contain at least one id.');
        }

        const candidates = [...new Set(orderedRoadmapIds.map((id) => String(id).trim()).filter(Boolean))]
            .filter((id) => Types.ObjectId.isValid(id));

        if (candidates.length === 0) {
            return { updatedCount: 0 };
        }

        const objectIds = candidates.map((id) => new Types.ObjectId(id));
        const existingDocs = await this.roadMapModel
            .find({ _id: { $in: objectIds } })
            .select('_id')
            .lean()
            .exec();
        const existingSet = new Set(existingDocs.map((d) => d._id.toString()));

        const seen = new Set<string>();
        const bulkOps: {
            updateOne: {
                filter: { _id: Types.ObjectId };
                update: { $set: { displayOrder: number } };
            };
        }[] = [];

        for (let i = 0; i < orderedRoadmapIds.length; i++) {
            const raw = orderedRoadmapIds[i];
            const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
            if (!s || !Types.ObjectId.isValid(s)) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            if (!existingSet.has(s)) continue;
            bulkOps.push({
                updateOne: {
                    filter: { _id: new Types.ObjectId(s) },
                    update: { $set: { displayOrder: i + 1 } },
                },
            });
        }

        if (bulkOps.length > 0) {
            await this.roadMapModel.bulkWrite(bulkOps);
        }

        return { updatedCount: bulkOps.length };
    }

    async findById(id: string): Promise<RoadMapResponseDto> {
        const roadmap = await this.roadMapModel.findById(id).lean().exec();

        if (!roadmap) {
            throw new NotFoundException(`RoadMap with ID "${id}" not found`);
        }

        return toRoadMapResponseDto(roadmap as any);
    }

    async update(id: string, dto: UpdateRoadMapDto, image?: Express.Multer.File): Promise<RoadMapResponseDto> {
        if (dto.name) {
            const existing = await this.roadMapModel.findOne({
                name: dto.name,
                _id: { $ne: new Types.ObjectId(id) }
            }).lean().exec();

            if (existing) {
                throw new BadRequestException(`RoadMap with name '${dto.name}' already exists.`);
            }
        }

        let imageUrl: string | undefined;

        if (image) {
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedMimeTypes.includes(image.mimetype)) {
                throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed');
            }

            const maxSize = 5 * 1024 * 1024; // 5MB
            if (image.size > maxSize) {
                throw new BadRequestException('File size exceeds 5MB limit');
            }

            const timestamp = Date.now();
            const fileExtension = image.originalname.split('.').pop();
            const key = `roadmaps/${id}/images/${timestamp}.${fileExtension}`;

            imageUrl = await this.s3Service.uploadFile(key, image.buffer, image.mimetype);
        }

        const updatedRoadmap = await this.roadMapModel.findByIdAndUpdate(
            id,
            {
                ...dto,
                ...(imageUrl && { imageUrl }),
            },
            {
                new: true,
                runValidators: true
            }
        ).lean().exec();

        if (!updatedRoadmap) {
            throw new NotFoundException(`RoadMap with ID "${id}" not found`);
        }

        return toRoadMapResponseDto(updatedRoadmap);
    }

    async delete(id: string): Promise<{ _id: string }> {
        const result = await this.roadMapModel.findByIdAndDelete(id).exec();

        if (!result) {
            throw new NotFoundException(`RoadMap with ID "${id}" not found`);
        }

        return { _id: id };
    }

    // async getRoadMap(id: string): Promise<{ roadmap: RoadMapResponseDto; comments: CommentsResponseDto }> {
    //     const roadmapDoc = await this.roadMapModel.findById(id).exec();

    //     if (!roadmapDoc) {
    //         throw new NotFoundException(`RoadMap with ID "${id}" not found`);
    //     }

    //     const comments = await this.commentsModel.find({ roadMapId: id }).exec();
    //     const roadmapDto = toRoadMapResponseDto(roadmapDoc as RoadMapDocument);

    //     return { roadmap: roadmapDto, comments };
    // }

    private resolveCommentNestedTaskId(dto: AddCommentDto): Types.ObjectId | null {
        const raw = dto.nestedRoadMapItemId ?? dto.taskId;
        if (!raw) {
            return null;
        }
        if (!Types.ObjectId.isValid(raw)) {
            throw new BadRequestException('Invalid nested task id');
        }
        return new Types.ObjectId(raw);
    }

    private async assertNestedTaskBelongsToRoadmap(
        roadMapId: string,
        nestedRoadMapItemId: Types.ObjectId,
    ): Promise<void> {
        const roadmap = await this.roadMapModel
            .findById(roadMapId)
            .select('roadmaps._id')
            .lean()
            .exec();
        if (!roadmap) {
            throw new NotFoundException(`RoadMap with ID "${roadMapId}" not found`);
        }
        const nestedIds = new Set(
            (roadmap.roadmaps ?? []).map((item: { _id?: Types.ObjectId }) =>
                item._id?.toString(),
            ),
        );
        if (!nestedIds.has(nestedRoadMapItemId.toString())) {
            throw new BadRequestException(
                'nestedRoadMapItemId does not belong to this roadmap',
            );
        }
    }

    async getCommentThread(
        roadMapId: string,
        userId: string,
        nestedRoadMapItemId?: string,
    ): Promise<CommentsThreadResponseDto> {
        const thread = await this.commentsModel.findOne({
            roadMapId: new Types.ObjectId(roadMapId),
            userId: new Types.ObjectId(userId)
        })
            .populate('comments.mentorId')
            .lean()
            .exec();

        if (!thread) {
            return { _id: '', userId, roadMapId, comments: [] };
        }

        const response = toCommentsThreadResponseDto(thread as any);

        if (nestedRoadMapItemId) {
            if (!Types.ObjectId.isValid(nestedRoadMapItemId)) {
                throw new BadRequestException('Invalid nested task id');
            }
            const taskIdStr = new Types.ObjectId(nestedRoadMapItemId).toString();
            response.comments = response.comments.filter(
                (c) => c.nestedRoadMapItemId === taskIdStr,
            );
        }

        return response;
    }

    async addComment(roadMapId: string, dto: AddCommentDto): Promise<CommentsThreadResponseDto> {
        const roadMapObjectId = new Types.ObjectId(roadMapId);
        const userObjectId = new Types.ObjectId(dto.userId);

        const nestedTaskId = this.resolveCommentNestedTaskId(dto);
        if (nestedTaskId) {
            await this.assertNestedTaskBelongsToRoadmap(roadMapId, nestedTaskId);
        }

        const newComment: CommentItem = {
            mentorId: new Types.ObjectId(dto.mentorId),
            text: dto.text,
            addedDate: new Date(),
            nestedRoadMapItemId: nestedTaskId,
        } as CommentItem;

        const updatedThread = await this.commentsModel.findOneAndUpdate(
            { roadMapId: roadMapObjectId, userId: userObjectId },
            {
                $push: { comments: newComment },
                $setOnInsert: { roadMapId: roadMapObjectId, userId: userObjectId }
            },
            { new: true, upsert: true }
        )
            .lean()
            .exec();

        try {
            const [roadmap, pastor, mentor] = await Promise.all([
                this.roadMapModel.findById(roadMapId).select('name').lean().exec(),
                this.userModel.findById(userObjectId).select('email firstName').lean().exec(),
                this.userModel.findById(dto.mentorId).select('firstName lastName').lean().exec(),
            ]);
            const roadMapName =
                roadmap && 'name' in roadmap ? `${(roadmap as { name: string }).name}` : 'Roadmap';
            const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : 'Your mentor';

            const commentExcerpt = this.excerpt(dto.text);

            if (pastor?.email) {
                void this.mailer.sendPastorRoadmapComment({
                    to: pastor.email,
                    pastorFirstName: pastor.firstName,
                    mentorName,
                    roadMapName,
                    commentExcerpt: commentExcerpt || '(New comment — see CCC app)',
                });
            }
        } catch {
            /* non-blocking */
        }

        return toCommentsThreadResponseDto(updatedThread as any);
    }

    async getAllQueryThreads(
        roadMapId: string,
        userId: string,
        status?: string,
        nestedRoadMapItemId?: string,
    ): Promise<QueriesThreadResponseDto[]> {
        const roadMapObjectId = new Types.ObjectId(roadMapId);
        const userObjectId = new Types.ObjectId(userId);

        let nestedFilterId: Types.ObjectId | undefined;
        if (nestedRoadMapItemId != null && String(nestedRoadMapItemId).trim() !== '') {
            const trimmed = String(nestedRoadMapItemId).trim();
            if (!Types.ObjectId.isValid(trimmed)) {
                throw new BadRequestException('Invalid nestedRoadMapItemId.');
            }
            nestedFilterId = new Types.ObjectId(trimmed);
        }

        const pipeline: any[] = [
            { $match: { roadMapId: roadMapObjectId, userId: userObjectId } },

            { $unwind: '$queries' },

            ...(status ? [{ $match: { 'queries.status': status } }] : []),

            {
                $lookup: {
                    from: 'users',
                    let: { mentorId: '$queries.repliedMentorId', queryStatus: '$queries.status' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$$mentorId', '$_id'] },
                                        { $eq: ['$$queryStatus', QUERY_STATUSES.ANSWERED] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 1, email: 1, firstName: 1, lastName: 1, profilePicture: 1, role: 1 } }
                    ],
                    as: 'populatedMentor'
                }
            },

            {
                $set: {
                    'queries.repliedMentorId': {
                        $cond: {
                            if: { $ne: ['$populatedMentor', []] },
                            then: { $arrayElemAt: ['$populatedMentor', 0] },
                            else: '$queries.repliedMentorId'
                        }
                    }
                }
            },

            { $unset: 'populatedMentor' },

            {
                $group: {
                    _id: '$_id',
                    userId: { $first: '$userId' },
                    roadMapId: { $first: '$roadMapId' },
                    queries: { $push: '$queries' },
                },
            },
        ];

        const threads = await this.queriesModel.aggregate(pipeline).exec();
        let mapped = threads.map(toQueriesThreadResponseDto);

        if (nestedFilterId) {
            const nid = nestedFilterId.toString();
            mapped = mapped
                .map((t) => ({
                    ...t,
                    queries: t.queries.filter((q) => q.nestedRoadMapItemId === nid),
                }))
                .filter((t) => t.queries.length > 0);
        }

        return mapped;
    }

    async addQuery(roadMapId: string, dto: CreateQueryDto): Promise<QueriesThreadResponseDto> {
        const roadMapObjectId = new Types.ObjectId(roadMapId);
        const userObjectId = new Types.ObjectId(dto.userId);

        const newQuery: QueryItem = {
            actualQueryText: dto.actualQueryText,
            createdDate: new Date(),
            status: QUERY_STATUSES.PENDING,
            ...(dto.nestedRoadMapItemId?.trim()
                ? { nestedRoadMapItemId: new Types.ObjectId(dto.nestedRoadMapItemId.trim()) }
                : {}),
        } as QueryItem;

        const updatedThread = await this.queriesModel.findOneAndUpdate(
            { roadMapId: roadMapObjectId, userId: userObjectId },
            {
                $push: { queries: newQuery },
                $setOnInsert: { roadMapId: roadMapObjectId, userId: userObjectId }
            },
            { new: true, upsert: true }
        )
            .lean()
            .exec();

        void this.notifyMentorsOfPastorRoadmapQuestion(roadMapId, dto.userId, dto.actualQueryText);

        return toQueriesThreadResponseDto(updatedThread as any);
    }

    private async notifyMentorsOfPastorRoadmapQuestion(
        roadMapId: string,
        pastorMongoUserId: string,
        actualQueryText: string,
    ) {
        try {
            const [roadmap, pastor] = await Promise.all([
                this.roadMapModel.findById(roadMapId).select('name').lean().exec(),
                this.userModel
                    .findById(new Types.ObjectId(pastorMongoUserId))
                    .select('assignedId email firstName lastName role')
                    .lean()
                    .exec(),
            ]);
            const roadMapName = roadmap && 'name' in roadmap ? `${(roadmap as { name: string }).name}` : 'Roadmap';
            if (!pastor?.assignedId?.length) return;

            const pastorName = `${pastor.firstName} ${pastor.lastName}`;
            const excerptText = this.excerpt(actualQueryText);
            const seen = new Set<string>();

            if (!this.isPastoralLearnerRole((pastor as { role?: string }).role)) return;

            for (const mentorRef of pastor.assignedId) {
                const mid = mentorRef.toString();
                if (seen.has(mid)) continue;
                seen.add(mid);
                const mentor = await this.userModel.findById(mentorRef).select('email firstName role').lean().exec();
                const roleStr = mentor && 'role' in mentor ? `${(mentor as { role: string }).role}` : '';
                if (!mentor?.email || !this.isMentorTrackRole(roleStr)) continue;
                void this.mailer.sendMentorNewPastorQuery({
                    to: mentor.email,
                    mentorFirstName: mentor.firstName,
                    pastorName,
                    roadMapName,
                    excerpt: excerptText || '(Question posted — see CCC app)',
                });
            }
        } catch {
            /* non-blocking */
        }
    }

    async replyQuery(roadMapId: string, queryItemId: string, dto: ReplyQueryDto): Promise<QueriesThreadResponseDto> {
        const mentorObjectId = new Types.ObjectId(dto.repliedMentorId);
        const queryItemObjectId = new Types.ObjectId(queryItemId);
        const roadMapObjectId = new Types.ObjectId(roadMapId)

        const updatedThread = await this.queriesModel.findOneAndUpdate(
            {
                roadMapId: roadMapObjectId,
                'queries._id': queryItemObjectId
            },
            {
                $set: {
                    'queries.$.repliedAnswer': dto.repliedAnswer,
                    'queries.$.repliedDate': new Date(),
                    'queries.$.repliedMentorId': mentorObjectId,
                    'queries.$.status': QUERY_STATUSES.ANSWERED,
                }
            },
            { new: true }
        )
            .lean()
            .exec();

        if (!updatedThread) {
            throw new NotFoundException(`Query thread or item ID ${queryItemId} not found.`);
        }

        try {
            const [roadmap, pastor, mentor] = await Promise.all([
                this.roadMapModel.findById(roadMapId).select('name').lean().exec(),
                this.userModel.findById(updatedThread.userId).select('email firstName').lean().exec(),
                this.userModel.findById(mentorObjectId).select('firstName lastName').lean().exec(),
            ]);
            const roadMapName =
                roadmap && 'name' in roadmap ? `${(roadmap as { name: string }).name}` : 'Roadmap';
            const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : 'Your mentor';

            const excerptAnswer = this.excerpt(dto.repliedAnswer);
            if (pastor?.email) {
                void this.mailer.sendPastorQueryAnswered({
                    to: pastor.email,
                    pastorFirstName: pastor.firstName,
                    mentorName,
                    roadMapName,
                    answerExcerpt: excerptAnswer || '(Reply posted — see CCC app)',
                });
            }
        } catch {
            /* non-blocking */
        }

        return toQueriesThreadResponseDto(updatedThread as any);
    }

    async updateQuery(
        roadMapId: string,
        queryItemId: string,
        dto: UpdateQueryDto,
    ): Promise<QueriesThreadResponseDto> {
        const roadMapObjectId = new Types.ObjectId(roadMapId);
        const userObjectId = new Types.ObjectId(dto.userId);
        const queryItemObjectId = new Types.ObjectId(queryItemId);

        const thread = await this.queriesModel
            .findOne({
                roadMapId: roadMapObjectId,
                userId: userObjectId,
                'queries._id': queryItemObjectId,
            })
            .lean()
            .exec() as QueriesDocument | null;

        if (!thread) {
            throw new NotFoundException(
                'Query thread not found, or query item does not belong to this roadmap and user.',
            );
        }

        const item = (thread.queries || []).find(
            (q: QueryItem) => q._id != null && q._id.equals(queryItemObjectId),
        );

        if (!item) {
            throw new NotFoundException(`Query item ${queryItemId} not found.`);
        }
        if (item.status !== QUERY_STATUSES.PENDING) {
            throw new BadRequestException('Only pending queries can be edited.');
        }

        const updatedThread = await this.queriesModel
            .findOneAndUpdate(
                {
                    roadMapId: roadMapObjectId,
                    userId: userObjectId,
                    'queries._id': queryItemObjectId,
                },
                {
                    $set: { 'queries.$.actualQueryText': dto.actualQueryText },
                },
                { new: true },
            )
            .lean()
            .exec();

        if (!updatedThread) {
            throw new NotFoundException('Query could not be updated.');
        }

        return toQueriesThreadResponseDto(updatedThread as any);
    }

    async deleteQuery(
        roadMapId: string,
        queryItemId: string,
        userId: string,
    ): Promise<QueriesThreadResponseDto> {
        const roadMapObjectId = new Types.ObjectId(roadMapId);
        const userObjectId = new Types.ObjectId(userId);
        const queryItemObjectId = new Types.ObjectId(queryItemId);

        const thread = await this.queriesModel
            .findOne({
                roadMapId: roadMapObjectId,
                userId: userObjectId,
            })
            .lean()
            .exec() as QueriesDocument | null;

        if (!thread) {
            throw new NotFoundException('Query thread not found for this roadmap and user.');
        }

        const item = (thread.queries || []).find(
            (q: QueryItem) => q._id != null && q._id.equals(queryItemObjectId),
        );

        if (!item) {
            throw new NotFoundException(`Query item ${queryItemId} not found.`);
        }
        if (item.status !== QUERY_STATUSES.PENDING) {
            throw new BadRequestException('Only pending queries can be deleted.');
        }

        const updatedThread = await this.queriesModel
            .findOneAndUpdate(
                { roadMapId: roadMapObjectId, userId: userObjectId },
                {
                    $pull: {
                        queries: {
                            _id: queryItemObjectId,
                        },
                    },
                },
                { new: true },
            )
            .lean()
            .exec();

        if (!updatedThread) {
            throw new NotFoundException('Query could not be deleted.');
        }

        return toQueriesThreadResponseDto(updatedThread as any);
    }

    async updateNestedRoadMapItem(roadMapId: string, nestedItemId: string, dto: UpdateNestedRoadMapItemDto, image?: Express.Multer.File): Promise<RoadMapResponseDto> {
        const updateFields: any = {};

        Object.keys(dto).forEach(key => {
            if (dto[key] !== undefined) {
                updateFields[`roadmaps.$.${key}`] = dto[key];
            }
        });

        if (image) {
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedMimeTypes.includes(image.mimetype)) {
                throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed');
            }

            const maxSize = 5 * 1024 * 1024; // 5MB
            if (image.size > maxSize) {
                throw new BadRequestException('File size exceeds 5MB limit');
            }

            const timestamp = Date.now();
            const fileExtension = image.originalname.split('.').pop();
            const key = `roadmaps/${roadMapId}/nested/${nestedItemId}/images/${timestamp}.${fileExtension}`;

            const imageUrl = await this.s3Service.uploadFile(key, image.buffer, image.mimetype);
            updateFields['roadmaps.$.imageUrl'] = imageUrl;
        }

        const updatedRoadmap = await this.roadMapModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(roadMapId),
                'roadmaps._id': new Types.ObjectId(nestedItemId)
            },
            { $set: updateFields },
            { new: true, runValidators: true }
        )
            .lean()
            .exec();

        if (!updatedRoadmap) {
            throw new NotFoundException(`RoadMap with ID "${roadMapId}" or nested item with ID "${nestedItemId}" not found`);
        }

        return toRoadMapResponseDto(updatedRoadmap);
    }

    async addNestedRoadMap(roadMapId: string, dto: NestedRoadMapItemDto, image?: Express.Multer.File): Promise<RoadMapResponseDto> {
        const roadMapObjectId = new Types.ObjectId(roadMapId);
        const nestedRoadmapTotalSteps = resolveDefaultSteps(dto.totalSteps, dto.extras);

        let imageUrl: string | undefined;

        if (image) {
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedMimeTypes.includes(image.mimetype)) {
                throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed');
            }

            const maxSize = 5 * 1024 * 1024; // 5MB
            if (image.size > maxSize) {
                throw new BadRequestException('File size exceeds 5MB limit');
            }

            const timestamp = Date.now();
            const fileExtension = image.originalname.split('.').pop();
            const key = `roadmaps/${roadMapId}/nested/images/${timestamp}.${fileExtension}`;

            imageUrl = await this.s3Service.uploadFile(key, image.buffer, image.mimetype);
        }

        const updatedRoadmap = await this.roadMapModel.findByIdAndUpdate(
            roadMapObjectId,
            {
                $push: {
                    roadmaps: {
                        ...dto,
                        ...(imageUrl && { imageUrl }),
                    }
                },
                $inc: { totalSteps: nestedRoadmapTotalSteps },
                haveNextedRoadMaps: true,
            },
            {
                new: true,
                runValidators: true,
            }
        ).lean().exec();

        if (!updatedRoadmap) {
            throw new NotFoundException(`RoadMap with ID "${roadMapId}" not found`);
        }

        const nestedRoadmaps = updatedRoadmap.roadmaps || [];
        const newNestedRoadmap = nestedRoadmaps[nestedRoadmaps.length - 1];

        if (newNestedRoadmap) {
            await this.progressModel.updateMany(
                { 'roadmaps.roadMapId': roadMapObjectId },
                {
                    $push: {
                        'roadmaps.$[roadmap].nestedRoadmaps': {
                            nestedRoadmapId: newNestedRoadmap._id,
                            completedSteps: 0,
                            totalSteps: nestedRoadmapTotalSteps,
                            progressPercentage: 0,
                            status: 'not_started',
                        }
                    },
                    $inc: {
                        'roadmaps.$[roadmap].totalSteps': nestedRoadmapTotalSteps,
                    }
                },
                {
                    arrayFilters: [
                        { 'roadmap.roadMapId': roadMapObjectId }
                    ]
                }
            ).exec();
        }

        return toRoadMapResponseDto(updatedRoadmap);
    }

    async getExtras(roadMapId: string, userId: string, nestedRoadMapItemId?: string): Promise<ExtrasResponseDto | null> {
        const query: any = {
            roadMapId: new Types.ObjectId(roadMapId),
            userId: new Types.ObjectId(userId),
        };

        if (nestedRoadMapItemId) {
            query.nestedRoadMapItemId = new Types.ObjectId(nestedRoadMapItemId);
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        const extras = await this.extrasModel.findOne(query).lean().exec();
        return extras ? toExtrasResponseDto(extras as any) : null;
    }

    /**
     * Ensures a nested progress row exists before $inc; otherwise arrayFilters match nothing.
     */
    private async ensureNestedRoadmapProgressEntry(
        userObjectId: Types.ObjectId,
        userIdString: string | undefined,
        roadMapObjectId: Types.ObjectId,
        nestedRoadMapItemObjectId: Types.ObjectId,
        defaultTotalSteps = 1,
    ): Promise<void> {
        const userIdFlexibleQuery = {
            $or: [
                { userId: userObjectId },
                ...(userIdString ? [{ userId: userIdString }] : []),
            ],
        };

        const progress = await this.progressModel
            .findOne({
                ...userIdFlexibleQuery,
                'roadmaps.roadMapId': roadMapObjectId,
            })
            .exec();

        if (!progress) {
            return;
        }

        const roadmapEntry = progress.roadmaps.find(
            (r) => r.roadMapId?.toString() === roadMapObjectId.toString(),
        );
        if (!roadmapEntry) {
            return;
        }

        const nestedExists = roadmapEntry.nestedRoadmaps?.some(
            (n) =>
                n.nestedRoadmapId?.toString() ===
                nestedRoadMapItemObjectId.toString(),
        );
        if (nestedExists) {
            return;
        }

        await this.progressModel.updateOne(
            {
                ...userIdFlexibleQuery,
                'roadmaps.roadMapId': roadMapObjectId,
            },
            {
                $push: {
                    'roadmaps.$.nestedRoadmaps': {
                        nestedRoadmapId: nestedRoadMapItemObjectId,
                        completedSteps: 0,
                        totalSteps: defaultTotalSteps,
                        progressPercentage: 0,
                        status: PROGRESS_STATUSES.NOT_STARTED,
                    },
                },
            },
        );
    }

    async saveExtras(roadMapId: string, dto: CreateExtrasDto): Promise<ExtrasResponseDto> {
        const roadMapObjectId = toObjectId(roadMapId);
        const userObjectId = toObjectId(dto.userId);
        const userIdString = userObjectId?.toString();
        const nestedRoadMapItemObjectId = toObjectId(dto.nestedRoadMapItemId);

        if (!roadMapObjectId || !userObjectId) {
            throw new BadRequestException('Invalid RoadMap ID or User ID provided.');
        }

        // Build a consistent query that handles the null/missing nestedRoadMapItemId correctly
        const existsQuery: any = { roadMapId: roadMapObjectId, userId: userObjectId };
        if (nestedRoadMapItemObjectId) {
            existsQuery.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            existsQuery.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        // Guard: this is a first-time POST — reject if extras already exist
        const existing = await this.extrasModel.findOne(existsQuery).select('_id').lean().exec();
        if (existing) {
            throw new BadRequestException('Extras already exist for this roadmap. Use PATCH to add more extras.');
        }

        const now = new Date();
        const newExtras = (dto.extras || []).map(extra =>
            extra.type === 'SIGNATURE' && extra.signatureData && !extra.signedAt
                ? { ...extra, signedAt: now }
                : extra
        );

        await this.assertMentorAvailabilityBeforeJumpstartCompletion(
            userObjectId,
            userIdString,
            roadMapObjectId,
            newExtras.length,
        );

        let savedExtras: any;
        try {
            savedExtras = await this.extrasModel.create({
                roadMapId: roadMapObjectId,
                userId: userObjectId,
                nestedRoadMapItemId: nestedRoadMapItemObjectId ?? null,
                extras: newExtras,
                submittedAt: now,
                submissionNumber: 1,
            });
        } catch (err) {
            if (err?.code === 11000) {
                throw new BadRequestException('Extras already exist for this roadmap. Use PATCH to add more extras.');
            }
            throw err;
        }

        // Update progress by exact count of extras being saved
        if (newExtras.length > 0) {
            const userIdFlexibleQuery = {
                $or: [
                    { userId: userObjectId },
                    { userId: userIdString }
                ]
            };

            if (nestedRoadMapItemObjectId) {
                await this.ensureNestedRoadmapProgressEntry(
                    userObjectId,
                    userIdString,
                    roadMapObjectId,
                    nestedRoadMapItemObjectId,
                    newExtras.length,
                );
                await this.progressModel.findOneAndUpdate(
                    {
                        ...userIdFlexibleQuery,
                        'roadmaps.roadMapId': roadMapObjectId,
                        'roadmaps.nestedRoadmaps.nestedRoadmapId': nestedRoadMapItemObjectId
                    },
                    {
                        $inc: {
                            'roadmaps.$[roadmap].nestedRoadmaps.$[nested].completedSteps': newExtras.length,
                            'roadmaps.$[roadmap].completedSteps': newExtras.length
                        },
                    },
                    {
                        new: true,
                        arrayFilters: [
                            { 'roadmap.roadMapId': roadMapObjectId },
                            { 'nested.nestedRoadmapId': nestedRoadMapItemObjectId }
                        ]
                    }
                ).exec();
            } else {
                await this.progressModel.findOneAndUpdate(
                    {
                        ...userIdFlexibleQuery,
                        'roadmaps.roadMapId': roadMapObjectId
                    },
                    {
                        $inc: { 'roadmaps.$.completedSteps': newExtras.length },
                    },
                    { new: true }
                ).exec();
            }
        }

        if (!userObjectId) {
            throw new BadRequestException("User ID is required");
        }

        const roadmap = await this.roadMapModel
            .findById(roadMapObjectId)
            .lean();

        if (!roadmap) {
            throw new NotFoundException("Roadmap not found");
        }

        await this.maybeSyncJumpstartSessionOneAfterRoadmapCompletion(
            userObjectId,
            roadMapObjectId as Types.ObjectId,
        );

        return toExtrasResponseDto(savedExtras as any);
    }

    async updateExtras(roadMapId: string, userId: string, dto: UpdateExtrasDto, nestedRoadMapItemId?: string): Promise<ExtrasResponseDto> {
        const roadMapObjectId = toObjectId(roadMapId);
        const userObjectId = toObjectId(userId);
        const userIdString = userObjectId?.toString();
        const nestedRoadMapItemObjectId = toObjectId(nestedRoadMapItemId);

        if (!roadMapObjectId || !userObjectId) {
            throw new BadRequestException('Invalid RoadMap ID or User ID provided.');
        }

        const query: any = { roadMapId: roadMapObjectId, userId: userObjectId };
        if (nestedRoadMapItemObjectId) {
            query.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        const now = new Date();
        const incomingExtras = (dto.extras || []).map(extra =>
            extra.type === 'SIGNATURE' && extra.signatureData && !extra.signedAt
                ? { ...extra, signedAt: now }
                : extra
        );
        const newItemsCount = incomingExtras.length;

        await this.assertMentorAvailabilityBeforeJumpstartCompletion(
            userObjectId,
            userIdString,
            roadMapObjectId,
            newItemsCount,
        );

        const updatedExtras = await this.extrasModel.findOneAndUpdate(
            query,
            { $push: { extras: { $each: incomingExtras } } },
            { new: true, runValidators: true }
        ).lean().exec();

        if (!updatedExtras) {
            throw new NotFoundException(`Extras not found for user ${userId} and roadmap ${roadMapId}`);
        }

        if (newItemsCount > 0) {
            const userIdFlexibleQuery = {
                $or: [
                    { userId: userObjectId },
                    { userId: userIdString }
                ]
            };

            if (nestedRoadMapItemObjectId) {
                await this.ensureNestedRoadmapProgressEntry(
                    userObjectId,
                    userIdString,
                    roadMapObjectId,
                    nestedRoadMapItemObjectId,
                    newItemsCount,
                );
                await this.progressModel.findOneAndUpdate(
                    {
                        ...userIdFlexibleQuery,
                        'roadmaps.roadMapId': roadMapObjectId,
                        'roadmaps.nestedRoadmaps.nestedRoadmapId': nestedRoadMapItemObjectId
                    },
                    {
                        $inc: {
                            'roadmaps.$[roadmap].nestedRoadmaps.$[nested].completedSteps': newItemsCount,
                            'roadmaps.$[roadmap].completedSteps': newItemsCount
                        },
                    },
                    {
                        new: true,
                        arrayFilters: [
                            { 'roadmap.roadMapId': roadMapObjectId },
                            { 'nested.nestedRoadmapId': nestedRoadMapItemObjectId }
                        ]
                    }
                ).exec();
            } else {
                await this.progressModel.findOneAndUpdate(
                    {
                        ...userIdFlexibleQuery,
                        'roadmaps.roadMapId': roadMapObjectId
                    },
                    {
                        $inc: { 'roadmaps.$.completedSteps': newItemsCount },
                    },
                    { new: true }
                ).exec();
            }
        }

        const progress = await this.progressModel.findOne({
            $or: [
                { userId: userObjectId },
                { userId: userIdString }
            ]
        }).lean();

        const roadmapProgress = progress?.roadmaps?.find(
            (r: any) =>
                r.roadMapId?.toString() === roadMapObjectId?.toString()
        );

        if (!roadmapProgress) {
            return toExtrasResponseDto(updatedExtras as any);
        }

        const wasAlreadyCompleted = roadmapProgress.status === 'completed';

        if (roadmapProgress.completedSteps >= roadmapProgress.totalSteps) {
            await this.progressModel.updateOne(
                {
                    $or: [
                        { userId: userObjectId },
                        { userId: userIdString }
                    ],
                    'roadmaps.roadMapId': roadMapObjectId
                },
                {
                    $set: {
                        'roadmaps.$.status': 'completed'
                    }
                }
            );
        }

        if (wasAlreadyCompleted && newItemsCount > 0) {
            await this.extrasModel.updateOne(
                { _id: updatedExtras._id },
                {
                    $set: {
                        isResubmitted: true,
                        resubmittedAt: new Date(),
                    },
                    $inc: { submissionNumber: 1 },
                },
            );
            const refreshed = await this.extrasModel.findById(updatedExtras._id).lean().exec();
            if (refreshed) {
                await this.maybeSyncJumpstartSessionOneAfterRoadmapCompletion(
                    userObjectId,
                    roadMapObjectId as Types.ObjectId,
                );
                return toExtrasResponseDto(refreshed as any);
            }
        }

        await this.maybeSyncJumpstartSessionOneAfterRoadmapCompletion(
            userObjectId,
            roadMapObjectId as Types.ObjectId,
        );

        return toExtrasResponseDto(updatedExtras as any);
    }

    async deleteExtras(roadMapId: string, userId: string, nestedRoadMapItemId?: string): Promise<{ message: string }> {
        const query: any = {
            roadMapId: new Types.ObjectId(roadMapId),
            userId: new Types.ObjectId(userId),
        };

        if (nestedRoadMapItemId) {
            query.nestedRoadMapItemId = new Types.ObjectId(nestedRoadMapItemId);
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        const result = await this.extrasModel.findOneAndDelete(query).lean().exec();
        if (!result) {
            throw new NotFoundException(`Extras not found for user ${userId} and roadmap ${roadMapId}`);
        }
        return { message: 'Extras deleted successfully' };
    }

    async uploadExtrasDocuments(
        roadMapId: string,
        userId: string,
        files: Express.Multer.File[],
        nestedRoadMapItemId?: string,
        name?: string
    ): Promise<ExtrasDocumentDto> {
        const roadMapObjectId = toObjectId(roadMapId);
        const userObjectId = toObjectId(userId);
        const nestedRoadMapItemObjectId = toObjectId(nestedRoadMapItemId);

        if (!roadMapObjectId || !userObjectId) {
            throw new BadRequestException('Invalid RoadMap ID or User ID provided');
        }

        if (!files || files.length === 0) {
            throw new BadRequestException('No files provided');
        }

        // Validate file types and sizes
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg',
            'image/png',
            'image/jpg',
            'video/mp4',
            'video/mpeg',
            'video/quicktime',
        ];

        const maxSize = 10 * 1024 * 1024; // 10MB

        for (const file of files) {
            if (!allowedTypes.includes(file.mimetype)) {
                throw new BadRequestException(
                    `Invalid file type for ${file.originalname}. Only PDF, Word, Excel, images, and videos are allowed`
                );
            }

            if (file.size > maxSize) {
                throw new BadRequestException(`File ${file.originalname} size exceeds 10MB limit`);
            }
        }

        const uploadBatchId = new Types.ObjectId().toString();
        const timestamp = Date.now();

        // Upload all files to S3
        const uploadedFiles = await Promise.all(
            files.map(async (file) => {
                const key = `roadmaps/${roadMapId}/extras/${userId}/${uploadBatchId}/${timestamp}-${file.originalname}`;
                const fileUrl = await this.s3Service.uploadFile(key, file.buffer, file.mimetype);

                return {
                    fileName: file.originalname,
                    fileUrl: fileUrl,
                    fileType: file.mimetype,
                    fileSize: file.size,
                };
            })
        );

        const documentBatch: ExtrasDocumentDto = {
            uploadBatchId: uploadBatchId,
            uploadedAt: new Date(),
            name: name,
            files: uploadedFiles,
        };

        const query: any = {
            roadMapId: roadMapObjectId,
            userId: userObjectId,
        };

        if (nestedRoadMapItemObjectId) {
            query.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        await this.extrasModel.findOneAndUpdate(
            query,
            {
                $push: { uploadedDocuments: documentBatch },
                $setOnInsert: {
                    roadMapId: roadMapObjectId,
                    userId: userObjectId,
                    nestedRoadMapItemId: nestedRoadMapItemObjectId,
                    extras: [],
                }
            },
            { upsert: true, new: true }
        ).exec();

        return documentBatch;
    }

    async getExtrasDocuments(
        roadMapId: string,
        userId: string,
        nestedRoadMapItemId?: string
    ): Promise<ExtrasDocumentDto[]> {
        const roadMapObjectId = toObjectId(roadMapId);
        const userObjectId = toObjectId(userId);
        const nestedRoadMapItemObjectId = toObjectId(nestedRoadMapItemId);

        if (!roadMapObjectId || !userObjectId) {
            throw new BadRequestException('Invalid RoadMap ID or User ID provided');
        }

        const query: any = {
            roadMapId: roadMapObjectId,
            userId: userObjectId,
        };

        if (nestedRoadMapItemObjectId) {
            query.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        const extras = await this.extrasModel.findOne(query).select('uploadedDocuments').lean().exec();

        if (!extras) {
            return [];
        }

        return extras.uploadedDocuments || [];
    }

    async deleteExtrasDocumentBatch(
        roadMapId: string,
        userId: string,
        uploadBatchId: string,
        nestedRoadMapItemId?: string
    ): Promise<{ message: string }> {
        const roadMapObjectId = toObjectId(roadMapId);
        const userObjectId = toObjectId(userId);
        const nestedRoadMapItemObjectId = toObjectId(nestedRoadMapItemId);

        if (!roadMapObjectId || !userObjectId) {
            throw new BadRequestException('Invalid RoadMap ID or User ID provided');
        }

        const query: any = {
            roadMapId: roadMapObjectId,
            userId: userObjectId,
        };

        if (nestedRoadMapItemObjectId) {
            query.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        const result = await this.extrasModel.findOneAndUpdate(
            query,
            { $pull: { uploadedDocuments: { uploadBatchId: uploadBatchId } } },
            { new: true }
        ).exec();

        if (!result) {
            throw new NotFoundException('Extras not found');
        }

        return { message: 'Document batch deleted successfully' };
    }

    async deleteSingleFileFromBatch(
        roadMapId: string,
        userId: string,
        uploadBatchId: string,
        fileUrl: string,
        nestedRoadMapItemId?: string
    ): Promise<{ message: string }> {
        const roadMapObjectId = toObjectId(roadMapId);
        const userObjectId = toObjectId(userId);
        const nestedRoadMapItemObjectId = toObjectId(nestedRoadMapItemId);

        if (!roadMapObjectId || !userObjectId) {
            throw new BadRequestException('Invalid RoadMap ID or User ID provided');
        }

        const query: any = {
            roadMapId: roadMapObjectId,
            userId: userObjectId,
            'uploadedDocuments.uploadBatchId': uploadBatchId,
        };

        if (nestedRoadMapItemObjectId) {
            query.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        // First, remove the specific file from the batch
        const result = await this.extrasModel.findOneAndUpdate(
            query,
            {
                $pull: {
                    'uploadedDocuments.$[batch].files': { fileUrl: fileUrl }
                }
            },
            {
                arrayFilters: [{ 'batch.uploadBatchId': uploadBatchId }],
                new: true
            }
        ).exec();

        if (!result) {
            throw new NotFoundException('Document batch not found');
        }

        // If the batch is now empty, remove the entire batch
        const updatedBatch = result.uploadedDocuments.find(
            (doc) => doc.uploadBatchId === uploadBatchId
        );

        if (updatedBatch && updatedBatch.files.length === 0) {
            await this.extrasModel.findOneAndUpdate(
                {
                    roadMapId: roadMapObjectId,
                    userId: userObjectId,
                },
                { $pull: { uploadedDocuments: { uploadBatchId: uploadBatchId } } }
            ).exec();
        }

        return { message: 'File deleted successfully' };
    }

    async findNestedItemById(roadMapId: string, nestedItemId: string): Promise<any> {
        const roadmap = await this.roadMapModel.findById(roadMapId).lean().exec();

        if (!roadmap) {
            throw new NotFoundException(`RoadMap with ID "${roadMapId}" not found`);
        }

        const nestedItem = (roadmap.roadmaps || []).find(
            (item: any) => item._id?.toString() === nestedItemId
        );

        if (!nestedItem) {
            throw new NotFoundException(`Nested roadmap item with ID "${nestedItemId}" not found`);
        }

        return nestedItem;
    }

    private async resolvePhaseTargetForMentoringSession(sessionNumber: number): Promise<{
        roadMapObjectId: Types.ObjectId;
        nestedRoadMapItemObjectId: Types.ObjectId | null;
    }> {
        if (sessionNumber < 1 || sessionNumber > MENTORING_JOURNEY_SESSION_MAX) {
            throw new BadRequestException(`Invalid mentoring session ${sessionNumber}.`);
        }

        let cumulative = 0;
        let targetPhase: string | null = null;

        for (const phase of SESSION_FLOW) {
            cumulative += phase.totalSessions;
            if (sessionNumber <= cumulative) {
                targetPhase = phase.phaseName;
                break;
            }
        }

        if (!targetPhase) {
            throw new BadRequestException('No phase mapped for mentoring session.');
        }

        const normalizedPhase = normalizeRoadmapName(targetPhase);

        const phaseRoadmaps = await this.roadMapModel.find({ type: 'phase' }).lean().exec();

        const roadmap = phaseRoadmaps.find(
            (rm) => normalizeRoadmapName(rm.name) === normalizedPhase,
        );

        if (!roadmap) {
            throw new NotFoundException(
                `Target phase roadmap "${targetPhase}" not found. Candidates: ${phaseRoadmaps.map((r) => r.name).join(', ')}.`,
            );
        }

        const nestedRaw = roadmap.roadmaps?.[0]?._id;
        return {
            roadMapObjectId: roadmap._id as Types.ObjectId,
            nestedRoadMapItemObjectId: nestedRaw ? new Types.ObjectId(String(nestedRaw)) : null,
        };
    }

    private buildExtrasAnchoredQuery(params: {
        userId: Types.ObjectId;
        roadMapObjectId: Types.ObjectId;
        nestedRoadMapItemObjectId: Types.ObjectId | null;
    }): Record<string, unknown> {
        const { userId, roadMapObjectId, nestedRoadMapItemObjectId } = params;

        const query: Record<string, unknown> = {
            userId,
            roadMapId: roadMapObjectId,
        };

        if (nestedRoadMapItemObjectId) {
            query.nestedRoadMapItemId = nestedRoadMapItemObjectId;
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } },
            ];
        }

        return query;
    }

    private locatePastorMentoringSessionOneSync(
        extrasDocs: ExtrasDocument[],
        sessionNum: number,
    ):
        | {
              doc: ExtrasDocument;
              idx: number;
              appointmentIdRaw: unknown;
              dataRef: Record<string, unknown>;
          }
        | undefined {
        for (const doc of extrasDocs) {
            const list = doc.extras || [];
            for (let i = 0; i < list.length; i += 1) {
                const e = list[i] as { type?: string; data?: Record<string, unknown> };
                const sn = e?.data?.sessionNumber;
                if (e?.type !== 'APPOINTMENT' || typeof sn !== 'number' || sn !== sessionNum) {
                    continue;
                }
                const dataRef =
                    e.data && typeof e.data === 'object' ? e.data : ({} as Record<string, unknown>);
                return {
                    doc,
                    idx: i,
                    appointmentIdRaw: e.data?.appointmentId,
                    dataRef,
                };
            }
        }
        return undefined;
    }

    /**
     * Syncs mentoring **Session 1** to Jumpstart/onboarding (“single roadmap”) completion using
     * the mentor's first available future slot (same selection rules as Sessions 2+).
     */
    async upsertMentoringSessionOneFromJumpstart(pastorIdStr: string): Promise<void> {
        try {
            const pastorOid = new Types.ObjectId(pastorIdStr);

            const pastor = await this.userModel
                .findById(pastorOid)
                .select('assignedId role')
                .lean()
                .exec();

            if (!pastor) {
                return;
            }

            if (pastor.role !== ROLES.PASTOR) {
                return;
            }

            const mentorRef = pastor.assignedId?.[0];
            if (!mentorRef) {
                this.logger.warn(`Jumpstart Session 1 skipped — pastor ${pastorIdStr} has no mentor assigned.`);
                return;
            }

            const mentorOid =
                mentorRef instanceof Types.ObjectId ? mentorRef : new Types.ObjectId(String(mentorRef));

            let extrasDocs = await this.extrasModel.find({ userId: pastorOid }).exec();
            let located = this.locatePastorMentoringSessionOneSync(extrasDocs, 1);

            const resolveExistingAppointmentId = async (): Promise<string | null> => {
                if (!located) return null;
                const rawAid = located.appointmentIdRaw;
                let apptStr: string | null = null;
                if (typeof rawAid === 'string' && Types.ObjectId.isValid(rawAid)) apptStr = rawAid;
                else if (rawAid instanceof Types.ObjectId) apptStr = rawAid.toString();

                if (!apptStr || !Types.ObjectId.isValid(apptStr)) return null;

                const existingLean = await this.appointmentModel.findById(apptStr).lean().exec();
                return existingLean ? apptStr : null;
            };

            let existingAppointmentId = await resolveExistingAppointmentId();

            let booking: MentorSlotBookingResult | null = null;
            if (!existingAppointmentId) {
                booking = await this.findFirstBookableMentorSlot(mentorOid, pastorIdStr, {
                    notes: 'Mentoring Session 1 scheduled from Jumpstart completion.',
                    book: true,
                    minNoticeHours: this.getJumpstartMinNoticeHours(),
                });

                if (!booking) {
                    throw new BadRequestException(JUMPSTART_NO_SLOTS_MSG);
                }

                await this.removeBookedSlotFromMentorAvailability(
                    mentorOid,
                    booking.selectedDay,
                    booking.selectedSlot,
                );
                existingAppointmentId = booking.appointment.id;
            }

            if (!booking) {
                return;
            }

            const anchor = booking.meetingDate;
            const appointmentStatus = APPOINTMENT_STATUSES.SCHEDULED;

            if (located) {
                located.dataRef.appointmentId = existingAppointmentId;
                located.dataRef.originalDate = anchor;
                located.dataRef.scheduledDate = anchor;
                located.dataRef.status = appointmentStatus;
                located.doc.extras![located.idx] = {
                    ...(located.doc.extras![located.idx] as object),
                    type: 'APPOINTMENT',
                    data: located.dataRef,
                } as never;
                located.doc.markModified('extras');
                await located.doc.save();
                return;
            }

            const phase = await this.resolvePhaseTargetForMentoringSession(1);
            const extrasQuery = this.buildExtrasAnchoredQuery({
                userId: pastorOid,
                roadMapObjectId: phase.roadMapObjectId,
                nestedRoadMapItemObjectId: phase.nestedRoadMapItemObjectId,
            });

            extrasDocs = await this.extrasModel.find({ userId: pastorOid }).exec();
            located = this.locatePastorMentoringSessionOneSync(extrasDocs, 1);

            if (located) {
                located.dataRef.appointmentId = existingAppointmentId;
                located.dataRef.originalDate = anchor;
                located.dataRef.scheduledDate = anchor;
                located.dataRef.status = appointmentStatus;
                located.doc.extras![located.idx] = {
                    ...(located.doc.extras![located.idx] as object),
                    type: 'APPOINTMENT',
                    data: located.dataRef,
                } as never;
                located.doc.markModified('extras');
                await located.doc.save();
                return;
            }

            let extrasDoc = await this.extrasModel.findOne(extrasQuery).exec();
            if (!extrasDoc) {
                extrasDoc = await this.extrasModel.create({
                    userId: pastorOid,
                    roadMapId: phase.roadMapObjectId,
                    nestedRoadMapItemId: phase.nestedRoadMapItemObjectId,
                    extras: [],
                });
            }

            extrasDoc.extras!.push({
                type: 'APPOINTMENT',
                data: {
                    sessionNumber: 1,
                    title: 'Session 1',
                    appointmentId: booking.appointment.id,
                    originalDate: anchor,
                    scheduledDate: anchor,
                    isCompleted: false,
                    isConfirmed: false,
                    isRedo: false,
                    status: appointmentStatus,
                    mentorNote: SESSION_NOTES[0] || '',
                    pastorNote: '',
                },
            } as never);

            extrasDoc.markModified('extras');
            await extrasDoc.save();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Jumpstart Session 1 sync failed for pastor ${pastorIdStr}: ${msg}`);
        }
    }

    /**
     * Blocks Jumpstart (“single” roadmap) completion when the assigned mentor has no availability.
     * Must run before extras/progress writes so roadmap completion and Session 1 are not partially applied.
     */
    private async assertMentorAvailabilityBeforeJumpstartCompletion(
        pastorUserIdObjectId: Types.ObjectId,
        pastorUserIdString: string | undefined,
        roadMapObjectId: Types.ObjectId,
        additionalCompletedSteps: number,
    ): Promise<void> {
        const roadmapRow = await this.roadMapModel
            .findById(roadMapObjectId)
            .select('type totalSteps extras roadmaps')
            .lean()
            .exec();

        if (roadmapRow?.type?.trim()?.toLowerCase() !== 'single') {
            return;
        }

        const userIdFlexibleQuery = {
            $or: [
                { userId: pastorUserIdObjectId },
                ...(pastorUserIdString ? [{ userId: pastorUserIdString }] : []),
            ],
        };

        const progress = await this.progressModel.findOne(userIdFlexibleQuery).lean().exec();
        const entry = progress?.roadmaps?.find(
            (r: { roadMapId: Types.ObjectId }) =>
                r.roadMapId.toString() === roadMapObjectId.toString(),
        );

        if (!entry) {
            return;
        }

        let totalSteps = typeof entry.totalSteps === 'number' ? entry.totalSteps : 0;
        if (totalSteps <= 0) {
            totalSteps = resolveRoadmapProgressTotalSteps(roadmapRow);
        }
        if (totalSteps <= 0) {
            return;
        }

        const projectedCompleted = (entry.completedSteps ?? 0) + additionalCompletedSteps;
        if (projectedCompleted < totalSteps) {
            return;
        }

        const pastor = await this.userModel
            .findById(pastorUserIdObjectId)
            .select('assignedId role')
            .lean()
            .exec();

        if (!pastor || pastor.role !== ROLES.PASTOR) {
            return;
        }

        const mentorRef = pastor.assignedId?.[0];
        if (!mentorRef) {
            throw new BadRequestException(JUMPSTART_NO_MENTOR_MSG);
        }

        const mentorIdStr =
            mentorRef instanceof Types.ObjectId ? mentorRef.toString() : String(mentorRef);

        await this.appointmentService.assertMentorHasAvailabilitySet(
            mentorIdStr,
            JUMPSTART_MENTOR_NO_AVAILABILITY_MSG,
        );

        const pastorUserIdStr = pastorUserIdString ?? pastorUserIdObjectId.toString();
        await this.assertJumpstartFirstBookableSlot(mentorIdStr, pastorUserIdStr);
    }

    /** After extras write: if this is the onboarding (“single”) roadmap and it is finished, anchor Session 1. */
    private async maybeSyncJumpstartSessionOneAfterRoadmapCompletion(
        pastorUserIdObjectId: Types.ObjectId,
        roadMapObjectId: Types.ObjectId,
    ): Promise<void> {
        const roadmapRow = await this.roadMapModel
            .findById(roadMapObjectId)
            .select('type totalSteps extras roadmaps')
            .lean()
            .exec();

        const isSingleJumpstartRoadmap =
            roadmapRow?.type?.trim()?.toLowerCase() === 'single';

        if (!isSingleJumpstartRoadmap) {
            return;
        }

        const progress = await this.progressModel
            .findOne({
                $or: [
                    { userId: pastorUserIdObjectId },
                    { userId: pastorUserIdObjectId.toString() },
                ],
            })
            .lean()
            .exec();

        const entry = progress?.roadmaps?.find(
            (r: { roadMapId: Types.ObjectId }) =>
                r.roadMapId.toString() === roadMapObjectId.toString(),
        );

        if (!entry) {
            return;
        }

        let totalSteps = typeof entry.totalSteps === 'number' ? entry.totalSteps : 0;
        if (totalSteps <= 0) {
            totalSteps = resolveRoadmapProgressTotalSteps(roadmapRow);
        }

        if (totalSteps <= 0) {
            return;
        }

        if ((entry.completedSteps ?? 0) < totalSteps) {
            return;
        }

        await this.upsertMentoringSessionOneFromJumpstart(pastorUserIdObjectId.toString());
    }

    async getUserRoadmaps(userId: string) {
        const progress = await this.progressModel
            .findOne({ userId })
            .lean();

        if (!progress) {
            return [];
        }

        const roadmapIds = progress.roadmaps.map(r => r.roadMapId);

        const roadmaps = await this.roadMapModel
            .find({ _id: { $in: roadmapIds } })
            .lean();

        const sorted = this.sortRoadmapsByLibraryOrder(roadmaps);

        return sorted.map((rm: any) => {
            const progressData = progress.roadmaps.find(
                p => p.roadMapId.toString() === rm._id.toString(),
            );

            return {
                ...rm,
                progress: progressData || null,
            };
        });
    }

    async getMentorFromPastor(userId: string) {

        const pastor = await this.userModel.findById(userId).lean();
        if (!pastor) throw new NotFoundException('Pastor not found');

        const mentorId = pastor.assignedId?.[0];
        if (!mentorId) throw new BadRequestException('No mentor assigned');

        // GET ALL EXISTING SESSIONS
        const allExtras = await this.extrasModel.find({
            userId: new Types.ObjectId(userId)
        });

        const allSessions = allExtras.flatMap(doc =>
            doc.extras.filter((e: any) => e.type === "APPOINTMENT")
        );

        const sessionNumber = allSessions.length + 1;

        if (sessionNumber > MENTORING_JOURNEY_SESSION_MAX) {
            this.logger.verbose(
                `Mentoring session materialization capped at Session ${MENTORING_JOURNEY_SESSION_MAX}.`,
            );
            return;
        }

        // PREVENT DUPLICATE SESSION CREATION (CRITICAL FIX)
        const alreadyExists = await this.extrasModel.findOne({
            userId: new Types.ObjectId(userId),
            "extras.type": "APPOINTMENT",
            "extras.data.sessionNumber": sessionNumber
        });

        if (alreadyExists) {
            console.log(`⚠️ Session ${sessionNumber} already exists. Skipping.`);
            return;
        }

        // FIND PHASE
        let cumulative = 0;
        let targetPhase: string | null = null;

        for (const phase of SESSION_FLOW) {
            cumulative += phase.totalSessions;
            if (sessionNumber <= cumulative) {
                targetPhase = phase.phaseName;
                break;
            }
        }

        if (!targetPhase) {
            throw new BadRequestException("No phase found for session");
        }

        const normalizedPhase = normalizeRoadmapName(targetPhase);

        const phaseRoadmaps = await this.roadMapModel.find({
            type: "phase"
        }).lean();

        const roadmap = phaseRoadmaps.find(rm =>
            normalizeRoadmapName(rm.name) === normalizedPhase
        );

        if (!roadmap) {
            console.error("Phase lookup failed", {
                input: targetPhase,
                normalized: normalizedPhase,
                available: phaseRoadmaps.map(r => r.name)
            });

            throw new NotFoundException("Target roadmap not found");
        }

        const targetRoadMapId = roadmap._id.toString();
        const targetNestedId = roadmap.roadmaps?.[0]?._id?.toString();

        // AVAILABILITY
        const availability = await this.availabilityModel
            .findOne({ mentorId })
            .lean();

        if (!availability) {
            throw new BadRequestException('No availability found');
        }

        // EXTRAS DOC
        const query: any = {
            userId: new Types.ObjectId(userId),
            roadMapId: new Types.ObjectId(targetRoadMapId),
        };

        if (targetNestedId) {
            query.nestedRoadMapItemId = new Types.ObjectId(targetNestedId);
        } else {
            query.$or = [
                { nestedRoadMapItemId: null },
                { nestedRoadMapItemId: { $exists: false } }
            ];
        }

        let extrasDoc = await this.extrasModel.findOne(query);

        if (!extrasDoc) {
            extrasDoc = await this.extrasModel.create({
                userId: new Types.ObjectId(userId),
                roadMapId: new Types.ObjectId(targetRoadMapId),
                nestedRoadMapItemId: targetNestedId
                    ? new Types.ObjectId(targetNestedId)
                    : null,
                extras: []
            });
        }

        const booking = await this.findFirstBookableMentorSlot(mentorId, userId, {
            notes: 'Auto scheduled',
            book: true,
        });

        if (!booking) {
            throw new BadRequestException('No free slots available');
        }

        const { appointment, meetingDate, selectedSlot, selectedDay } = booking;

        await this.removeBookedSlotFromMentorAvailability(mentorId, selectedDay, selectedSlot);

        // DISABLE OLD REDO
        await this.extrasModel.updateOne(
            query,
            {
                $set: {
                    "extras.$[elem].data.isRedo": false
                }
            },
            {
                arrayFilters: [{ "elem.type": "APPOINTMENT" }]
            }
        );

        // CREATE SESSION
        const newSession = {
            type: "APPOINTMENT",
            data: {
                sessionNumber,
                title: `Session ${sessionNumber}`,
                appointmentId: appointment.id,

                originalDate: meetingDate,
                scheduledDate: meetingDate,

                isCompleted: false,
                isConfirmed: false,
                isRedo: true,
                status: "SCHEDULED",

                mentorNote: SESSION_NOTES[sessionNumber - 1] || "",
                pastorNote: ""
            }
        };

        const extraResult = await this.extrasModel.updateOne(
            {
                ...query,
                "extras.data.sessionNumber": { $ne: sessionNumber }
            },
            {
                $push: { extras: newSession }
            }
        );

        return {
            mentorId,
            meetingDate,
            appointment,
            extraResult
        };
    }

    async handleSessionCompletion(appointmentId: string) {
        const extrasDoc = await this.extrasModel.findOne({
            $or: [
                { "extras.data.appointmentId": appointmentId },
                { "extras.appointmentId": appointmentId }
            ]
        });

        if (!extrasDoc) return;

        const session = extrasDoc.extras.find(
            (e: any) =>
                e.data?.appointmentId === appointmentId ||
                e.appointmentId === appointmentId
        );

        if (!session.data) {
            session.data = {
                sessionNumber: session.sessionNumber,
                appointmentId: session.appointmentId,
                isCompleted: session.isCompleted,
                isRedo: true,
                status: "SCHEDULED",
                originalDate: new Date(),
                scheduledDate: new Date(),
                mentorNote: "",
                pastorNote: ""
            };
        }

        await this.extrasModel.updateOne(
            {
                _id: extrasDoc._id,
                "extras.data.appointmentId": appointmentId
            },
            {
                $set: {
                    "extras.$.data.status": "COMPLETED",
                    "extras.$.data.isCompleted": true,
                    "extras.$.data.completedAt": new Date(),
                    "extras.$.data.isRedo": false
                }
            }
        );

        // Mentor explicitly marked this session complete: clear meeting links now.
        await this.appointmentModel.updateOne(
            { _id: new Types.ObjectId(appointmentId) },
            {
                $set: { status: APPOINTMENT_STATUSES.COMPLETED },
                $unset: {
                    meetingLink: 1,
                    'zoomMeeting.joinUrl': 1,
                    'zoomMeeting.startUrl': 1,
                },
            },
        );

        const sn =
            typeof session?.data?.sessionNumber === 'number' ? session.data.sessionNumber : 0;
        if (sn >= 1 && sn < MENTORING_JOURNEY_SESSION_MAX) {
            await this.getMentorFromPastor(
                extrasDoc.userId.toString()
            );
        }
    }

    async redoSession(appointmentId: string) {

        const extrasDoc = await this.extrasModel.findOne({
            "extras.data.appointmentId": appointmentId
        });

        if (!extrasDoc) {
            throw new NotFoundException('Session not found');
        }

        const session = extrasDoc.extras.find(
            (e: any) => e.data?.appointmentId === appointmentId
        );

        if (!session) {
            throw new NotFoundException('Session not found');
        }

        // get mentor
        const pastor = await this.userModel.findById(extrasDoc.userId).lean();
        const mentorId = pastor?.assignedId?.[0];

        if (!mentorId) {
            throw new BadRequestException('No mentor assigned');
        }

        // get availability
        const availability = await this.availabilityModel
            .findOne({ mentorId })
            .lean();

        if (!availability) {
            throw new BadRequestException('No availability');
        }

        const booking = await this.findFirstBookableMentorSlot(mentorId, extrasDoc.userId.toString(), {
            notes: 'Redo session',
            book: true,
        });

        if (!booking) {
            throw new BadRequestException('No free slot found');
        }

        const { appointment, meetingDate, selectedSlot, selectedDay } = booking;

        await this.removeBookedSlotFromMentorAvailability(mentorId, selectedDay, selectedSlot);

        await this.extrasModel.updateOne(
            {
                _id: extrasDoc._id,
                "extras.data.appointmentId": appointmentId
            },
            {
                $set: {
                    "extras.$.data.appointmentId": appointment.id,
                    "extras.$.data.scheduledDate": meetingDate,
                    "extras.$.data.status": "SCHEDULED",
                    "extras.$.data.isCompleted": false,
                    "extras.$.data.completedAt": null
                }
            }
        );

        return {
            message: "Redo successful",
            sessionNumber: session.data.sessionNumber,
            appointment
        };
    }

    async getUserSessions(userId: string) {

        const extras = await this.extrasModel
            .find({ userId: new Types.ObjectId(userId) })
            .lean();

        const sessions = extras.flatMap(doc =>
            doc.extras
                .filter((e: any) => e.type === "APPOINTMENT")
                .map((e: any) => ({
                    sessionNumber: e.data.sessionNumber,
                    title: e.data.title,
                    status: e.data.status,
                    scheduledDate: e.data.scheduledDate,
                    mentorNote: e.data.mentorNote,
                    pastorNote: e.data.pastorNote,
                    appointmentId: e.data.appointmentId
                }))
        );

        const appointmentIds = Array.from(
            new Set(
                sessions
                    .map((s) => s.appointmentId)
                    .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id)),
            ),
        );

        const appointments = appointmentIds.length
            ? await this.appointmentModel
                  .find({ _id: { $in: appointmentIds.map((id) => new Types.ObjectId(id)) } })
                  .select('meetingLink zoomMeeting')
                  .lean()
                  .exec()
            : [];

        const appointmentById = new Map(
            appointments.map((a: any) => [String(a._id), a]),
        );

        return sessions
            .map((s) => {
                const appt = appointmentById.get(String(s.appointmentId));
                const meetingLink =
                    (typeof appt?.meetingLink === 'string' && appt.meetingLink.trim()) ||
                    (typeof appt?.zoomMeeting?.joinUrl === 'string' && appt.zoomMeeting.joinUrl.trim()) ||
                    undefined;

                return {
                    ...s,
                    ...(meetingLink ? { meetingLink } : {}),
                    ...(appt ? { appointment: appt } : {}),
                };
            })
            .sort((a, b) => a.sessionNumber - b.sessionNumber);
    }

    async getSubmissionActivity(
        userId: string,
        from: string,
        to: string,
    ): Promise<RoadmapSubmissionActivityDto[]> {
        const userObjectId = toObjectId(userId);
        if (!userObjectId) {
            throw new BadRequestException('Invalid userId provided.');
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
            throw new BadRequestException('Invalid from or to date. Use ISO date strings.');
        }

        fromDate.setUTCHours(0, 0, 0, 0);
        toDate.setUTCHours(23, 59, 59, 999);

        if (fromDate > toDate) {
            throw new BadRequestException('from must be on or before to.');
        }

        const extrasDocs = await this.extrasModel
            .find({
                userId: userObjectId,
                'extras.0': { $exists: true },
                $or: [
                    { submittedAt: { $gte: fromDate, $lte: toDate } },
                    { resubmittedAt: { $gte: fromDate, $lte: toDate } },
                    {
                        submittedAt: { $exists: false },
                        createdAt: { $gte: fromDate, $lte: toDate },
                    },
                ],
            })
            .sort({ submittedAt: -1, createdAt: -1 })
            .lean()
            .exec();

        if (extrasDocs.length === 0) {
            return [];
        }

        const roadMapIds = [...new Set(extrasDocs.map((d) => d.roadMapId.toString()))];
        const roadmaps = await this.roadMapModel
            .find({ _id: { $in: roadMapIds.map((id) => new Types.ObjectId(id)) } })
            .select('name roadmaps')
            .lean()
            .exec();

        const roadmapById = new Map(
            roadmaps.map((r) => [r._id.toString(), r]),
        );

        return extrasDocs.map((doc) => {
            const roadMapIdStr = doc.roadMapId.toString();
            const roadmap = roadmapById.get(roadMapIdStr);
            const parentRoadmapName = roadmap?.name ?? 'Roadmap';
            const nestedIdStr = doc.nestedRoadMapItemId?.toString();

            let taskName = parentRoadmapName;
            if (nestedIdStr && Array.isArray(roadmap?.roadmaps)) {
                const nested = (roadmap.roadmaps as { _id?: Types.ObjectId; name?: string }[]).find(
                    (item) => item._id?.toString() === nestedIdStr,
                );
                if (nested?.name) {
                    taskName = nested.name;
                }
            }

            const submittedAt = doc.submittedAt ?? doc.createdAt ?? new Date();
            const submissionNumber = doc.submissionNumber ?? (doc.isResubmitted ? 2 : 1);
            const isResubmission = Boolean(doc.isResubmitted && doc.resubmittedAt);

            return {
                submissionId: doc._id.toString(),
                userId: doc.userId.toString(),
                roadMapId: roadMapIdStr,
                nestedRoadMapItemId: nestedIdStr,
                parentRoadmapName,
                taskName,
                submittedAt,
                resubmittedAt: doc.resubmittedAt ?? null,
                isResubmission,
                submissionNumber,
                status: isResubmission ? 'resubmitted' as const : 'submitted' as const,
            };
        });
    }

    async getResubmittedExtrasForMentor(mentorId: string): Promise<ExtrasResponseDto[]> {
        const mentorObjectId = new Types.ObjectId(mentorId);

        const assignedPastors = await this.userModel.find(
            { assignedId: mentorObjectId },
            { _id: 1 },
        ).lean().exec();

        if (assignedPastors.length === 0) {
            return [];
        }

        const pastorIds = assignedPastors.map(p => p._id);

        const resubmittedExtras = await this.extrasModel.find({
            userId: { $in: pastorIds },
            isResubmitted: true,
        }).lean().exec();

        return resubmittedExtras.map(doc => toExtrasResponseDto(doc as any));
    }
}