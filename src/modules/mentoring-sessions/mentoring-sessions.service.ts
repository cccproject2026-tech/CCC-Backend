import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument } from '../appointments/schemas/appointment.schema';
import { Extras, ExtrasDocument } from '../roadmaps/schemas/extras.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
    MentoringRescheduleRequest,
    MentoringRescheduleRequestDocument,
} from './schemas/mentoring-reschedule-request.schema';
import { RoadMapsService } from '../roadmaps/roadmaps.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { HomeService } from '../home/home.service';
import { APPOINTMENT_STATUSES } from '../../common/constants/status.constants';
import { ROLES } from '../../common/constants/roles.constants';
import { USER_STATUSES } from '../../common/constants/status.constants';
import {
    formatMeetingDateForNotification,
    mentoringRescheduleRequestNotification,
    mentoringSessionRescheduledNotification,
} from '../../common/utils/notification-copy.util';
import type {
    AppointmentTranscriptSummary,
    DirectorPastorJourneyDto,
    MentoringRescheduleRequestSnippet,
    MentoringUserPreview,
    UnifiedMentoringSessionDto,
} from './dto/mentoring-sessions.dto';

const SESSION_TOTAL = 10;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Future sessions eligible for cascading +30d shift after a reschedule (“unlocked” = not finalized). */
const APPOINTMENT_STATUSES_ELIGIBLE_FOR_CASCADE_SHIFT: ReadonlyArray<string> = [
    APPOINTMENT_STATUSES.SCHEDULED,
    APPOINTMENT_STATUSES.IN_PROGRESS,
    APPOINTMENT_STATUSES.POSTPONED,
    APPOINTMENT_STATUSES.MISSED,
];

type LeanAppointment = Appointment & {
    _id: Types.ObjectId;
};

@Injectable()
export class MentoringSessionsService {
    constructor(
        @InjectModel(Extras.name) private readonly extrasModel: Model<ExtrasDocument>,
        @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(MentoringRescheduleRequest.name)
        private readonly rescheduleRequestModel: Model<MentoringRescheduleRequestDocument>,
        private readonly roadMapsService: RoadMapsService,
        private readonly appointmentsService: AppointmentsService,
        private readonly homeService: HomeService,
    ) {}

    private appointmentIdString(raw: unknown): string | null {
        if (raw == null) return null;
        if (typeof raw === 'string') return raw;
        if (raw instanceof Types.ObjectId) return raw.toString();
        if (typeof (raw as { toString?: () => string }).toString === 'function') {
            return (raw as { toString: () => string }).toString();
        }
        return null;
    }

    private toUserPreview(
        id: Types.ObjectId | string | undefined | null,
        u:
            | (Pick<UserDocument, 'firstName' | 'lastName' | 'email'> & {
                  profilePicture?: string | null;
              })
            | null
            | undefined,
    ): MentoringUserPreview | null {
        if (!id || !u) return null;
        return {
            id: id instanceof Types.ObjectId ? id.toString() : String(id),
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            profilePicture: (u as { profilePicture?: string | null }).profilePicture ?? undefined,
        };
    }

    private pendingRescheduleToSnippet(
        doc: { _id: Types.ObjectId; status?: string; reason?: string; createdAt?: Date } | null,
    ): MentoringRescheduleRequestSnippet | null {
        if (!doc || doc.status !== 'pending') return null;
        return {
            id: doc._id.toString(),
            status: doc.status,
            reason: doc.reason,
            createdAt: doc.createdAt,
        };
    }

    /**
     * Single `status` for UI: prefers live appointment workflow; falls back to journey extras uppercase labels.
     */
    private unifySessionStatus(
        appt: LeanAppointment | null,
        extrasDataStatus: unknown,
        hasScheduledSlot: boolean,
    ): string {
        if (appt?.status) return appt.status;
        const j = typeof extrasDataStatus === 'string' ? extrasDataStatus.toUpperCase().trim() : '';
        const mapUpper: Record<string, string> = {
            SCHEDULED: APPOINTMENT_STATUSES.SCHEDULED,
            'IN-PROGRESS': APPOINTMENT_STATUSES.IN_PROGRESS,
            IN_PROGRESS: APPOINTMENT_STATUSES.IN_PROGRESS,
            COMPLETED: APPOINTMENT_STATUSES.COMPLETED,
            MISSED: APPOINTMENT_STATUSES.MISSED,
            POSTPONED: APPOINTMENT_STATUSES.POSTPONED,
            CANCELLED: APPOINTMENT_STATUSES.CANCELED,
            CANCELED: APPOINTMENT_STATUSES.CANCELED,
        };
        if (j && mapUpper[j]) return mapUpper[j];
        if (!hasScheduledSlot) return 'unscheduled';
        return 'unknown';
    }

    private normalizeScheduledDate(raw: unknown, apptMeeting?: Date | null): Date | string | null {
        if (apptMeeting) return apptMeeting;
        if (raw instanceof Date) return raw;
        if (typeof raw === 'string' && raw.length > 0) return raw;
        return null;
    }

    private async patchAppointmentExtrasSlot(
        pastorId: string,
        appointmentIdStr: string,
        patch: { scheduledDate?: Date | null; status?: string },
    ): Promise<void> {
        const docs = await this.extrasModel.find({ userId: new Types.ObjectId(pastorId) }).exec();
        for (const doc of docs) {
            let changed = false;
            const list = doc.extras || [];
            for (let i = 0; i < list.length; i += 1) {
                const e = list[i] as { type?: string; data?: Record<string, unknown> };
                if (e.type !== 'APPOINTMENT') continue;
                const aid = this.appointmentIdString(e.data?.appointmentId);
                if (aid !== appointmentIdStr) continue;
                if (!e.data) e.data = {};
                if (patch.scheduledDate !== undefined) {
                    (e.data as { scheduledDate?: Date | null }).scheduledDate =
                        patch.scheduledDate ?? undefined;
                }
                if (patch.status !== undefined) {
                    (e.data as { status?: string }).status = patch.status;
                }
                list[i] = e as (typeof list)[number];
                changed = true;
            }
            if (changed) {
                doc.extras = list;
                doc.markModified('extras');
                await doc.save();
            }
        }
    }

    /** Collect APPOINTMENT extras rows indexed by session number (1–10). */
    private collectExtrasBySessionNumber(pastorId: string): Promise<Map<number, Record<string, unknown>>> {
        const pid = new Types.ObjectId(pastorId);
        return this.extrasModel
            .find({ userId: pid })
            .lean()
            .then((extrasDocs) => {
                const raw = extrasDocs.flatMap((doc) =>
                    (doc.extras || [])
                        .filter((e: { type?: string }) => e.type === 'APPOINTMENT')
                        .map((e: { data?: Record<string, unknown> }) => ({ ...(e.data || {}) })),
                );
                const byNumber = new Map<number, Record<string, unknown>>();
                for (const row of raw) {
                    const sn = row.sessionNumber as number | undefined;
                    if (typeof sn === 'number' && sn >= 1 && sn <= SESSION_TOTAL) {
                        byNumber.set(sn, row);
                    }
                }
                return byNumber;
            });
    }

    /** Build canonical session rows including transcript + reschedule snippet. */
    async buildUnifiedSessionsForPastor(pastorId: string): Promise<UnifiedMentoringSessionDto[]> {
        const pastor = await this.userModel
            .findById(pastorId)
            .select('firstName lastName email profilePicture assignedId role')
            .lean();
        const mentorOid = pastor?.assignedId?.[0];
        const mentorIdStr = mentorOid ? mentorOid.toString() : null;
        const mentor = mentorIdStr
            ? await this.userModel
                  .findById(mentorIdStr)
                  .select('firstName lastName email profilePicture')
                  .lean()
            : null;

        const pastorPreview = this.toUserPreview(new Types.ObjectId(pastorId), pastor ?? null);
        const mentorPreview = this.toUserPreview(mentorOid ?? undefined, mentor);

        const byNumber = await this.collectExtrasBySessionNumber(pastorId);

        const appointmentIds: Types.ObjectId[] = [];
        for (let n = 1; n <= SESSION_TOTAL; n += 1) {
            const data = byNumber.get(n);
            const aidStr = data ? this.appointmentIdString(data.appointmentId) : null;
            if (aidStr && Types.ObjectId.isValid(aidStr)) {
                appointmentIds.push(new Types.ObjectId(aidStr));
            }
        }

        const uniqueApptIdStrings = [...new Set(appointmentIds.map((id) => id.toString()))];
        const apptsList =
            uniqueApptIdStrings.length > 0
                ? await this.appointmentModel
                      .find({ _id: { $in: uniqueApptIdStrings.map((s) => new Types.ObjectId(s)) } })
                      .lean()
                : [];
        const apptById = new Map(apptsList.map((a) => [a._id.toString(), a]));

        const pendingReschedules =
            uniqueApptIdStrings.length > 0
                ? await this.rescheduleRequestModel
                      .find({
                          appointmentId: {
                              $in: uniqueApptIdStrings.map((s) => new Types.ObjectId(s)),
                          },
                          status: 'pending',
                      })
                      .lean()
                : [];

        const pendingByApptId = new Map<string, typeof pendingReschedules[number]>();
        for (const p of pendingReschedules) {
            pendingByApptId.set(p.appointmentId.toString(), p);
        }

        const sessions: UnifiedMentoringSessionDto[] = [];

        for (let n = 1; n <= SESSION_TOTAL; n += 1) {
            const data = byNumber.get(n);
            const apptIdStr = data ? this.appointmentIdString(data.appointmentId) : null;
            const appt =
                apptIdStr && Types.ObjectId.isValid(apptIdStr)
                    ? (apptById.get(apptIdStr) as LeanAppointment | undefined) ?? null
                    : null;

            const hasAppointmentRef = Boolean(apptIdStr && Types.ObjectId.isValid(apptIdStr));
            const id = hasAppointmentRef && apptIdStr ? apptIdStr : `unscheduled-${n}`;

            const title = ((data?.title as string) || `Session ${n}`).toString();

            const status = this.unifySessionStatus(appt, data?.status, hasAppointmentRef);

            const scheduledDate = this.normalizeScheduledDate(
                data?.scheduledDate,
                appt?.meetingDate ?? null,
            );

            const meetingLink =
                appt?.zoomMeeting?.joinUrl ?? appt?.meetingLink ?? null;
            const transcriptSummary =
                (appt?.transcriptSummary as AppointmentTranscriptSummary | null | undefined) ?? null;
            const aiTranscript =
                typeof appt?.transcript === 'string' ? appt.transcript : null;

            const pendingDoc = apptIdStr ? pendingByApptId.get(apptIdStr) ?? null : null;

            sessions.push({
                id,
                sessionNumber: n,
                title,
                status,
                scheduledDate,
                pastorId,
                mentorId: mentorIdStr,
                pastor: pastorPreview,
                mentor: mentorPreview,
                appointmentId: hasAppointmentRef ? apptIdStr : null,
                platform: appt?.platform ?? null,
                meetingLink,
                transcriptSummary,
                aiTranscript,
                mentorNote: (data?.mentorNote as string) ?? null,
                pastorNote: (data?.pastorNote as string) ?? null,
                rescheduleRequest: this.pendingRescheduleToSnippet(pendingDoc),
            });
        }

        return sessions;
    }

    async listPastorSessions(pastorId: string) {
        await this.ensureUserRole(pastorId, ROLES.PASTOR);
        const sessions = await this.buildUnifiedSessionsForPastor(pastorId);
        return { pastorId, totalSessions: SESSION_TOTAL, sessions };
    }

    async listMentorGrouped(mentorId: string) {
        await this.ensureUserRole(mentorId, [ROLES.MENTOR, ROLES.FIELD_MENTOR]);
        const mid = new Types.ObjectId(mentorId);
        const pastors = await this.userModel
            .find({
                role: ROLES.PASTOR,
                status: USER_STATUSES.ACCEPTED,
                assignedId: mid,
            })
            .select('_id firstName lastName email')
            .lean();

        type PastorGrouped = {
            pastor: MentoringUserPreview;
            sessions: UnifiedMentoringSessionDto[];
        };

        const pastorsOut: PastorGrouped[] = [];

        for (const p of pastors) {
            const id = (p._id as Types.ObjectId).toString();
            const sessions = await this.buildUnifiedSessionsForPastor(id);
            const preview: MentoringUserPreview = {
                id,
                firstName: p.firstName,
                lastName: p.lastName,
                email: p.email,
            };
            pastorsOut.push({
                pastor: preview,
                sessions,
            });
        }

        return { mentorId, pastors: pastorsOut };
    }

    async listDirectorJourneys() {
        const pastors = await this.userModel
            .find({
                role: ROLES.PASTOR,
                status: USER_STATUSES.ACCEPTED,
                assignedId: { $exists: true, $not: { $size: 0 } },
            })
            .select('_id assignedId')
            .lean();

        const journeys: DirectorPastorJourneyDto[] = [];

        for (const p of pastors) {
            const pastorIdStr = (p._id as Types.ObjectId).toString();
            const sessions = await this.buildUnifiedSessionsForPastor(pastorIdStr);

            const head = sessions[0];
            const mentorIdStr = head?.mentorId ?? null;

            const completedSessions = sessions.filter(
                (s) => s.status === APPOINTMENT_STATUSES.COMPLETED,
            ).length;

            const actionable = sessions.filter(
                (s) =>
                    s.status !== APPOINTMENT_STATUSES.COMPLETED &&
                    s.status !== APPOINTMENT_STATUSES.CANCELED,
            );
            const nextSession = actionable.length > 0 ? actionable[0] : null;

            const pendingRescheduleRequests = await this.rescheduleRequestModel.countDocuments({
                pastorId: new Types.ObjectId(pastorIdStr),
                status: 'pending',
            });

            const journeyStatus =
                completedSessions >= SESSION_TOTAL
                    ? 'completed'
                    : nextSession?.status === 'unscheduled'
                      ? 'not_started'
                      : 'in_progress';

            journeys.push({
                id: pastorIdStr,
                pastorId: pastorIdStr,
                mentorId: mentorIdStr,
                pastor: head?.pastor ?? null,
                mentor: head?.mentor ?? null,
                completedSessions,
                totalSessions: SESSION_TOTAL,
                pendingRescheduleRequests,
                nextSessionNumber: nextSession?.sessionNumber ?? null,
                nextMeetingDate: nextSession?.scheduledDate ?? null,
                journeyStatus,
                nextSession,
            });
        }

        return { journeys };
    }

    private async unifiedSessionDetailFromAppointment(apptLean: LeanAppointment): Promise<UnifiedMentoringSessionDto> {
        const pastorIdRaw = apptLean.userId;
        const pastorId =
            pastorIdRaw instanceof Types.ObjectId
                ? pastorIdRaw.toString()
                : typeof pastorIdRaw === 'object' &&
                    pastorIdRaw !== null &&
                    '_id' in pastorIdRaw
                  ? String((pastorIdRaw as { _id: Types.ObjectId })._id)
                  : String(pastorIdRaw ?? '');

        const sessionId = apptLean._id.toString();
        const extrasDocs = await this.extrasModel
            .find({ userId: new Types.ObjectId(String(pastorId)) })
            .lean();

        let sessionMeta: Record<string, unknown> | null = null;
        let sessionNumber = 1;

        outer: for (const doc of extrasDocs) {
            for (const e of doc.extras || []) {
                if ((e as { type?: string }).type !== 'APPOINTMENT') continue;
                const data = (e as { data?: Record<string, unknown> }).data;
                const aid = this.appointmentIdString(data?.appointmentId);
                if (aid === sessionId) {
                    sessionMeta = data ?? null;
                    sessionNumber =
                        typeof data?.sessionNumber === 'number'
                            ? data.sessionNumber
                            : sessionNumber;
                    break outer;
                }
            }
        }

        const pendingRequest = await this.rescheduleRequestModel
            .findOne({ appointmentId: apptLean._id, status: 'pending' })
            .lean();

        const pastor = await this.userModel
            .findById(pastorId)
            .select('firstName lastName email profilePicture assignedId role')
            .lean();
        const mentorOid = pastor?.assignedId?.[0];
        const mentorIdStr = mentorOid ? mentorOid.toString() : null;
        const mentor = mentorIdStr
            ? await this.userModel
                  .findById(mentorIdStr)
                  .select('firstName lastName email profilePicture')
                  .lean()
            : null;

        const hasBooked = true;
        const title = ((sessionMeta?.title as string) || `Session ${sessionNumber}`).toString();

        const status = this.unifySessionStatus(apptLean, sessionMeta?.status, hasBooked);
        const meetingLink =
            apptLean.zoomMeeting?.joinUrl ?? apptLean.meetingLink ?? null;
        const transcriptSummary =
            (apptLean.transcriptSummary as AppointmentTranscriptSummary | null | undefined) ?? null;

        return {
            id: sessionId,
            sessionNumber,
            title,
            status,
            scheduledDate: apptLean.meetingDate,
            pastorId,
            mentorId: mentorIdStr ?? (apptLean.mentorId as Types.ObjectId)?.toString() ?? null,
            pastor: this.toUserPreview(new Types.ObjectId(pastorId), pastor ?? null),
            mentor: this.toUserPreview(apptLean.mentorId, mentor ?? null),
            appointmentId: sessionId,
            platform: apptLean.platform ?? null,
            meetingLink,
            transcriptSummary,
            aiTranscript: typeof apptLean.transcript === 'string' ? apptLean.transcript : null,
            mentorNote: (sessionMeta?.mentorNote as string) ?? null,
            pastorNote: (sessionMeta?.pastorNote as string) ?? null,
            rescheduleRequest: pendingRequest
                ? this.pendingRescheduleToSnippet({
                      _id: pendingRequest._id as Types.ObjectId,
                      status: pendingRequest.status,
                      reason: pendingRequest.reason,
                      createdAt: (pendingRequest as { createdAt?: Date }).createdAt,
                  })
                : null,
        };
    }

    async getSessionDetail(sessionId: string) {
        if (!Types.ObjectId.isValid(sessionId)) {
            throw new BadRequestException('Invalid session id (expected appointment Mongo id).');
        }
        const appt = await this.appointmentModel.findById(sessionId).lean();

        if (!appt) {
            throw new NotFoundException('Session (appointment) not found.');
        }

        return await this.unifiedSessionDetailFromAppointment(appt as LeanAppointment);
    }

    async createRescheduleRequest(sessionId: string, pastorId: string, reason?: string) {
        if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(pastorId)) {
            throw new BadRequestException('Invalid ids.');
        }
        await this.ensureUserRole(pastorId, ROLES.PASTOR);

        const appointment = await this.appointmentModel.findById(sessionId).lean();
        if (!appointment) throw new NotFoundException('Appointment not found.');
        if (String(appointment.userId) !== pastorId) {
            throw new ForbiddenException('This appointment does not belong to the pastor.');
        }
        const allowedStatuses: readonly string[] = [
            APPOINTMENT_STATUSES.SCHEDULED,
            APPOINTMENT_STATUSES.IN_PROGRESS,
            APPOINTMENT_STATUSES.POSTPONED,
            APPOINTMENT_STATUSES.MISSED,
        ];
        if (!allowedStatuses.includes(String(appointment.status))) {
            throw new BadRequestException(
                `Reschedule requests are only allowed for sessions that can still be rescheduled (status is "${appointment.status}").`,
            );
        }

        let sessionNumber = 0;
        const extrasDocs = await this.extrasModel.find({ userId: new Types.ObjectId(pastorId) }).lean();
        outer: for (const doc of extrasDocs) {
            for (const e of doc.extras || []) {
                if ((e as { type?: string }).type !== 'APPOINTMENT') continue;
                const data = (e as { data?: Record<string, unknown> }).data;
                if (this.appointmentIdString(data?.appointmentId) === sessionId) {
                    sessionNumber = typeof data?.sessionNumber === 'number' ? data.sessionNumber : 0;
                    break outer;
                }
            }
        }
        if (sessionNumber < 1 || sessionNumber > SESSION_TOTAL) {
            throw new BadRequestException('Session metadata not found for this appointment.');
        }

        const dup = await this.rescheduleRequestModel.findOne({
            appointmentId: new Types.ObjectId(sessionId),
            status: 'pending',
        });
        if (dup) {
            throw new BadRequestException('A pending reschedule request already exists for this session.');
        }

        await this.rescheduleRequestModel.create({
            appointmentId: new Types.ObjectId(sessionId),
            pastorId: new Types.ObjectId(pastorId),
            mentorId: appointment.mentorId as Types.ObjectId,
            sessionNumber,
            reason,
            status: 'pending',
        });

        const priorWhen =
            appointment.meetingDate != null
                ? formatMeetingDateForNotification(new Date(appointment.meetingDate))
                : undefined;
        const reqCopy = mentoringRescheduleRequestNotification({
            sessionNumber,
            priorWhenLabel: priorWhen,
            reason,
        });
        await this.homeService.addNotification({
            userId: String(appointment.mentorId),
            name: reqCopy.name,
            details: reqCopy.details,
            module: 'MENTORING',
        });

        const session = await this.getSessionDetail(sessionId);
        return { ok: true, session };
    }

    async listRescheduleRequestsForMentor(mentorId: string) {
        await this.ensureUserRole(mentorId, [ROLES.MENTOR, ROLES.FIELD_MENTOR]);
        const list = await this.rescheduleRequestModel
            .find({ mentorId: new Types.ObjectId(mentorId), status: 'pending' })
            .sort({ createdAt: -1 })
            .lean();

        type RequestRow = MentoringRescheduleRequestSnippet & { session: UnifiedMentoringSessionDto };
        const requests: RequestRow[] = [];

        for (const r of list) {
            const session = await this.getSessionDetail(r.appointmentId.toString());
            requests.push({
                id: r._id.toString(),
                status: r.status,
                reason: r.reason,
                createdAt: (r as { createdAt?: Date }).createdAt,
                session,
            });
        }

        return { mentorId, requests };
    }

    async mentorRescheduleSession(sessionId: string, mentorId: string, newMeetingDate: string) {
        if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(mentorId)) {
            throw new BadRequestException('Invalid ids.');
        }
        await this.ensureUserRole(mentorId, [ROLES.MENTOR, ROLES.FIELD_MENTOR]);

        const appointment = await this.appointmentModel.findById(sessionId).lean();
        if (!appointment) throw new NotFoundException('Appointment not found.');

        const pastorIdStr = String(appointment.userId);
        const pastor = await this.userModel
            .findById(pastorIdStr)
            .select('assignedId')
            .lean();
        const currentAssignedMentorId = pastor?.assignedId?.[0]?.toString();
        const appointmentMentorId = String(appointment.mentorId);
        const isAppointmentMentor = appointmentMentorId === mentorId;
        const isCurrentlyAssignedMentor =
            currentAssignedMentorId != null && currentAssignedMentorId === mentorId;

        if (!isAppointmentMentor && !isCurrentlyAssignedMentor) {
            throw new ForbiddenException('Only the assigned mentor may reschedule.');
        }

        // Pastor may have been reassigned after Jumpstart/auto-book; sync ownership for reschedule.
        if (!isAppointmentMentor && isCurrentlyAssignedMentor) {
            await this.appointmentModel.updateOne(
                { _id: appointment._id },
                { $set: { mentorId: new Types.ObjectId(mentorId) } },
            );
        }

        let sessionNumber = 0;
        const extrasDocs = await this.extrasModel
            .find({ userId: new Types.ObjectId(pastorIdStr) })
            .lean();
        outer: for (const doc of extrasDocs) {
            for (const e of doc.extras || []) {
                if ((e as { type?: string }).type !== 'APPOINTMENT') continue;
                const data = (e as { data?: Record<string, unknown> }).data;
                if (this.appointmentIdString(data?.appointmentId) === sessionId) {
                    sessionNumber = typeof data?.sessionNumber === 'number' ? data.sessionNumber : 0;
                    break outer;
                }
            }
        }

        await this.appointmentsService.reschedule(sessionId, { newDate: newMeetingDate });
        const updated = await this.appointmentModel.findById(sessionId).lean();

        await this.patchAppointmentExtrasSlot(pastorIdStr, sessionId, {
            scheduledDate: updated!.meetingDate,
            status: 'SCHEDULED',
        });

        await this.shiftFutureUnlockedSessionsBy30Days({
            pastorId: new Types.ObjectId(pastorIdStr),
            mentorId: new Types.ObjectId(mentorId),
            anchorSessionNumber: sessionNumber,
            excludeAppointmentId: sessionId,
        });

        await this.rescheduleRequestModel.updateMany(
            { appointmentId: new Types.ObjectId(sessionId), status: 'pending' },
            { $set: { status: 'applied' } },
        );

        const whenLabel = updated!.meetingDate
            ? formatMeetingDateForNotification(new Date(updated!.meetingDate))
            : 'a new date and time shown in CCC';
        const schCopy = mentoringSessionRescheduledNotification({
            sessionNumber,
            whenLabel,
        });
        await this.homeService.addNotification({
            userId: pastorIdStr,
            name: schCopy.name,
            details: schCopy.details,
            module: 'MENTORING',
        });

        const session = await this.getSessionDetail(sessionId);
        return { session, sessionNumber, shiftedFutureSessionsByDays: 30 };
    }

    async mentorComplete(sessionId: string, mentorId: string) {
        if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(mentorId)) {
            throw new BadRequestException('Invalid ids.');
        }
        await this.ensureUserRole(mentorId, [ROLES.MENTOR, ROLES.FIELD_MENTOR]);

        const appt = await this.appointmentModel.findById(sessionId).lean();
        if (!appt) throw new NotFoundException('Appointment not found.');
        if (String(appt.mentorId) !== mentorId) {
            throw new ForbiddenException('Only the assigned mentor may complete.');
        }

        await this.appointmentModel.updateOne(
            { _id: new Types.ObjectId(sessionId) },
            { $set: { status: APPOINTMENT_STATUSES.COMPLETED } },
        );

        await this.roadMapsService.handleSessionCompletion(sessionId);

        const session = await this.getSessionDetail(sessionId);
        return { session };
    }

    async mentorCancel(sessionId: string, mentorId: string, reason?: string) {
        if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(mentorId)) {
            throw new BadRequestException('Invalid ids.');
        }
        await this.ensureUserRole(mentorId, [ROLES.MENTOR, ROLES.FIELD_MENTOR]);

        const appt = await this.appointmentModel.findById(sessionId).lean();
        if (!appt) throw new NotFoundException('Appointment not found.');
        if (String(appt.mentorId) !== mentorId) {
            throw new ForbiddenException('Only the assigned mentor may cancel.');
        }

        const pastorIdStr = String(appt.userId);
        await this.appointmentsService.cancel(sessionId, { reason });
        await this.patchAppointmentExtrasSlot(pastorIdStr, sessionId, {
            scheduledDate: null,
            status: 'CANCELLED',
        });

        await this.rescheduleRequestModel.updateMany(
            { appointmentId: new Types.ObjectId(sessionId), status: 'pending' },
            { $set: { status: 'dismissed' } },
        );

        const session = await this.getSessionDetail(sessionId);
        return { session };
    }

    private async shiftFutureUnlockedSessionsBy30Days(params: {
        pastorId: Types.ObjectId;
        mentorId: Types.ObjectId;
        anchorSessionNumber: number;
        excludeAppointmentId: string;
    }) {
        const { pastorId, mentorId, anchorSessionNumber, excludeAppointmentId } = params;
        if (anchorSessionNumber < 1) return;

        const extrasDocs = await this.extrasModel.find({ userId: pastorId }).lean();
        const ids: Types.ObjectId[] = [];

        for (const doc of extrasDocs) {
            for (const e of doc.extras || []) {
                if ((e as { type?: string }).type !== 'APPOINTMENT') continue;
                const data = (e as { data?: Record<string, unknown> }).data;
                const sn = data?.sessionNumber as number | undefined;
                const aid = this.appointmentIdString(data?.appointmentId);
                if (!aid || aid === excludeAppointmentId) continue;
                if (typeof sn !== 'number' || sn <= anchorSessionNumber) continue;
                if (Types.ObjectId.isValid(aid)) ids.push(new Types.ObjectId(aid));
            }
        }

        const uniqueStrings = [...new Set(ids.map((x) => x.toString()))];
        const appts = await this.appointmentModel
            .find({
                _id: { $in: uniqueStrings.map((s) => new Types.ObjectId(s)) },
                mentorId,
                status: { $in: [...APPOINTMENT_STATUSES_ELIGIBLE_FOR_CASCADE_SHIFT] },
            })
            .lean();

        const pastorStr = pastorId.toString();
        for (const a of appts) {
            const newStart = new Date(a.meetingDate.getTime() + THIRTY_DAYS_MS);
            const newEnd = new Date(a.endTime.getTime() + THIRTY_DAYS_MS);
            await this.appointmentModel.updateOne(
                { _id: a._id },
                { $set: { meetingDate: newStart, endTime: newEnd } },
            );
            await this.patchAppointmentExtrasSlot(pastorStr, a._id.toString(), {
                scheduledDate: newStart,
                status: 'SCHEDULED',
            });
        }
    }

    private async ensureUserRole(userId: string, role: string | string[]) {
        const u = await this.userModel.findById(userId).select('role').lean();
        if (!u) throw new NotFoundException('User not found.');
        const allowed = Array.isArray(role) ? role : [role];
        if (!allowed.includes(u.role)) {
            throw new ForbiddenException('Insufficient role for this mentoring resource.');
        }
    }
}
