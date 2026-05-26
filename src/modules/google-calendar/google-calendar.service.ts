import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { UsersService } from '../users/users.service';

/** `extendedProperties.private` keys for CCC availability mirror events on Google Calendar. */
export const CCC_GOOGLE_AVAIL_MARKER_HOST_KEY = 'cccAvailHost';
export const CCC_GOOGLE_AVAIL_MARKER_KIND_KEY = 'cccAvailKind';
export const CCC_GOOGLE_AVAIL_KIND_OPEN = 'open';

export type BusyInterval = { start: Date; end: Date };

/** Result from `events.insert`; distinguishes missing OAuth vs API failure (both used to recover sync issues). */
export type GoogleCalendarInsertResult =
    | { ok: true; id: string }
    | { ok: false; reason: 'not_linked' | 'calendar_error'; message?: string };

/**
 * Removes `[gap.start, gap.end]` overlap from busy intervals (e.g. exclude current appointment while rescheduling).
 */
export function subtractIntervalFromBusyIntervals(
    busy: BusyInterval[],
    gap: BusyInterval,
): BusyInterval[] {
    const result: BusyInterval[] = [];
    const gs = gap.start.getTime();
    const ge = gap.end.getTime();
    if (!(gs < ge)) return [...busy];

    for (const b of busy) {
        const bs = b.start.getTime();
        const be = b.end.getTime();
        if (ge <= bs || gs >= be) {
            result.push(b);
            continue;
        }
        if (gs > bs && gs < be) {
            result.push({ start: b.start, end: new Date(Math.min(gs, be)) });
        }
        if (ge > bs && ge < be) {
            result.push({ start: new Date(Math.max(ge, bs)), end: b.end });
        }
    }
    return result.filter((x) => x.start.getTime() < x.end.getTime());
}

export function intervalOverlapsBusy(slotStart: Date, slotEnd: Date, busy: BusyInterval[]): boolean {
    const ss = slotStart.getTime();
    const se = slotEnd.getTime();
    return busy.some((b) => ss < b.end.getTime() && se > b.start.getTime());
}

@Injectable()
export class GoogleCalendarService {
    private readonly logger = new Logger(GoogleCalendarService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
    ) {}

    private createBareOAuth2Client() {
        return new google.auth.OAuth2(
            this.configService.get<string>('GOOGLE_CLIENT_ID'),
            this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
            this.configService.get<string>('GOOGLE_REDIRECT_URI'),
        );
    }

    getAuthUrl(userId: string): string {
        const client = this.createBareOAuth2Client();
        return client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            prompt: 'consent',
            state: userId,
        });
    }

    async getTokens(code: string): Promise<{
        access_token?: string;
        refresh_token?: string;
        expiry_date?: number;
    }> {
        const client = this.createBareOAuth2Client();
        const { tokens } = await client.getToken(code);
        return {
            access_token: tokens.access_token ?? undefined,
            refresh_token: tokens.refresh_token ?? undefined,
            expiry_date: tokens.expiry_date ?? undefined,
        };
    }

    /**
     * Live OAuth credential row (must not use `UsersService.findById`, which strips tokens for API responses).
     */
    private async getCalendarContext(userId: string): Promise<{
        calendar: calendar_v3.Calendar;
        calendarId: string;
    } | null> {
        const creds = await this.usersService.getGoogleOAuthCalendarCredentials(userId);

        if (!creds?.googleRefreshToken && !creds?.googleAccessToken) {
            return null;
        }

        const calendarIdRaw =
            typeof creds.googleCalendarId === 'string' && creds.googleCalendarId.trim().length > 0
                ? creds.googleCalendarId.trim()
                : 'primary';

        const oauth2 = this.createBareOAuth2Client();
        oauth2.setCredentials({
            access_token: creds.googleAccessToken,
            refresh_token: creds.googleRefreshToken,
            expiry_date: creds.googleTokenExpiry,
        });

        const needsRefresh =
            !!creds.googleRefreshToken &&
            (!creds.googleTokenExpiry || Date.now() >= Number(creds.googleTokenExpiry) - 60_000);

        if (needsRefresh) {
            try {
                const { credentials } = await oauth2.refreshAccessToken();
                const patch: Record<string, unknown> = {};
                if (credentials.access_token) patch.googleAccessToken = credentials.access_token;
                if (credentials.expiry_date != null) patch.googleTokenExpiry = credentials.expiry_date;
                if (credentials.refresh_token) patch.googleRefreshToken = credentials.refresh_token;
                await this.usersService.update(userId, patch as never);

                oauth2.setCredentials({
                    access_token: credentials.access_token ?? creds.googleAccessToken,
                    refresh_token: credentials.refresh_token ?? creds.googleRefreshToken,
                    expiry_date: credentials.expiry_date ?? creds.googleTokenExpiry,
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`Google OAuth refresh failed for user ${userId}: ${msg}`);
                return null;
            }
        }

        const calendar = google.calendar({ version: 'v3', auth: oauth2 });
        return { calendar, calendarId: calendarIdRaw };
    }

    /**
     * Authenticated Calendar API client (legacy helper).
     */
    async getAuthorizedCalendar(userId: string): Promise<calendar_v3.Calendar | null> {
        const ctx = await this.getCalendarContext(userId);
        return ctx?.calendar ?? null;
    }

    /** True when the user has stored Google OAuth tokens (Calendar scope). */
    async hasLinkedCalendar(userId: string): Promise<boolean> {
        const creds = await this.usersService.getGoogleOAuthCalendarCredentials(userId);
        return !!(creds?.googleRefreshToken || creds?.googleAccessToken);
    }

    /** Busy intervals on the user's linked Google calendar (see `googleCalendarId`, default `primary`). */
    async listBusyIntervals(userId: string, rangeStart: Date, rangeEnd: Date): Promise<BusyInterval[]> {
        const ctx = await this.getCalendarContext(userId);
        if (!ctx) return [];

        const { calendar, calendarId } = ctx;

        try {
            const res = await calendar.freebusy.query({
                requestBody: {
                    timeMin: rangeStart.toISOString(),
                    timeMax: rangeEnd.toISOString(),
                    items: [{ id: calendarId }],
                },
            });

            const busy = res.data.calendars?.[calendarId]?.busy ?? [];
            return busy
                .filter((b): b is { start?: string | null; end?: string | null } => !!(b?.start && b?.end))
                .map((b) => ({
                    start: new Date(b.start as string),
                    end: new Date(b.end as string),
                }));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar freebusy failed for user ${userId}: ${msg}`);
            return [];
        }
    }

    /** Returns true only when Google Calendar is linked and the target calendar has no overlap in `[start,end)`. */
    async checkAvailability(userId: string, startIso: string, endIso: string): Promise<boolean> {
        const start = new Date(startIso);
        const end = new Date(endIso);
        const busy = await this.listBusyIntervals(userId, start, end);
        return !intervalOverlapsBusy(start, end, busy);
    }

    /**
     * Replace CCC “open booking” mirror blocks on the host’s Google Calendar.
     * Mirrors are **transparent** (no FreeBusy). Real blocking still comes from normal Google events +
     * `listBusyIntervals` when showing slots in the app.
     */
    async replaceOpenAvailabilityMarkers(
        hostUserId: string,
        hostMongoIdHex: string,
        rangeStart: Date,
        rangeEnd: Date,
        windows: { start: Date; end: Date }[],
        opts?: { maxInserts?: number },
    ): Promise<{ deleted: number; inserted: number }> {
        const maxInserts = opts?.maxInserts ?? 500;
        const ctx = await this.getCalendarContext(hostUserId);
        if (!ctx) {
            return { deleted: 0, inserted: 0 };
        }

        const { calendar, calendarId } = ctx;
        const propFilter = `${CCC_GOOGLE_AVAIL_MARKER_HOST_KEY}=${hostMongoIdHex}`;
        let deleted = 0;

        try {
            let pageToken: string | undefined = undefined;
            do {
                const listRes = await calendar.events.list({
                    calendarId,
                    timeMin: rangeStart.toISOString(),
                    timeMax: rangeEnd.toISOString(),
                    singleEvents: true,
                    privateExtendedProperty: [propFilter],
                    pageToken,
                    maxResults: 250,
                });
                const items = listRes.data.items ?? [];
                const ids = items.map((e) => e.id).filter((id): id is string => !!id);

                const chunkSize = 8;
                for (let i = 0; i < ids.length; i += chunkSize) {
                    const chunk = ids.slice(i, i + chunkSize);
                    await Promise.all(
                        chunk.map((eventId) =>
                            calendar.events
                                .delete({ calendarId, eventId })
                                .then(() => {
                                    deleted += 1;
                                })
                                .catch((delErr: unknown) => {
                                    const m = delErr instanceof Error ? delErr.message : String(delErr);
                                    if (!String(m).includes('404')) {
                                        this.logger.warn(`Failed deleting CCC marker ${eventId}: ${m}`);
                                    }
                                }),
                        ),
                    );
                }
                pageToken = listRes.data.nextPageToken ?? undefined;
            } while (pageToken);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`replaceOpenAvailabilityMarkers list/delete failed (${hostUserId}): ${msg}`);
            return { deleted, inserted: 0 };
        }

        const seen = new Set<string>();
        const cleaned: { start: Date; end: Date }[] = [];
        for (const w of windows) {
            const s = w.start.getTime();
            const e = w.end.getTime();
            if (!(e > s)) continue;
            const key = `${s}-${e}`;
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push({ start: w.start, end: w.end });
        }
        cleaned.sort((a, b) => a.start.getTime() - b.start.getTime());

        let toInsert = cleaned;
        if (toInsert.length > maxInserts) {
            this.logger.warn(
                `replaceOpenAvailabilityMarkers: capping inserts for ${hostUserId} (${toInsert.length} → ${maxInserts})`,
            );
            toInsert = cleaned.slice(0, maxInserts);
        }

        let inserted = 0;
        const chunkIns = 4;
        for (let i = 0; i < toInsert.length; i += chunkIns) {
            const chunk = toInsert.slice(i, i + chunkIns);
            await Promise.all(
                chunk.map(async (w) => {
                    try {
                        const extPriv: Record<string, string> = {
                            [CCC_GOOGLE_AVAIL_MARKER_HOST_KEY]: hostMongoIdHex,
                            [CCC_GOOGLE_AVAIL_MARKER_KIND_KEY]: CCC_GOOGLE_AVAIL_KIND_OPEN,
                            cccSlotStart: w.start.toISOString(),
                            cccSlotEnd: w.end.toISOString(),
                        };
                        await calendar.events.insert({
                            calendarId,
                            sendUpdates: 'none',
                            requestBody: {
                                summary: '[CCC] Open — book via app',
                                description:
                                    'Mirror of CCC availability. External Google busy times still hide slots in the app; booking consumes the slot.',
                                transparency: 'transparent',
                                visibility: 'private',
                                start: {
                                    dateTime: w.start.toISOString(),
                                    timeZone: 'Asia/Kolkata',
                                },
                                end: {
                                    dateTime: w.end.toISOString(),
                                    timeZone: 'Asia/Kolkata',
                                },
                                extendedProperties: { private: extPriv },
                            },
                        });
                        inserted += 1;
                    } catch (insErr: unknown) {
                        const m = insErr instanceof Error ? insErr.message : String(insErr);
                        this.logger.warn(`replaceOpenAvailabilityMarkers insert failed (${hostUserId}): ${m}`);
                    }
                }),
            );
        }

        return { deleted, inserted };
    }

    /** Basic email sanity check — avoids malformed Google attendee payloads */
    private static normalizeAttendeeEmails(raw?: string[]): { email: string }[] | undefined {
        const out: { email: string }[] = [];
        const seen = new Set<string>();
        for (const e of raw ?? []) {
            const t = String(e ?? '').trim().toLowerCase();
            if (!t.includes('@')) continue;
            if (seen.has(t)) continue;
            seen.add(t);
            out.push({ email: t });
        }
        return out.length > 0 ? out : undefined;
    }

    async createEvent(
        userId: string,
        data: {
            title: string;
            description?: string;
            start: string;
            end: string;
            extendedPrivateProps?: Record<string, string>;
            /** Other party emails (shown on this calendar invite; no mass email due to sendUpdates:none). */
            attendeeEmails?: string[];
        },
    ): Promise<GoogleCalendarInsertResult> {
        const ctx = await this.getCalendarContext(userId);
        if (!ctx) {
            return { ok: false, reason: 'not_linked' };
        }

        const { calendar, calendarId } = ctx;

        try {
            const attendees = GoogleCalendarService.normalizeAttendeeEmails(data.attendeeEmails);
            const res = await calendar.events.insert({
                calendarId,
                /** Avoid duplicate outbound invites when CCC also writes an event on the guest’s calendar. */
                sendUpdates: 'none',
                requestBody: {
                    summary: data.title,
                    description: data.description,
                    start: {
                        dateTime: data.start,
                        timeZone: 'Asia/Kolkata',
                    },
                    end: {
                        dateTime: data.end,
                        timeZone: 'Asia/Kolkata',
                    },
                    attendees,
                    extendedProperties:
                        data.extendedPrivateProps && Object.keys(data.extendedPrivateProps).length > 0
                            ? { private: data.extendedPrivateProps }
                            : undefined,
                },
            });
            const id = res.data.id;
            if (!id) {
                return { ok: false, reason: 'calendar_error', message: 'Google Calendar returned no event id' };
            }
            return { ok: true, id };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar createEvent failed for user ${userId}: ${msg}`);
            return { ok: false, reason: 'calendar_error', message: msg };
        }
    }

    async updateEvent(userId: string, eventId: string, start: string, end: string): Promise<boolean> {
        const ctx = await this.getCalendarContext(userId);
        if (!ctx) return false;

        const { calendar, calendarId } = ctx;

        try {
            await calendar.events.patch({
                calendarId,
                eventId,
                requestBody: {
                    start: {
                        dateTime: start,
                        timeZone: 'Asia/Kolkata',
                    },
                    end: {
                        dateTime: end,
                        timeZone: 'Asia/Kolkata',
                    },
                },
            });
            return true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar updateEvent failed for user ${userId}: ${msg}`);
            return false;
        }
    }

    async deleteEvent(userId: string, eventId: string): Promise<boolean> {
        const ctx = await this.getCalendarContext(userId);
        if (!ctx) return false;

        const { calendar, calendarId } = ctx;

        try {
            await calendar.events.delete({
                calendarId,
                eventId,
            });
            return true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Google Calendar deleteEvent failed for user ${userId}: ${msg}`);
            return false;
        }
    }
}
