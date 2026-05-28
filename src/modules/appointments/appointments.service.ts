import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { CreateAppointmentDto, AppointmentResponseDto, TranscriptSummaryResponseDto, UpdateAppointmentDto, RecordSessionJoinDto } from './dto/appointment.dto';
import { toAppointmentResponseDto } from './utils/appointment.mapper';
import {
    APPOINTMENT_STATUSES,
    APPOINTMENT_PLATFORMS,
    ASSESSMENT_ASSIGNMENT_STATUSES,
    USER_STATUSES,
    SESSION_MODES,
    RECORDING_STATUSES,
} from '../../common/constants/status.constants';
import { Availability, AvailabilityDocument, DayAvailability } from './schemas/availability.schema';
import {
    AvailabilityDto,
    CreateRecurringAvailabilityDto,
    DeleteAvailabilitySlotDto,
    MentorAvailabilityDayDto,
    OpenMentorDayDto,
    UpdateMentorAvailabilitySettingsDto,
    UpsertSingleDayAvailabilityDto,
} from './dto/availability.dto';
import {
    buildSlotDate,
    consolidateTemplateSlotsByUtcWeekday,
    convertSlotToMinutes,
    dateKeyUtcForInput,
    generateMonthlyAvailability,
    getWeekRange,
    HourSlot,
    iterateUtcDaysFromToday,
    splitIntoDurationSlots,
    validateSameDayRawSlotsNonOverlapping,
} from './utils/availability.utils';
import { HomeService } from '../home/home.service';
import { ROLES, isHostRole } from 'src/common/constants/roles.constants';
import { ZoomService } from '../zoom/zoom.service';
import { MailerService } from '../../common/utils/mail.util';
import { AssessmentAssigned, AssessmentAssignedDocument } from '../assessment/schemas/assessment_assigned';
import {
    GoogleCalendarService,
    subtractIntervalFromBusyIntervals,
    intervalOverlapsBusy,
} from '../google-calendar/google-calendar.service';
import { formatMeetingDateForNotification } from '../../common/utils/notification-copy.util';
import { TranscriptSummaryService } from './transcript-summary.service';
import { S3Service } from '../s3/s3.service';
import { ConversationProcessingService } from '../conversation-processing/conversation-processing.service';
import {
    isAllowedAudioUpload,
    normalizeMimeType,
    resolveAudioExtension,
} from '../voice-notes/voice-note-audio.constants';
@Injectable()
export class AppointmentsService {
    private readonly logger = new Logger(AppointmentsService.name);
    private static readonly IST_OFFSET_MINUTES = 330;

    constructor(
        @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
        @InjectModel(Availability.name) private availabilityModel: Model<AvailabilityDocument>,
        @InjectModel(AssessmentAssigned.name) private assessmentAssignedModel: Model<AssessmentAssignedDocument>,
        private readonly configService: ConfigService,
        private readonly notificationService: HomeService,
        private readonly zoomService: ZoomService,
        private readonly mailerService: MailerService,
        private readonly transcriptSummaryService: TranscriptSummaryService,
        private readonly conversationProcessingService: ConversationProcessingService,
        private readonly s3Service: S3Service,
        private readonly googleCalendarService: GoogleCalendarService,
    ) { }

    private readonly userSelect = 'firstName lastName email phoneNumber profilePicture role roleId status';
    private readonly mentorSelect = 'firstName lastName email phoneNumber profilePicture role roleId status';

    /** Appointment rows that still block mentor availability overlap & per-day caps. */
    private slotOccupyingStatuses(): readonly string[] {
        return [APPOINTMENT_STATUSES.SCHEDULED, APPOINTMENT_STATUSES.IN_PROGRESS];
    }

    private normalizeSessionMode(sessionMode?: string): string {
        if (sessionMode === SESSION_MODES.IN_PERSON) return SESSION_MODES.IN_PERSON;
        if (sessionMode === SESSION_MODES.NOT_DECIDED) return SESSION_MODES.NOT_DECIDED;
        return SESSION_MODES.ONLINE;
    }

    private canMutateSessionMode(status: string): boolean {
        return status !== APPOINTMENT_STATUSES.COMPLETED && status !== APPOINTMENT_STATUSES.CANCELED;
    }

    private populateBase(query: any) {
        return query
            .populate('userId', this.userSelect)
            .populate('mentorId', this.mentorSelect);
    }

    private isSameSlot(slotA: HourSlot, slotB: HourSlot): boolean {
        return slotA.startTime === slotB.startTime
            && slotA.startPeriod === slotB.startPeriod
            && slotA.endTime === slotB.endTime
            && slotA.endPeriod === slotB.endPeriod;
    }

    private mergeSlotsIntoRawRanges(slots: HourSlot[]): HourSlot[] {
        if (slots.length === 0) {
            return [];
        }

        const sortedSlots = [...slots].sort((left, right) => {
            const leftMinutes = convertSlotToMinutes(left.startTime, left.startPeriod);
            const rightMinutes = convertSlotToMinutes(right.startTime, right.startPeriod);
            return leftMinutes - rightMinutes;
        });

        const merged: HourSlot[] = [];

        for (const slot of sortedSlots) {
            const previous = merged[merged.length - 1];

            if (!previous) {
                merged.push({ ...slot });
                continue;
            }

            const previousEnd = convertSlotToMinutes(previous.endTime, previous.endPeriod);
            const currentStart = convertSlotToMinutes(slot.startTime, slot.startPeriod);

            if (previousEnd === currentStart) {
                previous.endTime = slot.endTime;
                previous.endPeriod = slot.endPeriod;
                continue;
            }

            merged.push({ ...slot });
        }

        return merged;
    }

    private uniqPushString(list: string[] | undefined, value: string): string[] {
        const arr = list ?? [];
        return arr.includes(value) ? [...arr] : [...arr, value];
    }

    private listWithoutString(list: string[] | undefined, value: string): string[] {
        return (list ?? []).filter((entry) => entry !== value);
    }

    /** UTC `YYYY-MM-DD` from arbitrary date payloads. */
    private coerceDayKeyUTC(dateInput: string): string {
        try {
            return dateKeyUtcForInput(dateInput);
        } catch {
            throw new BadRequestException('Invalid date.');
        }
    }

    /**
     * Appointment field `userGoogleCalendarEventId` lives on this user’s linked Google account
     * (Director, pastor, etc.) — defaults to `appointment.userId`.
     */
    private nonMentorPartyGoogleCalendarUserId(appt: {
        userId: Types.ObjectId;
        googleCalendarNonMentorUserId?: Types.ObjectId | null;
    }): Types.ObjectId {
        if (appt.googleCalendarNonMentorUserId) {
            return appt.googleCalendarNonMentorUserId;
        }
        return appt.userId;
    }

    private resolveNonMentorGoogleUserIdFromCreateDto(dto: CreateAppointmentDto): string {
        const raw = dto.googleCalendarNonMentorUserId?.trim();
        if (raw) {
            if (!Types.ObjectId.isValid(raw)) {
                throw new BadRequestException('Invalid googleCalendarNonMentorUserId.');
            }
            return raw;
        }
        return dto.userId;
    }

    /** Transparent Google events mirroring CCC slots (visual); FreeBusy blocking still uses opaque busy only. */
    private isCccAvailabilityMirrorSyncEnabled(): boolean {
        const v = this.configService.get<string>('CCC_SYNC_AVAILABILITY_TO_GOOGLE_MARKERS');
        if (v == null || String(v).trim() === '') return true;
        return !['0', 'false', 'no', 'off'].includes(String(v).trim().toLowerCase());
    }

    private scheduleAvailabilityMirrorsSyncToGoogle(hostMongoIdStr: string): void {
        if (!this.isCccAvailabilityMirrorSyncEnabled()) return;
        void this.syncHostAvailabilityMirrorsToGoogle(hostMongoIdStr).catch((e) =>
            this.logger.warn(
                `CCC→Google availability mirrors failed for host ${hostMongoIdStr}: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            ),
        );
    }

    /** Rebuild `[CCC] Open` mirrors on the host’s calendar from the current `availability` doc. */
    private async syncHostAvailabilityMirrorsToGoogle(hostMongoIdStr: string): Promise<void> {
        if (!(await this.googleCalendarService.hasLinkedCalendar(hostMongoIdStr))) return;

        const availability = await this.availabilityModel
            .findOne({ mentorId: new Types.ObjectId(hostMongoIdStr) })
            .exec();
        if (!availability) return;

        const horizon = Math.min(Math.max(availability.recurringHorizonDays ?? 60, 7), 120);
        const days = iterateUtcDaysFromToday(horizon);

        const rangeStart = new Date();
        rangeStart.setUTCHours(0, 0, 0, 0);
        const lastKey = days[days.length - 1]?.dateKey;
        const rangeEnd = lastKey
            ? new Date(`${lastKey}T23:59:59.999Z`)
            : new Date(rangeStart.getTime());

        const windows: { start: Date; end: Date }[] = [];
        for (const { dateKey } of days) {
            const row = availability.weeklySlots.find(
                (w) => w.date.toISOString().split('T')[0] === dateKey,
            );
            if (!row || (row as { unavailable?: boolean }).unavailable) continue;

            for (const slot of row.slots ?? []) {
                const hs = slot as HourSlot;
                const sm = convertSlotToMinutes(hs.startTime, hs.startPeriod);
                const em = convertSlotToMinutes(hs.endTime, hs.endPeriod);
                if (!(em > sm)) continue;
                const start = buildSlotDate(dateKey, hs);
                const end = new Date(start.getTime() + (em - sm) * 60 * 1000);
                windows.push({ start, end });
            }
        }

        await this.googleCalendarService.replaceOpenAvailabilityMarkers(
            hostMongoIdStr,
            hostMongoIdStr,
            rangeStart,
            rangeEnd,
            windows,
        );
    }

    /** Blocks booking when mentor or non-mentor participant Google calendars report busy (FreeBusy only — no event titles). */
    private async assertParticipantsGoogleFree(
        mentorIdStr: string,
        nonMentorPartyUserIdStr: string,
        start: Date,
        end: Date,
        excludeCurrentAppointment?: { meetingDate: Date; endTime: Date },
    ): Promise<void> {
        let mentorBusy = await this.googleCalendarService.listBusyIntervals(mentorIdStr, start, end);
        let nonMentorBusy = await this.googleCalendarService.listBusyIntervals(
            nonMentorPartyUserIdStr,
            start,
            end,
        );

        if (excludeCurrentAppointment) {
            const gap = {
                start: excludeCurrentAppointment.meetingDate,
                end: excludeCurrentAppointment.endTime,
            };
            mentorBusy = subtractIntervalFromBusyIntervals(mentorBusy, gap);
            nonMentorBusy = subtractIntervalFromBusyIntervals(nonMentorBusy, gap);
        }

        if (intervalOverlapsBusy(start, end, mentorBusy)) {
            throw new BadRequestException(
                'Selected time conflicts with external events on the mentor Google Calendar.',
            );
        }
        if (intervalOverlapsBusy(start, end, nonMentorBusy)) {
            throw new BadRequestException(
                'Selected time conflicts with external events on the non-mentor participant Google Calendar.',
            );
        }
    }

    /** Filters hourly mentor slots against Google Calendar busy ranges (always mentor; optionally second party). */
    private async filterSlotsAgainstGoogleCalendar(
        mentorIdStr: string,
        participantUserIdStr: string | undefined,
        dateStr: string,
        slots: HourSlot[],
        durationMinutes: number,
        excludeAppointment?: { meetingDate: Date; endTime: Date },
    ): Promise<HourSlot[]> {
        if (!slots.length) return [];

        const { dayStartUtc, scanEndUtc } = this.getIstDayUtcScanRange(dateStr, durationMinutes);

        let mentorBusy = await this.googleCalendarService.listBusyIntervals(
            mentorIdStr,
            dayStartUtc,
            scanEndUtc,
        );

        let pastorBusy =
            participantUserIdStr && Types.ObjectId.isValid(participantUserIdStr)
                ? await this.googleCalendarService.listBusyIntervals(
                      participantUserIdStr,
                      dayStartUtc,
                      scanEndUtc,
                  )
                : [];

        this.logger.debug(
            `[GoogleBusy] date=${dateStr} range_utc=${dayStartUtc.toISOString()}..${scanEndUtc.toISOString()} mentor_busy_count=${mentorBusy.length} participant_busy_count=${pastorBusy.length}`,
        );
        this.logger.debug(
            `[GoogleBusy] mentor_busy_intervals=${mentorBusy.map((b) => `${b.start.toISOString()}..${b.end.toISOString()}`).join(', ') || 'none'}`,
        );
        if (participantUserIdStr && Types.ObjectId.isValid(participantUserIdStr)) {
            this.logger.debug(
                `[GoogleBusy] participant_busy_intervals=${pastorBusy.map((b) => `${b.start.toISOString()}..${b.end.toISOString()}`).join(', ') || 'none'}`,
            );
        }

        if (excludeAppointment) {
            const gap = { start: excludeAppointment.meetingDate, end: excludeAppointment.endTime };
            mentorBusy = subtractIntervalFromBusyIntervals(mentorBusy, gap);
            pastorBusy = subtractIntervalFromBusyIntervals(pastorBusy, gap);
        }

        return slots.filter((slot) => {
            const slotStart = this.buildIstSlotStartUtc(dateStr, slot);
            const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
            const mentorOverlap = intervalOverlapsBusy(slotStart, slotEnd, mentorBusy);
            const participantOverlap =
                participantUserIdStr &&
                Types.ObjectId.isValid(participantUserIdStr) &&
                intervalOverlapsBusy(slotStart, slotEnd, pastorBusy);
            const keep = !mentorOverlap && !participantOverlap;
            this.logger.debug(
                `[GoogleBusy] slot=${slot.startTime} ${slot.startPeriod}-${slot.endTime} ${slot.endPeriod} normalized_utc=${slotStart.toISOString()}..${slotEnd.toISOString()} mentor_overlap=${mentorOverlap} participant_overlap=${Boolean(participantOverlap)} keep=${keep}`,
            );
            return keep;
        });
    }

    private getIstDayUtcScanRange(dateStr: string, durationMinutes: number): {
        dayStartUtc: Date;
        scanEndUtc: Date;
    } {
        const [y, m, d] = dateStr.split('-').map((x) => Number(x));
        if (!y || !m || !d) {
            throw new BadRequestException(`Invalid date key: ${dateStr}`);
        }
        const dayStartUtc = new Date(
            Date.UTC(y, m - 1, d, 0, 0, 0, 0) -
                AppointmentsService.IST_OFFSET_MINUTES * 60_000,
        );
        const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
        const scanEndUtc = new Date(dayEndUtc.getTime() + durationMinutes * 60_000);
        return { dayStartUtc, scanEndUtc };
    }

    private buildIstSlotStartUtc(dateStr: string, slot: HourSlot): Date {
        const [y, m, d] = dateStr.split('-').map((x) => Number(x));
        if (!y || !m || !d) {
            throw new BadRequestException(`Invalid date key: ${dateStr}`);
        }
        const hour12 = parseInt(slot.startTime, 10);
        if (!Number.isFinite(hour12)) {
            throw new BadRequestException(`Invalid slot start time: ${slot.startTime}`);
        }
        const minutePart = slot.startTime.includes(':') ? Number(slot.startTime.split(':')[1]) : 0;
        if (!Number.isFinite(minutePart)) {
            throw new BadRequestException(`Invalid slot start minutes: ${slot.startTime}`);
        }
        const hour24 =
            slot.startPeriod === 'PM'
                ? (hour12 % 12) + 12
                : hour12 === 12
                  ? 0
                  : hour12;
        return new Date(
            Date.UTC(y, m - 1, d, hour24, minutePart, 0, 0) -
                AppointmentsService.IST_OFFSET_MINUTES * 60_000,
        );
    }

    private async syncGoogleCalendarAfterBooking(params: {
        appointmentId: Types.ObjectId;
        mentorId: string;
        nonMentorGoogleUserId: string;
        start: Date;
        end: Date;
        topic: string;
        description?: string;
        mentorAttendeeEmail?: string;
        nonMentorAttendeeEmail?: string;
    }): Promise<string[]> {
        const {
            appointmentId,
            mentorId,
            nonMentorGoogleUserId,
            start,
            end,
            topic,
            description,
            mentorAttendeeEmail,
            nonMentorAttendeeEmail,
        } = params;
        const ext = { cccAppointmentId: appointmentId.toString() };
        const warnings: string[] = [];

        try {
            const [mentorRes, nonMentorRes] = await Promise.all([
                this.googleCalendarService.createEvent(mentorId, {
                    title: topic,
                    description,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    extendedPrivateProps: ext,
                    attendeeEmails:
                        nonMentorAttendeeEmail ? [nonMentorAttendeeEmail] : undefined,
                }),
                this.googleCalendarService.createEvent(nonMentorGoogleUserId, {
                    title: topic,
                    description,
                    start: start.toISOString(),
                    end: end.toISOString(),
                    extendedPrivateProps: ext,
                    attendeeEmails:
                        mentorAttendeeEmail ? [mentorAttendeeEmail] : undefined,
                }),
            ]);

            if (!mentorRes.ok) {
                if (mentorRes.reason === 'not_linked') {
                    warnings.push(
                        'Mentor has not linked Google Calendar (OAuth). No event was created on the mentor calendar.',
                    );
                } else {
                    warnings.push(
                        `Google Calendar could not create mentor event: ${mentorRes.message ?? 'unknown error'}`,
                    );
                }
            }
            if (!nonMentorRes.ok) {
                if (nonMentorRes.reason === 'not_linked') {
                    warnings.push(
                        'Non-mentor participant has not linked Google Calendar (OAuth). No event was created on their calendar.',
                    );
                } else {
                    warnings.push(
                        `Google Calendar could not create non-mentor event: ${nonMentorRes.message ?? 'unknown error'}`,
                    );
                }
            }

            await this.appointmentModel.updateOne(
                { _id: appointmentId },
                {
                    $set: {
                        mentorGoogleCalendarEventId: mentorRes.ok ? mentorRes.id : null,
                        userGoogleCalendarEventId: nonMentorRes.ok ? nonMentorRes.id : null,
                    },
                },
            );
            return warnings;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar sync after booking failed: ${msg}`);
            warnings.push(`Google Calendar sync failed unexpectedly: ${msg}`);
            return warnings;
        }
    }

    private async removeGoogleCalendarEventsForAppointment(appt: {
        mentorId: Types.ObjectId;
        nonMentorCalendarUserId: Types.ObjectId;
        mentorGoogleCalendarEventId?: string | null;
        userGoogleCalendarEventId?: string | null;
    }): Promise<void> {
        try {
            if (appt.mentorGoogleCalendarEventId) {
                await this.googleCalendarService.deleteEvent(
                    appt.mentorId.toString(),
                    appt.mentorGoogleCalendarEventId,
                );
            }
            if (appt.userGoogleCalendarEventId) {
                await this.googleCalendarService.deleteEvent(
                    appt.nonMentorCalendarUserId.toString(),
                    appt.userGoogleCalendarEventId,
                );
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar delete on cancel failed: ${msg}`);
        }
    }

    private async patchGoogleCalendarAfterReschedule(appt: {
        mentorId: Types.ObjectId;
        nonMentorCalendarUserId: Types.ObjectId;
        mentorGoogleCalendarEventId?: string | null;
        userGoogleCalendarEventId?: string | null;
        meetingDate: Date;
        endTime: Date;
    }): Promise<void> {
        const startIso = appt.meetingDate.toISOString();
        const endIso = appt.endTime.toISOString();

        try {
            if (appt.mentorGoogleCalendarEventId) {
                await this.googleCalendarService.updateEvent(
                    appt.mentorId.toString(),
                    appt.mentorGoogleCalendarEventId,
                    startIso,
                    endIso,
                );
            }
            if (appt.userGoogleCalendarEventId) {
                await this.googleCalendarService.updateEvent(
                    appt.nonMentorCalendarUserId.toString(),
                    appt.userGoogleCalendarEventId,
                    startIso,
                    endIso,
                );
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar reschedule patch failed: ${msg}`);
        }
    }

    /**
     * Writes one UTC calendar day's availability (expanded chunks skip conflicts with active appointments).
     */
    private async applyDayAvailabilityEntry(
        availability: AvailabilityDocument,
        mentorId: Types.ObjectId,
        dateKey: string,
        rawSlots: HourSlot[],
        meetingDuration: number,
        flags: {
            unavailable: boolean;
            generation?: 'recurring' | 'override' | 'legacy';
        },
    ): Promise<void> {
        if (!flags.unavailable && rawSlots.length > 0) {
            const check = validateSameDayRawSlotsNonOverlapping(rawSlots);
            if (!check.ok) {
                throw new BadRequestException(check.message);
            }
        }

        let filteredExpanded: HourSlot[] = [];
        if (!flags.unavailable && rawSlots.length > 0) {
            const expanded = rawSlots.flatMap((slot) =>
                splitIntoDurationSlots(
                    slot.startTime,
                    slot.startPeriod,
                    slot.endTime,
                    slot.endPeriod,
                    meetingDuration,
                ),
            );

            const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
            const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);

            const dayAppointments = await this.appointmentModel
                .find({
                    mentorId,
                    meetingDate: { $gte: dayStart, $lte: dayEnd },
                    status: { $in: [...this.slotOccupyingStatuses()] },
                })
                .select('meetingDate endTime')
                .lean();

            filteredExpanded = expanded.filter((slot) => {
                const { start, end } = this.getSlotDateRange(dateKey, slot);
                const overlaps = dayAppointments.some((appointment: { meetingDate: Date; endTime: Date }) => {
                    const appointmentStart = new Date(appointment.meetingDate);
                    const appointmentEnd = new Date(appointment.endTime);
                    return appointmentStart < end && appointmentEnd > start;
                });
                return !overlaps;
            });
        }

        const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
        const index = availability.weeklySlots.findIndex((d) => d.date.toISOString().split('T')[0] === dateKey);

        const generation: 'recurring' | 'override' | 'legacy' = flags.generation ?? 'legacy';

        const entry: DayAvailability = {
            date: dayStart,
            rawSlots: flags.unavailable ? [] : rawSlots,
            slots: flags.unavailable ? [] : filteredExpanded,
            unavailable: !!flags.unavailable,
            generation,
        };

        if (index !== -1) {
            availability.weeklySlots[index] = entry;
        } else {
            availability.weeklySlots.push(entry);
        }
    }

    private async removeDayRowIfRecurringGenerated(
        availability: AvailabilityDocument,
        dateKey: string,
    ): Promise<void> {
        const index = availability.weeklySlots.findIndex((d) => d.date.toISOString().split('T')[0] === dateKey);
        if (index === -1) {
            return;
        }
        const row = availability.weeklySlots[index] as { generation?: string };
        if (row.generation === 'recurring') {
            availability.weeklySlots.splice(index, 1);
        }
    }

    /** Refreshes auto-generated recurring rows inside the horizon; preserves exceptions, suppressions, and unavailable rows. */
    private async rematerializeRecurringForAvailability(availability: AvailabilityDocument): Promise<void> {
        const pattern = availability.recurringWeeklyPattern ?? [];
        if (!pattern.length) {
            return;
        }

        const mentorId = availability.mentorId as Types.ObjectId;
        const horizon = Math.min(Math.max(availability.recurringHorizonDays ?? 60, 7), 120);
        const meetingDuration = availability.meetingDuration ?? 60;
        const suppressed = new Set(availability.recurringSuppressedDates ?? []);
        const exceptions = new Set(availability.recurringExceptionDates ?? []);

        const patternByWeekday = new Map<number, HourSlot[]>();
        for (const row of pattern) {
            patternByWeekday.set(row.weekday, row.rawSlots as HourSlot[]);
        }

        const days = iterateUtcDaysFromToday(horizon);

        for (const { dateKey, weekday } of days) {
            if (suppressed.has(dateKey) || exceptions.has(dateKey)) {
                continue;
            }

            const template = availability.weeklySlots.find(
                (w) => w.date.toISOString().split('T')[0] === dateKey,
            ) as { unavailable?: boolean } | undefined;

            if (template?.unavailable) {
                continue;
            }

            const rawForDay = patternByWeekday.get(weekday);
            if (rawForDay && rawForDay.length > 0) {
                await this.applyDayAvailabilityEntry(availability, mentorId, dateKey, rawForDay, meetingDuration, {
                    unavailable: false,
                    generation: 'recurring',
                });
            } else {
                await this.removeDayRowIfRecurringGenerated(availability, dateKey);
            }
        }
    }

    private getSlotDateRange(dateStr: string, slot: HourSlot): { start: Date; end: Date } {
        const start = buildSlotDate(dateStr, slot);
        const end = new Date(dateStr);

        let endHour = parseInt(slot.endTime, 10);
        const endMinutes = slot.endTime.includes(':') ? parseInt(slot.endTime.split(':')[1], 10) : 0;

        if (slot.endPeriod === 'PM' && endHour !== 12) endHour += 12;
        if (slot.endPeriod === 'AM' && endHour === 12) endHour = 0;

        end.setHours(endHour, endMinutes, 0, 0);

        return { start, end };
    }

    private async markLinkedAssessmentCompleted(appointmentId: Types.ObjectId): Promise<void> {
        await this.assessmentAssignedModel.updateMany(
            { appointmentId },
            {
                $set: {
                    status: ASSESSMENT_ASSIGNMENT_STATUSES.COMPLETED,
                    submittedAt: new Date(),
                },
            }
        );
    }

    /** Lifecycle rules for PATCH `status` updates (same value = no-op, allowed without error). */
    private assertAppointmentStatusPatchAllows(current: string, requested: string): void {
        if (requested === current) return;
        if (requested === APPOINTMENT_STATUSES.IN_PROGRESS) {
            if (current !== APPOINTMENT_STATUSES.SCHEDULED) {
                throw new BadRequestException(
                    `Cannot set status to "${APPOINTMENT_STATUSES.IN_PROGRESS}" while status is "${current}" (transition from "${APPOINTMENT_STATUSES.SCHEDULED}" only).`,
                );
            }
        }
    }

    async create(dto: CreateAppointmentDto): Promise<AppointmentResponseDto> {
        const mentorId = new Types.ObjectId(dto.mentorId);

        let linkedAssessmentAssignmentId: Types.ObjectId | null = null;

        if (dto.assessmentAssignmentId) {
            if (!Types.ObjectId.isValid(dto.assessmentAssignmentId)) {
                throw new BadRequestException('Invalid assessment assignment ID format.');
            }

            linkedAssessmentAssignmentId = new Types.ObjectId(dto.assessmentAssignmentId);

            const assignment = await this.assessmentAssignedModel
                .findById(linkedAssessmentAssignmentId)
                .select('_id userId appointmentId')
                .lean();

            if (!assignment) {
                throw new NotFoundException('Assessment assignment not found.');
            }

            if (assignment.userId.toString() !== dto.userId) {
                throw new BadRequestException('Assessment assignment does not belong to the provided user.');
            }

            if (assignment.appointmentId) {
                throw new BadRequestException('This assessment is already linked to an appointment.');
            }
        }

        /** Google Calendar OAuth + sync use this account for `userGoogleCalendarEventId`; defaults to `userId`. */
        const nonMentorGoogleUserIdStr = this.resolveNonMentorGoogleUserIdFromCreateDto(dto);

        const isHostInitiated = dto.initiatorRole ? isHostRole(dto.initiatorRole) : false;

        const availability = await this.availabilityModel.findOne({ mentorId }).lean();
        if (!availability && !isHostInitiated) {
            throw new BadRequestException("Mentor has no availability set.");
        }

        const meetingDateUtc = new Date(dto.meetingDate);
        const meetingInMentorTz = new Date(meetingDateUtc.getTime() + (5.5 * 60 * 60 * 1000));

        const dateStr = meetingDateUtc.toISOString().split('T')[0];
        const selectedHour24 = meetingInMentorTz.getUTCHours();

        const selectedPeriod = selectedHour24 >= 12 ? "PM" : "AM";
        let displayHour = selectedHour24 % 12;
        if (displayHour === 0) displayHour = 12;

        const selectedSlot = {
            startTime: `${displayHour}:00`,
            startPeriod: selectedPeriod
        };

        if (!isHostInitiated) {
            const dayAvailability = availability!.weeklySlots.find(
                d => d.date.toISOString().split('T')[0] === dateStr
            );

            if (
                !dayAvailability ||
                (dayAvailability as { unavailable?: boolean }).unavailable ||
                dayAvailability.slots.length === 0
            ) {
                throw new BadRequestException("Mentor is not available on this date.");
            }

            const slotExists = dayAvailability.slots.some(s =>
                s.startTime === selectedSlot.startTime &&
                s.startPeriod === selectedSlot.startPeriod
            );

            if (!slotExists) {
                throw new BadRequestException("This slot is not available.");
            }
        }

        const meetingDate = meetingDateUtc;
        const durationMinutes = availability?.meetingDuration || 60;
        let finalMeetingDate = new Date(meetingDate);

        let endTime = new Date(meetingDate.getTime() + durationMinutes * 60000);

        const overlap = await this.appointmentModel.findOne({
            mentorId,
            meetingDate: { $lt: endTime },
            endTime: { $gt: meetingDate },
            status: { $in: [...this.slotOccupyingStatuses()] },
        });

        if (overlap) {
            throw new BadRequestException("This time slot is already booked.");
        }

        if (!isHostInitiated) {
            const noticeMs = (availability!.minSchedulingNoticeHours ?? 2) * 60 * 60 * 1000;
            const now = new Date();

            if (meetingDate.getTime() < now.getTime() + noticeMs) {
                throw new BadRequestException(
                    `Appointments must be booked at least ${availability!.minSchedulingNoticeHours} hours in advance.`
                );
            }
        }

        const startOfDay = new Date(meetingDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(meetingDate);
        endOfDay.setHours(23, 59, 59, 999);

        const dailyCount = await this.appointmentModel.countDocuments({
            mentorId,
            meetingDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: [...this.slotOccupyingStatuses()] },
        });

        endTime = new Date(finalMeetingDate.getTime() + durationMinutes * 60000);

        if (dailyCount >= (availability?.maxBookingsPerDay ?? 5)) {

            // Normal booking → block
            if (!dto.isSessionBooking) {
                throw new BadRequestException(
                    "Mentor has reached maximum bookings for this day."
                );
            }

            // Session booking → auto assign
            const MAX_LOOKAHEAD_DAYS = 50;
            let attempts = 0;

            const originalHours = finalMeetingDate.getUTCHours();
            const originalMinutes = finalMeetingDate.getUTCMinutes();

            let bookingDate = new Date(finalMeetingDate);

            while (attempts < MAX_LOOKAHEAD_DAYS) {
                attempts++;

                bookingDate.setUTCDate(bookingDate.getUTCDate() + 1);

                const startOfDay = new Date(bookingDate);
                startOfDay.setUTCHours(0, 0, 0, 0);

                const endOfDay = new Date(bookingDate);
                endOfDay.setUTCHours(23, 59, 59, 999);

                const count = await this.appointmentModel.countDocuments({
                    mentorId,
                    meetingDate: { $gte: startOfDay, $lte: endOfDay },
                    status: { $in: [...this.slotOccupyingStatuses()] },
                });

                if (count >= (availability?.maxBookingsPerDay ?? 5)) continue;

                const dateStrLoop = bookingDate.toISOString().split('T')[0];

                const dayAvailability = availability?.weeklySlots.find(
                    d => d.date.toISOString().split('T')[0] === dateStrLoop
                );

                if (!dayAvailability || (dayAvailability as { unavailable?: boolean }).unavailable || dayAvailability.slots.length === 0) continue;

                // slot validation
                const selectedHour24 = originalHours;
                const selectedPeriod = selectedHour24 >= 12 ? "PM" : "AM";

                let displayHour = selectedHour24 % 12;
                if (displayHour === 0) displayHour = 12;

                const slotExists = dayAvailability.slots.some(s =>
                    s.startTime === `${displayHour}:00` &&
                    s.startPeriod === selectedPeriod
                );

                if (!slotExists) continue;

                // overlap check (critical)
                const newStart = new Date(bookingDate);
                newStart.setUTCHours(originalHours, originalMinutes, 0, 0);

                const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

                const overlap = await this.appointmentModel.findOne({
                    mentorId,
                    meetingDate: { $lt: newEnd },
                    endTime: { $gt: newStart },
                    status: { $in: [...this.slotOccupyingStatuses()] },
                });

                if (overlap) continue;

                try {
                    await this.assertParticipantsGoogleFree(dto.mentorId, nonMentorGoogleUserIdStr, newStart, newEnd);
                } catch (err) {
                    if (err instanceof BadRequestException) continue;
                    throw err;
                }

                finalMeetingDate = newStart;
                break;
            }

            if (attempts === MAX_LOOKAHEAD_DAYS) {
                throw new BadRequestException(
                    "No available slots found in the next 50 days."
                );
            }
        }
        const finalStartDate = new Date(finalMeetingDate);

        await this.assertParticipantsGoogleFree(
            dto.mentorId,
            nonMentorGoogleUserIdStr,
            finalStartDate,
            new Date(finalStartDate.getTime() + durationMinutes * 60000),
        );

        // Get user and mentor details for Zoom meeting topic
        const userDoc = await this.appointmentModel.db.model('User').findById(dto.userId).lean() as any;
        const mentorDoc = await this.appointmentModel.db.model('User').findById(dto.mentorId).lean() as any;

        let nonMentorPartyDoc = userDoc as any;
        if (nonMentorGoogleUserIdStr !== dto.userId) {
            nonMentorPartyDoc = await this.appointmentModel.db
                .model('User')
                .findById(nonMentorGoogleUserIdStr)
                .lean();
        }

        const nonMentorAttendeeEmail =
            typeof nonMentorPartyDoc?.email === 'string' ? nonMentorPartyDoc.email : undefined;
        const mentorAttendeeEmail = typeof mentorDoc?.email === 'string' ? mentorDoc.email : undefined;
        const userName = userDoc ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() : 'Student';
        const mentorName = mentorDoc ? `${mentorDoc.firstName || ''} ${mentorDoc.lastName || ''}`.trim() : 'Mentor';
        const normalizedNotes = linkedAssessmentAssignmentId ? 'Assessment meeting' : dto.notes;
        // Mode-aware creation keeps legacy ONLINE behavior while skipping Zoom for non-online.
        const sessionMode = this.normalizeSessionMode(dto.sessionMode);
        const shouldGenerateZoom = sessionMode === SESSION_MODES.ONLINE;

        let zoomMeeting: any = null;
        let meetingLink = shouldGenerateZoom ? (dto.meetingLink || null) : null;

        if (shouldGenerateZoom && this.zoomService.isConfigured()) {
            try {
                this.logger.log(`Creating Zoom meeting for appointment: ${userName} with ${mentorName}`);

                let mentorZoomUserId: string | undefined = mentorDoc?.zoomUserId || undefined;

                if (!mentorZoomUserId && mentorDoc?.email) {
                    const fetchedId = await this.zoomService.getUserIdByEmail(mentorDoc.email);
                    if (fetchedId) {
                        mentorZoomUserId = fetchedId;
                        this.appointmentModel.db.model('User')
                            .updateOne({ _id: mentorDoc._id }, { $set: { zoomUserId: fetchedId } })
                            .exec()
                            .catch((err: any) => this.logger.warn(`Failed to cache zoomUserId for mentor ${mentorDoc._id}: ${err?.message}`));
                    }
                }

                const zoomResponse = await this.zoomService.createMeeting({
                    topic: `Mentoring Session: ${userName} with ${mentorName}`,
                    startTime: finalStartDate.toISOString(),
                    duration: durationMinutes,
                    timezone: 'Asia/Kolkata',
                    agenda: normalizedNotes || `Scheduled mentoring session between ${userName} and ${mentorName}`,
                    hostUserId: mentorZoomUserId,
                });

                zoomMeeting = {
                    meetingId: zoomResponse.meetingId,
                    joinUrl: zoomResponse.joinUrl,
                    startUrl: zoomResponse.startUrl,
                    password: zoomResponse.password,
                    hostEmail: zoomResponse.hostEmail,
                    hostId: zoomResponse.hostId,
                    topic: zoomResponse.topic,
                    duration: zoomResponse.duration,
                    timezone: zoomResponse.timezone,
                    createdAt: zoomResponse.createdAt,
                };
                meetingLink = zoomResponse.joinUrl;

                this.logger.log(`Zoom meeting created successfully: ${zoomResponse.meetingId}`);

            } catch (error) {
                this.logger.error(`Failed to create Zoom meeting: ${error.message}`);
                // Continue without Zoom meeting - don't fail the appointment creation
            }
        } else if (shouldGenerateZoom) {
            this.logger.warn('Zoom is not configured. Creating appointment without Zoom meeting.');
        }

        const {
            initiatorRole: _initiatorRole,
            googleCalendarNonMentorUserId: _omitGcalFromSpread,
            ...appointmentFields
        } = dto;

        const appointment = new this.appointmentModel({
            ...appointmentFields,
            notes: normalizedNotes,
            meetingDate: finalStartDate,
            endTime: new Date(finalStartDate.getTime() + durationMinutes * 60000),
            userId: new Types.ObjectId(dto.userId),
            mentorId,
            ...(dto.googleCalendarNonMentorUserId
                ? {
                      googleCalendarNonMentorUserId: new Types.ObjectId(dto.googleCalendarNonMentorUserId),
                  }
                : {}),
            platform:
                sessionMode === SESSION_MODES.IN_PERSON
                    ? APPOINTMENT_PLATFORMS.IN_PERSON
                    : APPOINTMENT_PLATFORMS.ZOOM,
            sessionMode,
            recordingStatus: RECORDING_STATUSES.NOT_STARTED,
            meetingLocation: dto.meetingLocation?.trim() || null,
            meetingLink,
            zoomMeetingId: zoomMeeting?.meetingId || null,
            zoomMeeting,
        });

        const saved = await appointment.save();

        if (linkedAssessmentAssignmentId) {
            await this.assessmentAssignedModel.updateOne(
                { _id: linkedAssessmentAssignmentId },
                { $set: { appointmentId: saved._id } }
            );
        }

        const populated = await this.populateBase(
            this.appointmentModel.findById(saved._id)
        ).lean();

        // use FINAL date (not original)
        const finalDateStr = finalMeetingDate.toISOString().split('T')[0];

        // recompute slot based on FINAL time
        const finalMeetingInTz = new Date(finalMeetingDate.getTime() + (5.5 * 60 * 60 * 1000));

        const finalHour24 = finalMeetingInTz.getUTCHours();
        const finalPeriod = finalHour24 >= 12 ? "PM" : "AM";

        let finalDisplayHour = finalHour24 % 12;
        if (finalDisplayHour === 0) finalDisplayHour = 12;

        const finalSlot = {
            startTime: `${finalDisplayHour}:00`,
            startPeriod: finalPeriod
        };

        await this.availabilityModel.updateOne(
            {
                mentorId,
                "weeklySlots.date": new Date(finalDateStr)
            },
            {
                $pull: {
                    "weeklySlots.$.slots": finalSlot
                }
            }
        );

        this.scheduleAvailabilityMirrorsSyncToGoogle(dto.mentorId);

        const googleCalendarSyncWarnings = await this.syncGoogleCalendarAfterBooking({
            appointmentId: saved._id as Types.ObjectId,
            mentorId: dto.mentorId,
            nonMentorGoogleUserId: nonMentorGoogleUserIdStr,
            start: finalStartDate,
            end: new Date(finalStartDate.getTime() + durationMinutes * 60000),
            topic: `CCC meeting: ${userName} × ${mentorName}`,
            description: [normalizedNotes, meetingLink ? `Join: ${meetingLink}` : '']
                .filter(Boolean)
                .join('\n'),
            mentorAttendeeEmail,
            nonMentorAttendeeEmail,
        });

        const result = toAppointmentResponseDto(populated as AppointmentDocument);

        const googleRow = await this.appointmentModel
            .findById(saved._id)
            .select('mentorGoogleCalendarEventId userGoogleCalendarEventId')
            .lean()
            .exec();
        if (googleRow) {
            result.mentorGoogleCalendarEventId = googleRow.mentorGoogleCalendarEventId ?? undefined;
            result.userGoogleCalendarEventId = googleRow.userGoogleCalendarEventId ?? undefined;
        }
        if (googleCalendarSyncWarnings.length > 0) {
            result.googleCalendarSyncWarnings = googleCalendarSyncWarnings;
        }

        try {
            const whenLabel = formatMeetingDateForNotification(result.meetingDate);
            const zoomInfo = meetingLink ? ` Join Zoom: ${meetingLink}` : '';

            await this.notificationService.addNotification({
                userId: dto.userId,
                name: 'Appointment scheduled',
                details: `Your mentorship session with ${mentorName} is on ${whenLabel}.${zoomInfo}`,
                module: 'APPOINTMENT',
            });

            await this.notificationService.addNotification({
                userId: dto.mentorId,
                name: 'New session booked',
                details: `${userName} scheduled a mentorship session with you for ${whenLabel}.${zoomInfo}`,
                module: 'APPOINTMENT',
            });

            await this.notificationService.addNotification({
                role: ROLES.DIRECTOR,
                name: 'Appointment booked',
                details: `${userName} booked a session with ${mentorName} (${whenLabel}).`,
                module: 'APPOINTMENT',
            });

            // Send email notifications to pastor (user) and mentor if Zoom link exists
            if (meetingLink && zoomMeeting) {
                const emailOpts = {
                    joinUrl: meetingLink,
                    password: zoomMeeting.password,
                    meetingId: zoomMeeting.meetingId,
                    durationMinutes,
                    meetingDate: result.meetingDate,
                };

                if (userDoc?.email) {
                    await this.mailerService.sendAppointmentConfirmation({
                        to: userDoc.email,
                        recipientName: userName,
                        otherPartyName: mentorName,
                        role: 'pastor',
                        ...emailOpts,
                    });
                }

                if (mentorDoc?.email) {
                    await this.mailerService.sendAppointmentConfirmation({
                        to: mentorDoc.email,
                        recipientName: mentorName,
                        otherPartyName: userName,
                        role: 'mentor',
                        ...emailOpts,
                    });
                }
            }

        } catch (err) {
            this.logger.warn(`Failed to send appointment notifications: ${err?.message ?? err}`);
        }

        return result;
    }

    async getAppointments(options?: {
        userId?: string;
        mentorId?: string;
        futureOnly?: boolean;
        status?: string;
    }): Promise<AppointmentResponseDto[]> {
        const { userId, mentorId, futureOnly = true, status } = options || {};
        const andClauses: Record<string, unknown>[] = [];

        if (userId && mentorId) {
            const userObjId = new Types.ObjectId(userId);
            const mentorObjId = new Types.ObjectId(mentorId);
            andClauses.push({
                $or: [{ userId: userObjId }, { mentorId: mentorObjId }],
            });
        } else if (userId) {
            andClauses.push({ userId: new Types.ObjectId(userId) });
        } else if (mentorId) {
            andClauses.push({ mentorId: new Types.ObjectId(mentorId) });
        }

        if (futureOnly) {
            if (status === APPOINTMENT_STATUSES.IN_PROGRESS) {
                andClauses.push({ status: APPOINTMENT_STATUSES.IN_PROGRESS });
            } else if (status) {
                andClauses.push({ meetingDate: { $gte: new Date() } });
                andClauses.push({ status });
            } else {
                andClauses.push({
                    $or: [
                        { meetingDate: { $gte: new Date() } },
                        { status: APPOINTMENT_STATUSES.IN_PROGRESS },
                    ],
                });
            }
        } else if (status) {
            andClauses.push({ status });
        }

        const query: Record<string, unknown> =
            andClauses.length === 0
                ? {}
                : andClauses.length === 1
                  ? andClauses[0]
                  : { $and: andClauses };

        const appointments = await this.populateBase(
            this.appointmentModel.find(query).sort({ meetingDate: 1 })
        ).lean().exec();

        return appointments.map(toAppointmentResponseDto);
    }

    async getSchedule(
        id: string,
        role: 'user' | 'mentor',
        futureOnly: boolean = true
    ): Promise<AppointmentResponseDto[]> {
        // Map role to userId or mentorId parameter
        if (role === 'user') {
            return this.getAppointments({ userId: id, futureOnly });
        } else {
            return this.getAppointments({ mentorId: id, futureOnly });
        }
    }

    async getAllUpcoming(userId?: string): Promise<AppointmentResponseDto[]> {
        if (userId) {
            // Check both userId and mentorId fields (user as mentee OR mentor)
            return this.getAppointments({
                userId,
                mentorId: userId,
                futureOnly: true,
            });
        }
        return this.getAppointments({
            futureOnly: true,
        });
    }

    async getTranscriptSummary(appointmentId: string): Promise<TranscriptSummaryResponseDto> {
        const appointment = await this.appointmentModel.findById(appointmentId).lean() as any;
        if (!appointment) {
            throw new NotFoundException(`Appointment with ID "${appointmentId}" not found.`);
        }

        if (!appointment.transcriptSummary || !appointment.transcriptSummarySavedAt) {
            throw new NotFoundException('Transcript summary is not generated yet for this appointment.');
        }

        return {
            appointmentId: appointment._id.toString(),
            transcript: appointment.transcript ?? undefined,
            transcriptSavedAt: appointment.transcriptSavedAt ?? undefined,
            summary: appointment.transcriptSummary,
            generatedAt: appointment.transcriptSummarySavedAt,
            model: appointment.transcriptSummaryModel ?? this.transcriptSummaryService.modelName,
            cached: true,
        };
    }

    async generateTranscriptSummary(appointmentId: string, refresh = false): Promise<TranscriptSummaryResponseDto> {
        const appointment = await this.appointmentModel.findById(appointmentId).lean() as any;
        if (!appointment) {
            throw new NotFoundException(`Appointment with ID "${appointmentId}" not found.`);
        }

        const transcript = typeof appointment.transcript === 'string' ? appointment.transcript.trim() : '';
        if (!transcript || transcript.length < 40) {
            throw new BadRequestException('Transcript is missing or too short to summarize.');
        }

        const transcriptSavedAt = appointment.transcriptSavedAt ? new Date(appointment.transcriptSavedAt) : null;
        const summarySavedAt = appointment.transcriptSummarySavedAt ? new Date(appointment.transcriptSummarySavedAt) : null;
        const hasCachedSummary = !!appointment.transcriptSummary && !!summarySavedAt;
        const isCacheFresh = hasCachedSummary && !!transcriptSavedAt && summarySavedAt!.getTime() >= transcriptSavedAt.getTime();

        if (!refresh && hasCachedSummary && isCacheFresh) {
            return {
                appointmentId: appointment._id.toString(),
                transcript: appointment.transcript ?? undefined,
                transcriptSavedAt: appointment.transcriptSavedAt ?? undefined,
                summary: appointment.transcriptSummary,
                generatedAt: summarySavedAt!,
                model: appointment.transcriptSummaryModel ?? this.transcriptSummaryService.modelName,
                cached: true,
            };
        }

        const summary = await this.transcriptSummaryService.summarizeTranscript(transcript);
        const generatedAt = new Date();
        const model = this.transcriptSummaryService.modelName;

        await this.appointmentModel.updateOne(
            { _id: appointment._id },
            {
                $set: {
                    transcriptSummary: summary,
                    transcriptSummarySavedAt: generatedAt,
                    transcriptSummaryModel: model,
                },
            }
        );

        return {
            appointmentId: appointment._id.toString(),
            transcript,
            transcriptSavedAt: transcriptSavedAt ?? undefined,
            summary,
            generatedAt,
            model,
            cached: false,
        };
    }

    private async ensureOnlineZoomMeetingForAppointment(appointment: any): Promise<{
        zoomMeetingId: string | null;
        zoomMeeting: any;
        meetingLink: string | null;
    }> {
        if (appointment.zoomMeetingId && appointment.zoomMeeting?.joinUrl) {
            return {
                zoomMeetingId: appointment.zoomMeetingId,
                zoomMeeting: appointment.zoomMeeting,
                meetingLink: appointment.zoomMeeting.joinUrl ?? appointment.meetingLink ?? null,
            };
        }

        if (!this.zoomService.isConfigured()) {
            return {
                zoomMeetingId: appointment.zoomMeetingId ?? null,
                zoomMeeting: appointment.zoomMeeting ?? null,
                meetingLink: appointment.meetingLink ?? null,
            };
        }

        const [userDoc, mentorDoc, availability] = await Promise.all([
            this.appointmentModel.db.model('User').findById(appointment.userId).lean(),
            this.appointmentModel.db.model('User').findById(appointment.mentorId).lean(),
            this.availabilityModel.findOne({ mentorId: appointment.mentorId }).select('meetingDuration').lean(),
        ]) as any[];

        const durationMinutes = availability?.meetingDuration || 60;
        const userName = userDoc ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() : 'Student';
        const mentorName = mentorDoc ? `${mentorDoc.firstName || ''} ${mentorDoc.lastName || ''}`.trim() : 'Mentor';

        let mentorZoomUserId: string | undefined = mentorDoc?.zoomUserId || undefined;
        if (!mentorZoomUserId && mentorDoc?.email) {
            const fetchedId = await this.zoomService.getUserIdByEmail(mentorDoc.email);
            if (fetchedId) {
                mentorZoomUserId = fetchedId;
                this.appointmentModel.db.model('User')
                    .updateOne({ _id: mentorDoc._id }, { $set: { zoomUserId: fetchedId } })
                    .exec()
                    .catch((err: any) =>
                        this.logger.warn(`Failed to cache zoomUserId for mentor ${mentorDoc._id}: ${err?.message}`),
                    );
            }
        }

        const zoomResponse = await this.zoomService.createMeeting({
            topic: `Mentoring Session: ${userName} with ${mentorName}`,
            startTime: new Date(appointment.meetingDate).toISOString(),
            duration: durationMinutes,
            timezone: 'Asia/Kolkata',
            agenda:
                appointment.notes || `Scheduled mentoring session between ${userName} and ${mentorName}`,
            hostUserId: mentorZoomUserId,
        });

        const zoomMeeting = {
            meetingId: zoomResponse.meetingId,
            joinUrl: zoomResponse.joinUrl,
            startUrl: zoomResponse.startUrl,
            password: zoomResponse.password,
            hostEmail: zoomResponse.hostEmail,
            hostId: zoomResponse.hostId,
            topic: zoomResponse.topic,
            duration: zoomResponse.duration,
            timezone: zoomResponse.timezone,
            createdAt: zoomResponse.createdAt,
        };

        return {
            zoomMeetingId: zoomResponse.meetingId ?? null,
            zoomMeeting,
            meetingLink: zoomResponse.joinUrl ?? appointment.meetingLink ?? null,
        };
    }

    async updateSessionMode(appointmentId: string, requestedMode: string): Promise<AppointmentResponseDto> {
        const appointment = await this.appointmentModel.findById(appointmentId).lean() as any;
        if (!appointment) {
            throw new NotFoundException('Appointment not found.');
        }

        if (!this.canMutateSessionMode(String(appointment.status))) {
            throw new BadRequestException(
                `Session mode cannot be changed while appointment status is "${appointment.status}".`,
            );
        }

        const sessionMode = this.normalizeSessionMode(requestedMode);
        const setDoc: Record<string, unknown> = {
            sessionMode,
        };

        if (sessionMode === SESSION_MODES.ONLINE) {
            const zoomPayload = await this.ensureOnlineZoomMeetingForAppointment(appointment);
            setDoc.platform = APPOINTMENT_PLATFORMS.ZOOM;
            setDoc.zoomMeetingId = zoomPayload.zoomMeetingId;
            setDoc.zoomMeeting = zoomPayload.zoomMeeting;
            setDoc.meetingLink = zoomPayload.meetingLink;
        } else if (sessionMode === SESSION_MODES.IN_PERSON) {
            setDoc.platform = APPOINTMENT_PLATFORMS.IN_PERSON;
        }

        const updated = await this.populateBase(
            this.appointmentModel.findByIdAndUpdate(
                appointment._id,
                { $set: setDoc },
                { new: true },
            ),
        ).lean().exec();

        if (!updated) {
            throw new NotFoundException('Appointment not found.');
        }

        return toAppointmentResponseDto(updated as AppointmentDocument);
    }

    async uploadInPersonRecording(
        appointmentId: string,
        file: Express.Multer.File | undefined,
    ): Promise<AppointmentResponseDto> {
        if (!file) {
            throw new BadRequestException('Audio file is required');
        }

        if (!isAllowedAudioUpload(file.mimetype, file.originalname)) {
            throw new BadRequestException(
                'Invalid audio format. Allowed: MP3, WAV, M4A, WebM, OGG, Opus, MP4, 3GP, and common mobile recordings',
            );
        }

        const appointment = await this.appointmentModel.findById(appointmentId).lean() as any;
        if (!appointment) {
            throw new NotFoundException('Appointment not found.');
        }

        if (appointment.sessionMode === SESSION_MODES.NOT_DECIDED) {
            throw new BadRequestException('Select ONLINE or IN_PERSON before uploading a recording.');
        }

        if (appointment.sessionMode !== SESSION_MODES.IN_PERSON) {
            throw new BadRequestException('Recording upload is supported only for IN_PERSON sessions.');
        }

        const extension = resolveAudioExtension(file.mimetype, file.originalname);
        const normalizedMime = normalizeMimeType(file.mimetype) || file.mimetype;
        const timestamp = Date.now();
        const s3Key = `appointments/${appointment._id.toString()}/recordings/${timestamp}.${extension}`;

        const recordingUrl = await this.s3Service.uploadFile(s3Key, file.buffer, normalizedMime);

        await this.appointmentModel.updateOne(
            { _id: appointment._id },
            {
                $set: {
                    recordingUrl,
                    recordingStatus: RECORDING_STATUSES.PROCESSING,
                },
            },
        );

        try {
            // Reuse shared conversation pipeline (Whisper + summary model), no duplicated AI logic.
            const processed = await this.conversationProcessingService.processAudio({
                audioBuffer: file.buffer,
                mimeType: normalizedMime,
                originalFilename: file.originalname,
            });

            await this.appointmentModel.updateOne(
                { _id: appointment._id },
                {
                    $set: {
                        transcript: processed.transcript,
                        transcriptSavedAt: new Date(),
                        transcriptSummary: processed.summary,
                        transcriptSummarySavedAt: new Date(),
                        transcriptSummaryModel: processed.model,
                        recordingStatus: RECORDING_STATUSES.COMPLETED,
                    },
                },
            );
        } catch (error) {
            await this.appointmentModel.updateOne(
                { _id: appointment._id },
                {
                    $set: {
                        recordingStatus: RECORDING_STATUSES.FAILED,
                    },
                },
            );
            throw error;
        }

        const updated = await this.populateBase(this.appointmentModel.findById(appointment._id))
            .lean()
            .exec();
        if (!updated) {
            throw new NotFoundException('Appointment not found.');
        }
        return toAppointmentResponseDto(updated as AppointmentDocument);
    }

    async update(id: string, dto: UpdateAppointmentDto): Promise<AppointmentResponseDto> {
        const { initiatorRole: _ir, ...updatePayload }: any = dto;

        const existing = await this.appointmentModel.findById(id).lean().exec();
        if (!existing) {
            throw new NotFoundException(`Appointment with ID "${id}" not found.`);
        }

        if (dto.status != null) {
            this.assertAppointmentStatusPatchAllows(String(existing.status), dto.status);
        }

        let durationMinutes = 60;
        const av = await this.availabilityModel
            .findOne({ mentorId: existing.mentorId })
            .select('meetingDuration')
            .lean()
            .exec();
        if (av?.meetingDuration) {
            durationMinutes = av.meetingDuration;
        }

        if (dto.meetingDate) {
            const newMeetingDate = new Date(dto.meetingDate);
            updatePayload.meetingDate = newMeetingDate;
            updatePayload.endTime = new Date(newMeetingDate.getTime() + durationMinutes * 60000);
        }

        const populated = await this.populateBase(
            this.appointmentModel.findByIdAndUpdate(
                new Types.ObjectId(id),
                { $set: updatePayload },
                { new: true }
            )
        ).lean().exec();

        if (!populated) {
            throw new NotFoundException(`Appointment with ID "${id}" not found.`);
        }

        if (dto.meetingDate && (populated.mentorGoogleCalendarEventId || populated.userGoogleCalendarEventId)) {
            await this.patchGoogleCalendarAfterReschedule({
                mentorId: populated.mentorId as Types.ObjectId,
                nonMentorCalendarUserId: this.nonMentorPartyGoogleCalendarUserId(populated as {
                    userId: Types.ObjectId;
                    googleCalendarNonMentorUserId?: Types.ObjectId | null;
                }),
                mentorGoogleCalendarEventId: populated.mentorGoogleCalendarEventId,
                userGoogleCalendarEventId: populated.userGoogleCalendarEventId,
                meetingDate: populated.meetingDate,
                endTime: populated.endTime,
            });
        }

        if (dto.status === APPOINTMENT_STATUSES.COMPLETED) {
            await this.markLinkedAssessmentCompleted(new Types.ObjectId(id));
        }

        if (dto.meetingDate) {
            try {

                let userName = 'User';
                let mentorName = 'Mentor';

                const userDoc: any = populated.userId;
                const mentorDoc: any = populated.mentorId;

                if (userDoc) userName = `${userDoc.firstName ?? ''} ${userDoc.lastName ?? ''}`.trim();
                if (mentorDoc) mentorName = `${mentorDoc.firstName ?? ''} ${mentorDoc.lastName ?? ''}`.trim();

                const whenLabel = formatMeetingDateForNotification(populated.meetingDate);

                await this.notificationService.addNotification({
                    userId: populated.userId._id.toString(),
                    name: 'Appointment rescheduled',
                    details: `Your session with ${mentorName} is now ${whenLabel}. Open CCC for your updated Zoom link and calendar.`,
                    module: 'APPOINTMENT',
                });

                await this.notificationService.addNotification({
                    userId: populated.mentorId._id.toString(),
                    name: 'Appointment rescheduled',
                    details: `${userName} moved your shared session to ${whenLabel}. Check CCC for the latest meeting link.`,
                    module: 'APPOINTMENT',
                });

                await this.notificationService.addNotification({
                    role: ROLES.DIRECTOR,
                    name: 'Appointment rescheduled',
                    details: `${userName} rescheduled their session with ${mentorName} to ${whenLabel}.`,
                    module: 'APPOINTMENT',
                });

                // Send rescheduled emails to pastor and mentor if Zoom link present
                const joinUrl = (populated as any).meetingLink;
                const zoom = (populated as any).zoomMeeting;
                if (joinUrl) {
                    const emailOpts = {
                        joinUrl,
                        password: zoom?.password,
                        meetingId: zoom?.meetingId,
                        durationMinutes: 60,
                        newMeetingDate: populated.meetingDate,
                    };
                    if (userDoc?.email) {
                        await this.mailerService.sendAppointmentRescheduled({
                            to: userDoc.email,
                            recipientName: userName,
                            otherPartyName: mentorName,
                            ...emailOpts,
                        });
                    }
                    if (mentorDoc?.email) {
                        await this.mailerService.sendAppointmentRescheduled({
                            to: mentorDoc.email,
                            recipientName: mentorName,
                            otherPartyName: userName,
                            ...emailOpts,
                        });
                    }
                }

            } catch (err) {
                this.logger.warn(`Failed to send reschedule notifications: ${err?.message ?? err}`);
            }
        }

        return toAppointmentResponseDto(populated as AppointmentDocument);
    }

    async upsertAvailability(dto: AvailabilityDto) {
        const mentorId = new Types.ObjectId(dto.mentorId);
        let availability = await this.availabilityModel.findOne({ mentorId });

        if (!availability) {
            availability = new this.availabilityModel({
                mentorId,
                weeklySlots: [],
            });
        }

        const meetingDuration = dto.meetingDuration ?? availability.meetingDuration ?? 60;
        const recurringActive =
            Array.isArray(availability.recurringWeeklyPattern) &&
            availability.recurringWeeklyPattern.length > 0;

        for (const day of dto.weeklySlots) {
            const dateStr = this.coerceDayKeyUTC(day.date);
            await this.applyDayAvailabilityEntry(availability, mentorId, dateStr, day.slots, meetingDuration, {
                unavailable: false,
                generation: recurringActive ? 'override' : 'legacy',
            });

            if (recurringActive) {
                availability.recurringExceptionDates = this.uniqPushString(
                    availability.recurringExceptionDates,
                    dateStr,
                );
                availability.recurringSuppressedDates = this.listWithoutString(
                    availability.recurringSuppressedDates,
                    dateStr,
                );
            }
        }

        availability.meetingDuration = meetingDuration;
        availability.minSchedulingNoticeHours =
            dto.minSchedulingNoticeHours ?? availability.minSchedulingNoticeHours ?? 2;
        availability.maxBookingsPerDay = dto.maxBookingsPerDay ?? availability.maxBookingsPerDay ?? 5;
        if (dto.preferredPlatform != null) {
            availability.preferredPlatform = dto.preferredPlatform;
        }

        if (recurringActive) {
            await this.rematerializeRecurringForAvailability(availability);
        }

        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(dto.mentorId);

        return availability;
    }

    /** Save or replace the master weekly pattern and materialize the next `horizonDays` (default 60). */
    async createRecurringWeeklyAvailability(dto: CreateRecurringAvailabilityDto) {
        await this.assertMentorDirectorFieldMentorForAvailability(dto.mentorId);

        const consolidated = consolidateTemplateSlotsByUtcWeekday(
            dto.templateWeeklySlots.map((row) => ({ date: row.date, slots: row.slots })),
        );

        const recurringWeeklyPattern = [...consolidated.entries()]
            .sort((a, b) => a[0] - b[0])
            .filter(([, slots]) => slots.length > 0)
            .map(([weekday, slots]) => {
                const chk = validateSameDayRawSlotsNonOverlapping(slots);
                if (!chk.ok) {
                    throw new BadRequestException(chk.message);
                }
                return { weekday, rawSlots: slots };
            });

        if (recurringWeeklyPattern.length === 0) {
            throw new BadRequestException(
                'Provide at least one day with non-empty availability windows for the repeating schedule.',
            );
        }

        const mentorOid = new Types.ObjectId(dto.mentorId);
        let availability = await this.availabilityModel.findOne({ mentorId: mentorOid });
        if (!availability) {
            availability = new this.availabilityModel({ mentorId: mentorOid, weeklySlots: [] });
        }

        if (dto.clearPersonalizations) {
            availability.recurringExceptionDates = [];
            availability.recurringSuppressedDates = [];
        }

        availability.recurringWeeklyPattern = recurringWeeklyPattern as Availability['recurringWeeklyPattern'];
        availability.recurringHorizonDays =
            dto.horizonDays != null
                ? Math.min(Math.max(dto.horizonDays, 7), 120)
                : (availability.recurringHorizonDays ?? 60);

        if (dto.meetingDuration != null) {
            availability.meetingDuration = dto.meetingDuration;
        }
        if (dto.minSchedulingNoticeHours != null) {
            availability.minSchedulingNoticeHours = dto.minSchedulingNoticeHours;
        }
        if (dto.maxBookingsPerDay != null) {
            availability.maxBookingsPerDay = dto.maxBookingsPerDay;
        }
        if (dto.preferredPlatform != null) {
            availability.preferredPlatform = dto.preferredPlatform;
        }

        await this.rematerializeRecurringForAvailability(availability);
        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(dto.mentorId);

        return availability;
    }

    /** Update one calendar day's windows; keeps other recurring-generated days untouched. */
    async upsertSingleDayAvailability(mentorId: string, dto: UpsertSingleDayAvailabilityDto) {
        await this.assertMentorDirectorFieldMentorForAvailability(mentorId);

        const mentorOid = new Types.ObjectId(mentorId);
        const dateKey = this.coerceDayKeyUTC(dto.date);

        let availability = await this.availabilityModel.findOne({ mentorId: mentorOid });
        if (!availability) {
            availability = new this.availabilityModel({ mentorId: mentorOid, weeklySlots: [] });
        }

        const meetingDuration = dto.meetingDuration ?? availability.meetingDuration ?? 60;

        if (dto.meetingDuration != null) {
            availability.meetingDuration = dto.meetingDuration;
        }
        if (dto.minSchedulingNoticeHours != null) {
            availability.minSchedulingNoticeHours = dto.minSchedulingNoticeHours;
        }
        if (dto.maxBookingsPerDay != null) {
            availability.maxBookingsPerDay = dto.maxBookingsPerDay;
        }
        if (dto.preferredPlatform != null) {
            availability.preferredPlatform = dto.preferredPlatform;
        }

        await this.applyDayAvailabilityEntry(availability, mentorOid, dateKey, dto.slots, meetingDuration, {
            unavailable: false,
            generation: 'override',
        });

        availability.recurringExceptionDates = this.uniqPushString(
            availability.recurringExceptionDates,
            dateKey,
        );
        availability.recurringSuppressedDates = this.listWithoutString(
            availability.recurringSuppressedDates,
            dateKey,
        );

        if ((availability.recurringWeeklyPattern?.length ?? 0) > 0) {
            await this.rematerializeRecurringForAvailability(availability);
        }

        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId);

        return this.getMentorAvailability(mentorId);
    }

    /** Deletes stored availability for a single date; suppressed when a recurring master exists so it is not auto-refilled. */
    async deleteSingleDayAvailability(mentorId: string, rawDateInput: string) {
        await this.assertMentorDirectorFieldMentorForAvailability(mentorId);

        const mentorOid = new Types.ObjectId(mentorId);
        const dateKey = this.coerceDayKeyUTC(rawDateInput);

        const availability = await this.availabilityModel.findOne({ mentorId: mentorOid });
        if (!availability) {
            throw new NotFoundException('Mentor availability not found.');
        }

        const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
        const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
        const bookingCount = await this.appointmentModel.countDocuments({
            mentorId: mentorOid,
            meetingDate: { $gte: dayStart, $lte: dayEnd },
            status: { $in: [...this.slotOccupyingStatuses()] },
        });
        if (bookingCount > 0) {
            throw new BadRequestException(
                'Cannot remove availability for a day that still has scheduled appointments.',
            );
        }

        const index = availability.weeklySlots.findIndex((d) => d.date.toISOString().split('T')[0] === dateKey);
        if (index !== -1) {
            availability.weeklySlots.splice(index, 1);
        }

        if ((availability.recurringWeeklyPattern?.length ?? 0) > 0) {
            availability.recurringSuppressedDates = this.uniqPushString(
                availability.recurringSuppressedDates,
                dateKey,
            );
        }

        availability.recurringExceptionDates = this.listWithoutString(
            availability.recurringExceptionDates,
            dateKey,
        );

        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId);

        return { mentorId, date: dateKey, deleted: true };
    }

    /** Mon–Sat only, next `horizonDays` calendar days from today (UTC midnight), 9 AM–9 PM raw range per day. */
    private buildMonSatNineToNineWeeklySlots(horizonDays = 60): { date: string; slots: HourSlot[] }[] {
        const rawRange: HourSlot = {
            startTime: '9:00',
            startPeriod: 'AM',
            endTime: '9:00',
            endPeriod: 'PM',
        };
        const out: { date: string; slots: HourSlot[] }[] = [];
        const start = new Date();
        start.setUTCHours(0, 0, 0, 0);

        for (let i = 0; i < horizonDays; i += 1) {
            const d = new Date(start);
            d.setUTCDate(start.getUTCDate() + i);
            const dow = d.getUTCDay();
            if (dow < 1 || dow > 6) {
                continue;
            }
            const dateStr = d.toISOString().split('T')[0];
            out.push({ date: dateStr, slots: [{ ...rawRange }] });
        }
        return out;
    }

    /** Next 60 calendar days Mon–Sat, 9 AM–9 PM raw window, 60 min / 2 h notice / 5 per day / Zoom. */
    private async upsertDefaultSixtyDayMonSatTemplateForMentor(mentorId: string): Promise<void> {
        const weeklySlots = this.buildMonSatNineToNineWeeklySlots(60);
        await this.upsertAvailability({
            mentorId,
            weeklySlots,
            meetingDuration: 60,
            minSchedulingNoticeHours: 2,
            maxBookingsPerDay: 5,
            preferredPlatform: APPOINTMENT_PLATFORMS.ZOOM,
        });
    }

    /**
     * Optional one-time migration only — not used on user create, interest accept, or cron.
     * Run manually: `npm run seed:mentor-availability`.
     */
    async seedDefaultSixtyDayAvailabilityForMentorsAndDirectors(): Promise<{
        userCount: number;
        seeded: number;
        errors: { userId: string; message: string }[];
    }> {
        const UserModel = this.appointmentModel.db.model('User');
        const users = await UserModel.find({
            $or: [
                { role: ROLES.FIELD_MENTOR },
                {
                    role: { $in: [ROLES.MENTOR, ROLES.DIRECTOR] },
                    status: USER_STATUSES.ACCEPTED,
                },
            ],
        })
            .select('_id')
            .lean()
            .exec();

        const errors: { userId: string; message: string }[] = [];
        let seeded = 0;

        for (const u of users) {
            const userId = (u as { _id: Types.ObjectId })._id.toString();
            try {
                await this.upsertDefaultSixtyDayMonSatTemplateForMentor(userId);
                seeded += 1;
            } catch (err: any) {
                errors.push({ userId, message: err?.message ?? String(err) });
                this.logger.warn(`seedDefaultSixtyDayAvailability: failed for ${userId}: ${err?.message ?? err}`);
            }
        }

        this.logger.log(
            `seedDefaultSixtyDayAvailability: ${seeded}/${users.length} users seeded, ${errors.length} error(s).`,
        );

        return { userCount: users.length, seeded, errors };
    }

    async deleteAvailabilitySlot(mentorId: string, dto: DeleteAvailabilitySlotDto) {
        const mentorObjectId = new Types.ObjectId(mentorId);
        const availability = await this.availabilityModel.findOne({ mentorId: mentorObjectId });

        if (!availability) {
            throw new NotFoundException('Mentor availability not found.');
        }
        let dayAvailability: any;
        let dayIndex = -1;
        let slotIndex = -1;

        if (dto.date) {
            const dateStr = new Date(dto.date).toISOString().split('T')[0];
            dayIndex = availability.weeklySlots.findIndex(
                day => day.date.toISOString().split('T')[0] === dateStr,
            );

            if (dayIndex === -1) {
                throw new NotFoundException('No availability found for the selected date.');
            }

            dayAvailability = availability.weeklySlots[dayIndex];
            slotIndex = dayAvailability.slots.findIndex(
                slot => (slot as any)._id?.toString() === dto.slotId,
            );
        } else {
            for (let index = 0; index < availability.weeklySlots.length; index += 1) {
                const day = availability.weeklySlots[index] as any;
                const currentSlotIndex = day.slots.findIndex(
                    (slot: any) => slot._id?.toString() === dto.slotId,
                );

                if (currentSlotIndex !== -1) {
                    dayIndex = index;
                    dayAvailability = day;
                    slotIndex = currentSlotIndex;
                    break;
                }
            }
        }

        if (dayIndex === -1 || slotIndex === -1 || !dayAvailability) {
            throw new NotFoundException('Selected slot does not exist for the chosen date.');
        }

        const slotToDelete = dayAvailability.slots[slotIndex] as HourSlot & { _id?: Types.ObjectId };
        const dateStr = dayAvailability.date.toISOString().split('T')[0];

        const { start, end } = this.getSlotDateRange(dateStr, slotToDelete);
        const scheduledAppointment = await this.appointmentModel.findOne({
            mentorId: mentorObjectId,
            meetingDate: { $lt: end },
            endTime: { $gt: start },
            status: { $in: [...this.slotOccupyingStatuses()] },
        }).lean();

        if (scheduledAppointment) {
            throw new BadRequestException('Cannot delete a slot that already has a scheduled appointment.');
        }

        dayAvailability.slots.splice(slotIndex, 1);

        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId);

        return {
            mentorId,
            date: dateStr,
            deletedSlotId: dto.slotId,
            deletedSlot: slotToDelete,
            remainingSlots: dayAvailability.slots,
            rawSlots: dayAvailability.rawSlots,
        };
    }

    async getMentorAvailability(mentorId: string) {
        const objectId = new Types.ObjectId(mentorId);

        const data = await this.availabilityModel
            .findOne({ mentorId: objectId })
            .lean();

        if (!data) {
            return {
                mentorId,
                weeklySlots: [],
                recurringWeeklyPattern: [],
                recurringHorizonDays: 60,
                recurringExceptionDates: [],
                recurringSuppressedDates: [],
            };
        }

        return {
            mentorId: data.mentorId,
            weeklySlots: data.weeklySlots.map((d) => ({
                date: d.date,
                rawSlots: d.rawSlots,
                unavailable: (d as { unavailable?: boolean }).unavailable ?? false,
                generation: (d as { generation?: string }).generation,
            })),
            recurringWeeklyPattern: data.recurringWeeklyPattern ?? [],
            recurringHorizonDays: data.recurringHorizonDays ?? 60,
            recurringExceptionDates: data.recurringExceptionDates ?? [],
            recurringSuppressedDates: data.recurringSuppressedDates ?? [],
        };
    }

    /**
     * CCC mentor availability plus Google Calendar busy intervals for merge on the client (opaque busy
     * windows only — Google FreeBusy does **not** expose event titles/details).
     * Path `userId` = host Mentor (or Mentor-shaped host) Mongo id.
     *
     * Omit `participantUserId` when the picker should subtract **only** the mentor’s Google busy times
     * (recommended for Directors choosing Mentor-facing slots — they never see Mentor event details).
     * Pass `participantUserId` only when combining a second OAuth’d calendar into the UI (busy times only).
     * `POST /appointments` still enforces Mentor + configured non-mentor OAuth FreeBusy before save.
     *
     * Hosts linked to Google also receive **mirror events** (“[CCC] Open — book via app”, transparent)
     * rebuilt from CCC whenever availability changes or slots are booked/canceled — see {@link GoogleCalendarService.replaceOpenAvailabilityMarkers}.
     */
    async getAvailabilityWithGoogleSummary(
        mentorId: string,
        opts?: { participantUserId?: string; from?: string; to?: string },
    ) {
        const base = await this.getMentorAvailability(mentorId);

        const rangeStart = opts?.from ? new Date(opts.from) : new Date();
        const rangeEnd = opts?.to
            ? new Date(opts.to)
            : new Date(rangeStart.getTime() + 21 * 24 * 60 * 60 * 1000);

        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
            throw new BadRequestException('Invalid from/to for Google Calendar range.');
        }
        if (rangeEnd.getTime() <= rangeStart.getTime()) {
            throw new BadRequestException('Query "to" must be after "from".');
        }

        const mentorLinked = await this.googleCalendarService.hasLinkedCalendar(mentorId);
        const mentorCalendarStatus = await this.googleCalendarService.getCalendarStatus(mentorId);
        const mentorBusy = await this.googleCalendarService.listBusyIntervals(mentorId, rangeStart, rangeEnd);

        let participant:
            | {
                  userId: string;
                  googleCalendarLinked: boolean;
                  googleCalendarStatus?: string;
                  busyIntervals: { start: string; end: string }[];
              }
            | undefined;

        const pid = opts?.participantUserId?.trim();
        if (pid && Types.ObjectId.isValid(pid)) {
            const participantCalendarStatus = await this.googleCalendarService.getCalendarStatus(pid);
            participant = {
                userId: pid,
                googleCalendarLinked: await this.googleCalendarService.hasLinkedCalendar(pid),
                googleCalendarStatus: participantCalendarStatus,
                busyIntervals: (
                    await this.googleCalendarService.listBusyIntervals(pid, rangeStart, rangeEnd)
                ).map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
            };
        }

        return {
            mentorId,
            cccAvailability: base,
            range: { from: rangeStart.toISOString(), to: rangeEnd.toISOString() },
            google: {
                mentor: {
                    googleCalendarLinked: mentorLinked,
                    googleCalendarStatus: mentorCalendarStatus,
                    busyIntervals: mentorBusy.map((b) => ({
                        start: b.start.toISOString(),
                        end: b.end.toISOString(),
                    })),
                },
                participant,
            },
        };
    }

    async getMonthlyAvailability(
        mentorId: string,
        year: number,
        month: number,
        participantUserId?: string,
    ) {
        const objectId = new Types.ObjectId(mentorId);
        const data = await this.availabilityModel.findOne({ mentorId: objectId }).lean();

        if (!data) {
            return [];
        }

        const monthly = generateMonthlyAvailability(data.weeklySlots, year, month);

        const now = new Date();
        const noticeMs = (data.minSchedulingNoticeHours ?? 2) * 60 * 60 * 1000;

        return Promise.all(
            monthly.map(async (day) => {
                const dayDate = new Date(day.date);

                const template = data.weeklySlots.find(
                    w => w.date.toISOString().split('T')[0] === day.date,
                );
                const dayUnavailable = (template as { unavailable?: boolean } | undefined)?.unavailable ?? false;

                const startOfDay = new Date(dayDate);
                startOfDay.setHours(0, 0, 0, 0);

                const endOfDay = new Date(dayDate);
                endOfDay.setHours(23, 59, 59, 999);

                const bookingCount = await this.appointmentModel.countDocuments({
                    mentorId: objectId,
                    meetingDate: { $gte: startOfDay, $lte: endOfDay },
                    status: { $in: [...this.slotOccupyingStatuses()] },
                });

                if (dayUnavailable || bookingCount >= (data.maxBookingsPerDay ?? 5)) {
                    return { ...day, slots: [], unavailable: dayUnavailable };
                }

                const filteredSlots = day.slots.filter(slot => {
                    const slotDate = buildSlotDate(day.date, slot);
                    return slotDate.getTime() >= now.getTime() + noticeMs;
                });

                let slotsOut = filteredSlots;
                if (slotsOut.length > 0) {
                    slotsOut = await this.filterSlotsAgainstGoogleCalendar(
                        mentorId,
                        participantUserId,
                        day.date,
                        slotsOut,
                        data.meetingDuration ?? 60,
                    );
                }

                return { ...day, slots: slotsOut, unavailable: false };
            })
        );
    }

    async reschedule(appointmentId: string, dto: { newDate: string }) {
        const IST_OFFSET = 5.5 * 3600 * 1000;

        const appointment = await this.appointmentModel.findById(appointmentId).lean();
        if (!appointment) throw new BadRequestException("Appointment not found.");

        const mentorId = appointment.mentorId;
        const availability = await this.availabilityModel.findOne({ mentorId }).lean();
        if (!availability) throw new BadRequestException("Mentor has no availability set.");

        const durationMinutes = availability.meetingDuration;
        if (!durationMinutes || typeof durationMinutes !== "number") {
            throw new BadRequestException("Invalid meeting duration.");
        }

        // Parse new meeting date
        const meetingDateUtc = new Date(dto.newDate);
        const meetingInMentorTz = new Date(meetingDateUtc.getTime() + IST_OFFSET);

        const weekday = meetingInMentorTz.getUTCDay();
        const selectedHour24 = meetingInMentorTz.getUTCHours();
        const minute = meetingInMentorTz.getUTCMinutes();

        if (minute !== 0)
            throw new BadRequestException("Time must start exactly at the hour.");

        // Compute start slot for new time
        const selectedPeriod = selectedHour24 >= 12 ? "PM" : "AM";
        let displayHour = selectedHour24 % 12;
        if (displayHour === 0) displayHour = 12;

        // Compute NEW end time
        const newEndUtc = new Date(meetingDateUtc.getTime() + durationMinutes * 60000);
        const newEndLocal = new Date(newEndUtc.getTime() + IST_OFFSET);

        const endHour24 = newEndLocal.getUTCHours();
        const endPeriod = endHour24 >= 12 ? "PM" : "AM";

        let endDisplayHour = endHour24 % 12;
        if (endDisplayHour === 0) endDisplayHour = 12;

        const selectedSlot = {
            startTime: `${displayHour}:00`,
            startPeriod: selectedPeriod,
            endTime: `${endDisplayHour}:00`,
            endPeriod: endPeriod
        };

        // Check availability
        const dateStr = meetingDateUtc.toISOString().split("T")[0];

        const dayAvailability = availability.weeklySlots.find(
            d => d.date.toISOString().split("T")[0] === dateStr
        );

        if (!dayAvailability || (dayAvailability as { unavailable?: boolean }).unavailable || dayAvailability.slots.length === 0)
            throw new BadRequestException("Mentor is not available on this date.");

        const slotExists = dayAvailability.slots.some(s =>
            s.startTime === selectedSlot.startTime &&
            s.startPeriod === selectedSlot.startPeriod &&
            s.endTime === selectedSlot.endTime &&
            s.endPeriod === selectedSlot.endPeriod
        );

        if (!slotExists)
            throw new BadRequestException("Selected slot is not available.");

        // Overlap check
        const overlap = await this.appointmentModel.findOne({
            mentorId,
            _id: { $ne: appointmentId },
            meetingDate: { $lt: newEndUtc },
            endTime: { $gt: meetingDateUtc },
            status: { $in: [...this.slotOccupyingStatuses()] },
        });

        if (overlap)
            throw new BadRequestException("This slot is already booked by another appointment.");

        await this.assertParticipantsGoogleFree(
            mentorId.toString(),
            this.nonMentorPartyGoogleCalendarUserId(appointment as {
                userId: Types.ObjectId;
                googleCalendarNonMentorUserId?: Types.ObjectId | null;
            }).toString(),
            meetingDateUtc,
            newEndUtc,
            {
                meetingDate: appointment.meetingDate as Date,
                endTime: appointment.endTime as Date,
            },
        );

        // 🚨 enforce max bookings per day for new date
        const startOfDay = new Date(meetingDateUtc);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(meetingDateUtc);
        endOfDay.setHours(23, 59, 59, 999);

        const dailyCount = await this.appointmentModel.countDocuments({
            mentorId,
            meetingDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: [...this.slotOccupyingStatuses()] },
            _id: { $ne: appointmentId }
        });

        if (dailyCount >= (availability.maxBookingsPerDay ?? 5)) {
            throw new BadRequestException(
                "Mentor has reached maximum bookings for this day."
            );
        }

        // Restore old slot 
        const oldMeetingUtc = new Date(appointment.meetingDate);
        const oldLocal = new Date(oldMeetingUtc.getTime() + IST_OFFSET);

        // const oldWeekday = oldLocal.getUTCDay();
        const oldHour24 = oldLocal.getUTCHours();
        const oldPeriod = oldHour24 >= 12 ? "PM" : "AM";

        let oldDisplay = oldHour24 % 12;
        if (oldDisplay === 0) oldDisplay = 12;

        // Old end calculation
        const oldEndUtc = new Date(oldMeetingUtc.getTime() + durationMinutes * 60000);
        const oldEndLocal = new Date(oldEndUtc.getTime() + IST_OFFSET);

        const oldEndHour24 = oldEndLocal.getUTCHours();
        const oldEndPeriod = oldEndHour24 >= 12 ? "PM" : "AM";

        let oldEndDisplay = oldEndHour24 % 12;
        if (oldEndDisplay === 0) oldEndDisplay = 12;

        const oldSlot = {
            startTime: `${oldDisplay}:00`,
            startPeriod: oldPeriod,
            endTime: `${oldEndDisplay}:00`,
            endPeriod: oldEndPeriod
        };

        // Restore old slot back into availability
        const oldDateStr = oldMeetingUtc.toISOString().split("T")[0];

        await this.availabilityModel.updateOne(
            { mentorId, "weeklySlots.date": new Date(oldDateStr) },
            { $addToSet: { "weeklySlots.$.slots": oldSlot } }
        );

        await this.availabilityModel.updateOne(
            { mentorId, "weeklySlots.date": new Date(dateStr) },
            { $pull: { "weeklySlots.$.slots": selectedSlot } }
        );

        const updated = await this.populateBase(
            this.appointmentModel.findByIdAndUpdate(
                appointmentId,
                {
                    $set: {
                        meetingDate: meetingDateUtc,
                        endTime: newEndUtc,
                        status: APPOINTMENT_STATUSES.SCHEDULED
                    }
                },
                { new: true }
            )
        ).lean();

        await this.patchGoogleCalendarAfterReschedule({
            mentorId: appointment.mentorId as Types.ObjectId,
            nonMentorCalendarUserId: this.nonMentorPartyGoogleCalendarUserId(
                appointment as {
                    userId: Types.ObjectId;
                    googleCalendarNonMentorUserId?: Types.ObjectId | null;
                },
            ),
            mentorGoogleCalendarEventId: appointment.mentorGoogleCalendarEventId,
            userGoogleCalendarEventId: appointment.userGoogleCalendarEventId,
            meetingDate: meetingDateUtc,
            endTime: newEndUtc,
        });

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId.toString());

        return toAppointmentResponseDto(updated as AppointmentDocument);
    }

    async handleZoomWebhook(payload: any): Promise<void> {
        const event = payload?.event;
        this.logger.log(`Zoom webhook received: ${event}`);

        if (event === 'recording.transcript_completed') {
            const meetingId = payload?.payload?.object?.id?.toString();

            if (!meetingId) {
                this.logger.warn('Zoom webhook: missing meetingId');
                return;
            }

            const appointment = await this.appointmentModel
                .findOne({ zoomMeetingId: meetingId })
                .lean();

            if (!appointment) {
                this.logger.warn(`Zoom webhook: no appointment found for meetingId ${meetingId}`);
                return;
            }

            try {
                const transcriptText = await this.zoomService.downloadTranscript(meetingId);

                await this.appointmentModel.updateOne(
                    { _id: appointment._id },
                    {
                        $set: {
                            transcript: transcriptText,
                            transcriptSavedAt: new Date(),
                            transcriptSummary: null,
                            transcriptSummarySavedAt: null,
                            transcriptSummaryModel: null,
                        },
                    }
                );

                this.logger.log(
                    `Transcript saved for appointment ${appointment._id} (meetingId: ${meetingId})`
                );
            } catch (err) {
                this.logger.error(
                    `Failed to save transcript for meetingId ${meetingId}: ${err.message}`
                );
            }
        }
    }

    async cancel(appointmentId: string, dto: { reason?: string }) {
        const IST_OFFSET = 5.5 * 3600 * 1000;

        // load appointment
        const appointment = await this.appointmentModel.findById(appointmentId).lean() as any;
        if (!appointment) throw new NotFoundException("Appointment not found.");

        // only scheduled appointments can be cancelled
        if (appointment.status !== APPOINTMENT_STATUSES.SCHEDULED) {
            throw new BadRequestException("Only scheduled appointments can be cancelled.");
        }

        // Delete Zoom meeting if exists
        if (appointment.zoomMeetingId && this.zoomService.isConfigured()) {
            try {
                this.logger.log(`Deleting Zoom meeting: ${appointment.zoomMeetingId}`);
                await this.zoomService.deleteMeeting(appointment.zoomMeetingId);
                this.logger.log(`Zoom meeting ${appointment.zoomMeetingId} deleted successfully`);
            } catch (error) {
                this.logger.warn(`Failed to delete Zoom meeting ${appointment.zoomMeetingId}: ${error.message}`);
                // Continue with cancellation even if Zoom deletion fails
            }
        }

        await this.removeGoogleCalendarEventsForAppointment({
            mentorId: appointment.mentorId,
            nonMentorCalendarUserId: this.nonMentorPartyGoogleCalendarUserId(
                appointment as {
                    userId: Types.ObjectId;
                    googleCalendarNonMentorUserId?: Types.ObjectId | null;
                },
            ),
            mentorGoogleCalendarEventId: appointment.mentorGoogleCalendarEventId,
            userGoogleCalendarEventId: appointment.userGoogleCalendarEventId,
        });

        const mentorId = appointment.mentorId;

        // load availability
        const availability = await this.availabilityModel.findOne({ mentorId }).lean();
        if (!availability) {
            // still cancel the appointment but warn — here we choose to still cancel and skip restoring slot
            await this.appointmentModel.updateOne(
                { _id: appointment._id },
                {
                    $set: {
                        status: APPOINTMENT_STATUSES.CANCELED ?? 'canceled',
                        canceledAt: new Date(),
                        cancelReason: dto.reason ?? null,
                        mentorGoogleCalendarEventId: null,
                        userGoogleCalendarEventId: null,
                    }
                }
            );
            return { appointmentId, status: APPOINTMENT_STATUSES.CANCELED ?? 'canceled' };
        }

        const durationMinutes = availability.meetingDuration ?? 60;

        // compute old slot (start + end) using mentor tz (IST)
        const oldMeetingUtc = new Date(appointment.meetingDate);
        const oldLocal = new Date(oldMeetingUtc.getTime() + IST_OFFSET);

        const oldWeekday = oldLocal.getUTCDay();
        const oldHour24 = oldLocal.getUTCHours();
        const oldPeriod = oldHour24 >= 12 ? "PM" : "AM";
        let oldDisplay = oldHour24 % 12;
        if (oldDisplay === 0) oldDisplay = 12;

        const oldEndUtc = new Date(oldMeetingUtc.getTime() + durationMinutes * 60000);
        const oldEndLocal = new Date(oldEndUtc.getTime() + IST_OFFSET);

        const oldEndHour24 = oldEndLocal.getUTCHours();
        const oldEndPeriod = oldEndHour24 >= 12 ? "PM" : "AM";
        let oldEndDisplay = oldEndHour24 % 12;
        if (oldEndDisplay === 0) oldEndDisplay = 12;

        const oldSlot = {
            startTime: `${oldDisplay}:00`,
            startPeriod: oldPeriod,
            endTime: `${oldEndDisplay}:00`,
            endPeriod: oldEndPeriod
        };

        // push slot back into availability
        await this.availabilityModel.updateOne(
            { mentorId, "weeklySlots.day": oldWeekday },
            { $addToSet: { "weeklySlots.$.slots": oldSlot } }
        );

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId.toString());

        // update appointment to cancelled
        const cancelledStatus = APPOINTMENT_STATUSES.CANCELED;

        const updated = await this.populateBase(
            this.appointmentModel.findByIdAndUpdate(
                appointment._id,
                {
                    $set: {
                        status: cancelledStatus,
                        canceledAt: new Date(),
                        cancelReason: dto.reason ?? null,
                        mentorGoogleCalendarEventId: null,
                        userGoogleCalendarEventId: null,
                    }
                },
                { new: true }
            )
        ).lean();


        try {
            const populated = updated; // already populated via populateBase()

            let userName = 'User';
            let mentorName = 'Mentor';

            const userDoc: any = populated.userId;
            const mentorDoc: any = populated.mentorId;

            if (userDoc) {
                userName = `${userDoc.firstName ?? ''} ${userDoc.lastName ?? ''}`.trim();
            }

            if (mentorDoc) {
                mentorName = `${mentorDoc.firstName ?? ''} ${mentorDoc.lastName ?? ''}`.trim();
            }

            const whenLabel = formatMeetingDateForNotification(populated.meetingDate);
            const reasonText =
                dto.reason ?
                    `Director note: ${dto.reason}`
                :   '';

            await this.notificationService.addNotification({
                userId: populated.userId._id.toString(),
                name: 'Appointment canceled',
                details: `The session with ${mentorName} that was planned for ${whenLabel} has been canceled. ${reasonText}`.trim(),
                module: 'APPOINTMENT',
            });

            await this.notificationService.addNotification({
                userId: populated.mentorId._id.toString(),
                name: 'Appointment canceled',
                details: `${userName}'s mentorship session (${whenLabel}) was canceled. ${reasonText}`.trim(),
                module: 'APPOINTMENT',
            });

            await this.notificationService.addNotification({
                role: ROLES.DIRECTOR,
                name: 'Appointment canceled',
                details: `Canceled: ${userName} with ${mentorName} (${whenLabel}). ${reasonText}`.trim(),
                module: 'APPOINTMENT',
            });

            // Send cancellation emails to pastor and mentor
            const cancelEmailOpts = {
                meetingDate: populated.meetingDate,
                reason: dto.reason,
            };
            if (userDoc?.email) {
                await this.mailerService.sendAppointmentCancellation({
                    to: userDoc.email,
                    recipientName: userName,
                    otherPartyName: mentorName,
                    ...cancelEmailOpts,
                });
            }
            if (mentorDoc?.email) {
                await this.mailerService.sendAppointmentCancellation({
                    to: mentorDoc.email,
                    recipientName: mentorName,
                    otherPartyName: userName,
                    ...cancelEmailOpts,
                });
            }

        } catch (err) {
            this.logger.warn(`Failed to send cancellation notifications: ${err?.message ?? err}`);
        }


        return toAppointmentResponseDto(updated as AppointmentDocument);
    }

    /**
     * Cron hook: completes `in-progress` appointments after `endTime` and marks stale `scheduled` as missed.
     * Meeting links are intentionally preserved here; they are cleared when mentor explicitly marks a session completed.
     */
    async runPastAppointmentLifecycleCron(): Promise<void> {
        const now = new Date();
        const GRACE_PERIOD_MS = 15 * 60 * 1000;
        const missedCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

        const inProgressCompleting = await this.appointmentModel
            .find({
                status: APPOINTMENT_STATUSES.IN_PROGRESS,
                endTime: { $lt: now },
            })
            .select('_id')
            .lean()
            .exec();

        if (inProgressCompleting.length > 0) {
            const ids = inProgressCompleting.map((d) => d._id);
            await this.appointmentModel.updateMany(
                { _id: { $in: ids } },
                {
                    $set: { status: APPOINTMENT_STATUSES.COMPLETED },
                },
            );
            for (const row of inProgressCompleting) {
                await this.markLinkedAssessmentCompleted(row._id as Types.ObjectId);
            }
        }

        const missedRes = await this.appointmentModel.updateMany(
            {
                status: APPOINTMENT_STATUSES.SCHEDULED,
                endTime: { $lt: missedCutoff },
            },
            {
                $set: {
                    status: APPOINTMENT_STATUSES.MISSED,
                },
            },
        );

        const missedModified =
            (missedRes as any)?.modifiedCount ??
            (missedRes as any)?.nModified ??
            0;

        if (inProgressCompleting.length > 0 || missedModified > 0) {
            this.logger.log(
                `Past appointments: completed(in-progress)→done ${inProgressCompleting.length}, marked missed ${missedModified}.`,
            );
        }
    }

    /**
     * Records a Zoom join for audit; host join sets `hostJoinedAt` on first touch and promotes `scheduled` → `in-progress`.
     */
    async recordSessionJoin(
        appointmentId: string,
        dto: RecordSessionJoinDto,
    ): Promise<AppointmentResponseDto> {
        const appointment = await this.appointmentModel.findById(appointmentId).lean() as AppointmentDocument | null;
        if (!appointment) throw new NotFoundException('Appointment not found.');

        if (
            appointment.status !== APPOINTMENT_STATUSES.SCHEDULED &&
            appointment.status !== APPOINTMENT_STATUSES.IN_PROGRESS
        ) {
            throw new BadRequestException(
                `Join can only be recorded for scheduled or in-progress sessions (current status is "${appointment.status}").`,
            );
        }

        const mentorIdStr = appointment.mentorId.toString();
        const pastorIdStr = appointment.userId.toString();
        const altParticipant =
            appointment.googleCalendarNonMentorUserId != null
                ? appointment.googleCalendarNonMentorUserId.toString()
                : null;

        if (dto.kind === 'host') {
            if (dto.userId !== mentorIdStr) {
                throw new ForbiddenException('Only the mentor (host) can record a host join.');
            }
        } else if (dto.userId !== pastorIdStr && dto.userId !== altParticipant) {
            throw new ForbiddenException(
                'Participant join must use the appointment participant user id (or googleCalendarNonMentorUserId when set).',
            );
        }

        const entry = {
            at: new Date(),
            userId: new Types.ObjectId(dto.userId),
            kind: dto.kind,
        };

        const setPayload: Record<string, unknown> = {};
        if (dto.kind === 'host' && !appointment.hostJoinedAt) {
            setPayload.hostJoinedAt = new Date();
        }
        if (dto.kind === 'host' && appointment.status === APPOINTMENT_STATUSES.SCHEDULED) {
            setPayload.status = APPOINTMENT_STATUSES.IN_PROGRESS;
        }

        const updateDoc: Record<string, unknown> = {
            $push: { joinAudit: entry },
        };
        if (Object.keys(setPayload).length > 0) {
            updateDoc.$set = setPayload;
        }

        const updated = await this.populateBase(
            this.appointmentModel.findByIdAndUpdate(appointment._id, updateDoc, { new: true }),
        ).lean().exec();

        if (!updated) throw new NotFoundException('Appointment not found.');

        return toAppointmentResponseDto(updated as AppointmentDocument);
    }

    /**
     * Manual "no-show": sets status to missed and clears join URLs (aligned with {@link AppointmentsCronService.completePastAppointments}).
     */
    async markMissed(
        appointmentId: string,
        dto: { reason?: string },
    ): Promise<AppointmentResponseDto> {
        const appointment = await this.appointmentModel.findById(appointmentId).lean() as AppointmentDocument | null;
        if (!appointment) throw new NotFoundException('Appointment not found.');

        if (appointment.status === APPOINTMENT_STATUSES.MISSED) {
            const populatedAgain = await this.populateBase(
                this.appointmentModel.findById(appointment._id),
            ).lean().exec() as AppointmentDocument | null;
            if (!populatedAgain) throw new NotFoundException('Appointment not found.');
            return toAppointmentResponseDto(populatedAgain);
        }

        if (
            appointment.status !== APPOINTMENT_STATUSES.SCHEDULED &&
            appointment.status !== APPOINTMENT_STATUSES.IN_PROGRESS
        ) {
            throw new BadRequestException(
                `Only scheduled or in-progress appointments can be marked as missed (current status is "${appointment.status}").`,
            );
        }

        const updated = await this.populateBase(
            this.appointmentModel.findByIdAndUpdate(
                appointment._id,
                {
                    $set: {
                        status: APPOINTMENT_STATUSES.MISSED,
                    },
                    $unset: {
                        meetingLink: 1,
                        'zoomMeeting.joinUrl': 1,
                        'zoomMeeting.startUrl': 1,
                    },
                },
                { new: true },
            ),
        ).lean().exec();

        if (!updated) throw new NotFoundException('Appointment not found.');

        try {
            let userName = 'User';
            let mentorName = 'Mentor';

            const userDoc: any = updated.userId;
            const mentorDoc: any = updated.mentorId;

            if (userDoc) userName = `${userDoc.firstName ?? ''} ${userDoc.lastName ?? ''}`.trim();
            if (mentorDoc) mentorName = `${mentorDoc.firstName ?? ''} ${mentorDoc.lastName ?? ''}`.trim();

            const whenLabel = formatMeetingDateForNotification(updated.meetingDate);
            const reasonText = dto.reason ? `Note: ${dto.reason}` : '';

            await this.notificationService.addNotification({
                userId: updated.userId._id.toString(),
                name: 'Session marked missed',
                details: `The session with ${mentorName} planned for ${whenLabel} was recorded as missed. ${reasonText}`.trim(),
                module: 'APPOINTMENT',
            });

            await this.notificationService.addNotification({
                userId: updated.mentorId._id.toString(),
                name: 'Session marked missed',
                details: `${userName}'s mentorship session (${whenLabel}) was recorded as missed. ${reasonText}`.trim(),
                module: 'APPOINTMENT',
            });

            await this.notificationService.addNotification({
                role: ROLES.DIRECTOR,
                name: 'Session marked missed',
                details: `Missed: ${userName} with ${mentorName} (${whenLabel}). ${reasonText}`.trim(),
                module: 'APPOINTMENT',
            });
        } catch (err) {
            this.logger.warn(`Failed to send missed-session notifications: ${err?.message ?? err}`);
        }

        return toAppointmentResponseDto(updated as AppointmentDocument);
    }

    async getWeeklyAvailabilityByDate(
        mentorId: string,
        dateStr: string,
        participantUserId?: string,
    ) {
        const objectId = new Types.ObjectId(mentorId);

        const availability = await this.availabilityModel
            .findOne({ mentorId: objectId })
            .lean();

        if (!availability) return [];

        const weekDays = getWeekRange(dateStr);

        const now = new Date();
        const noticeMs =
            (availability.minSchedulingNoticeHours ?? 2) * 60 * 60 * 1000;

        return Promise.all(
            weekDays.map(async (d) => {

                const currentDateStr = d.toISOString().slice(0, 10);

                const template = availability.weeklySlots.find(
                    w => new Date(w.date).toISOString().slice(0, 10) === currentDateStr
                );

                const dayUnavailable = (template as { unavailable?: boolean } | undefined)?.unavailable ?? false;
                let slots = dayUnavailable ? [] : (template?.slots ?? []);

                const startOfDay = new Date(d);
                startOfDay.setUTCHours(0, 0, 0, 0);

                const endOfDay = new Date(d);
                endOfDay.setUTCHours(23, 59, 59, 999);

                const bookingCount = await this.appointmentModel.countDocuments({
                    mentorId: objectId,
                    meetingDate: { $gte: startOfDay, $lte: endOfDay },
                    status: { $in: [...this.slotOccupyingStatuses()] },
                });

                if (bookingCount >= (availability.maxBookingsPerDay ?? 5)) {
                    slots = [];
                } else {
                    slots = slots.filter(slot => {
                        const slotDate = buildSlotDate(currentDateStr, slot);
                        return slotDate.getTime() >= now.getTime() + noticeMs;
                    });
                    if (slots.length > 0) {
                        slots = await this.filterSlotsAgainstGoogleCalendar(
                            mentorId,
                            participantUserId,
                            currentDateStr,
                            slots,
                            availability.meetingDuration ?? 60,
                        );
                    }
                }

                return {
                    date: currentDateStr,
                    day: d.getUTCDay(),
                    slots,
                    unavailable: dayUnavailable,
                };
            })
        );
    }

    async updateMentorAvailabilitySettings(
        mentorId: string,
        dto: UpdateMentorAvailabilitySettingsDto,
    ) {
        await this.assertMentorDirectorFieldMentorForAvailability(mentorId);

        const hasAny =
            dto.meetingDuration != null ||
            dto.minSchedulingNoticeHours != null ||
            dto.maxBookingsPerDay != null ||
            dto.preferredPlatform != null;
        if (!hasAny) {
            throw new BadRequestException(
                'Provide at least one of: meetingDuration, minSchedulingNoticeHours, maxBookingsPerDay, preferredPlatform.',
            );
        }

        const mentorOid = new Types.ObjectId(mentorId);
        const availability = await this.availabilityModel.findOne({ mentorId: mentorOid });
        if (!availability) {
            throw new NotFoundException('Mentor availability not found.');
        }

        if (dto.meetingDuration != null) {
            availability.meetingDuration = dto.meetingDuration;
        }
        if (dto.minSchedulingNoticeHours != null) {
            availability.minSchedulingNoticeHours = dto.minSchedulingNoticeHours;
        }
        if (dto.maxBookingsPerDay != null) {
            availability.maxBookingsPerDay = dto.maxBookingsPerDay;
        }
        if (dto.preferredPlatform != null) {
            availability.preferredPlatform = dto.preferredPlatform;
        }

        if ((availability.recurringWeeklyPattern?.length ?? 0) > 0 && dto.meetingDuration != null) {
            await this.rematerializeRecurringForAvailability(availability);
        }

        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId);

        return {
            mentorId,
            meetingDuration: availability.meetingDuration,
            minSchedulingNoticeHours: availability.minSchedulingNoticeHours,
            maxBookingsPerDay: availability.maxBookingsPerDay,
            preferredPlatform: availability.preferredPlatform,
        };
    }

    private async assertMentorDirectorFieldMentorForAvailability(mentorId: string): Promise<void> {
        const UserModel = this.appointmentModel.db.model('User');
        const user = await UserModel.findById(mentorId).select('role').lean() as { role?: string } | null;
        if (!user) {
            throw new NotFoundException('User not found.');
        }
        const allowed =
            user.role === ROLES.MENTOR ||
            user.role === ROLES.FIELD_MENTOR ||
            user.role === ROLES.DIRECTOR;
        if (!allowed) {
            throw new ForbiddenException(
                'Day availability can only be managed for mentors, field mentors, and directors.',
            );
        }
    }

    /** Block an entire calendar day (UTC date string) for booking. */
    async markMentorDayUnavailable(mentorId: string, dto: MentorAvailabilityDayDto) {
        await this.assertMentorDirectorFieldMentorForAvailability(mentorId);
        const dateStr = this.coerceDayKeyUTC(dto.date);
        const mentorOid = new Types.ObjectId(mentorId);

        const availability = await this.availabilityModel.findOne({ mentorId: mentorOid });
        if (!availability) {
            throw new NotFoundException('Mentor availability not found.');
        }

        availability.recurringExceptionDates = this.uniqPushString(availability.recurringExceptionDates, dateStr);
        availability.recurringSuppressedDates = this.listWithoutString(
            availability.recurringSuppressedDates,
            dateStr,
        );

        const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
        const index = availability.weeklySlots.findIndex(
            w => w.date.toISOString().split('T')[0] === dateStr,
        );

        if (index !== -1) {
            const slotDay = availability.weeklySlots[index];
            slotDay.rawSlots = [];
            slotDay.slots = [];
            slotDay.unavailable = true;
            slotDay.date = dayStart;
            slotDay.generation = 'override';
        } else {
            const blocked: DayAvailability = {
                date: dayStart,
                rawSlots: [],
                slots: [],
                unavailable: true,
                generation: 'override',
            };
            availability.weeklySlots.push(blocked);
        }

        await availability.save();

        this.scheduleAvailabilityMirrorsSyncToGoogle(mentorId);

        return { mentorId, date: dateStr, unavailable: true };
    }

    /**
     * Re-open a day with caller-defined time windows (e.g. 10 AM–12 PM and 6 PM–9 PM).
     * Slots are expanded using meeting duration and existing appointment overlap rules.
     */
    async openMentorUnavailableDay(mentorId: string, dto: OpenMentorDayDto) {
        await this.assertMentorDirectorFieldMentorForAvailability(mentorId);
        const dateStr = this.coerceDayKeyUTC(dto.date);
        const mentorOid = new Types.ObjectId(mentorId);

        const existing = await this.availabilityModel.findOne({ mentorId: mentorOid }).lean();

        await this.upsertAvailability({
            mentorId,
            weeklySlots: [{ date: dateStr, slots: dto.slots }],
            meetingDuration: existing?.meetingDuration ?? 60,
            minSchedulingNoticeHours: existing?.minSchedulingNoticeHours ?? 2,
            maxBookingsPerDay: existing?.maxBookingsPerDay ?? 5,
            preferredPlatform: existing?.preferredPlatform,
        });

        return {
            mentorId,
            date: dateStr,
            unavailable: false,
            slots: dto.slots,
        };
    }
}