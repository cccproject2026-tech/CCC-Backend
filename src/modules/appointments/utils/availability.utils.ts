export function getDatesInMonth(year: number, month: number): Date[] {
    const dates: Date[] = [];
    let date = new Date(year, month, 1);

    while (date.getMonth() === month) {
        dates.push(new Date(date));
        date = new Date(date.setDate(date.getDate() + 1));
    }

    return dates;
}

export function generateMonthlyAvailability(
    weeklySlots: { date: Date; slots: HourSlot[] }[],
    year: number,
    month: number
) {
    const allDates = getDatesInMonth(year, month);

    return allDates.map((d) => {

        const dateStr = d.toISOString().split("T")[0];

        const found = weeklySlots.find(
            w => w.date.toISOString().split("T")[0] === dateStr
        );

        return {
            date: dateStr,
            day: d.getDay(),
            slots: found ? found.slots : []
        };
    });
}

export function convertSlotToMinutes(time: string, period: 'AM' | 'PM'): number {
    const parts = time.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1] ? parseInt(parts[1], 10) : 0;

    let total = hours * 60 + minutes;

    if (period === 'PM' && hours !== 12) total += 12 * 60;
    if (period === 'AM' && hours === 12) total -= 12 * 60;

    return total;
}

export function convertToMinutes(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

export function splitIntoDurationSlots(
    startTime: string,
    startPeriod: 'AM' | 'PM',
    endTime: string,
    endPeriod: 'AM' | 'PM',
    durationMinutes: number
): HourSlot[] {

    const result: HourSlot[] = [];

    const startMinutes = convertSlotToMinutes(startTime, startPeriod);
    const endMinutes = convertSlotToMinutes(endTime, endPeriod);

    let cursor = startMinutes;
    const limit = endMinutes;

    while (cursor + durationMinutes <= limit) {
        const slotEnd = cursor + durationMinutes;

        const start12 = minutesTo12h(cursor);
        const end12 = minutesTo12h(slotEnd);

        result.push({
            startTime: start12.time,
            startPeriod: start12.period as 'AM' | 'PM',
            endTime: end12.time,
            endPeriod: end12.period as 'AM' | 'PM'
        });

        cursor += durationMinutes;
    }

    return result;
}

function convertTo24(time: string, period: 'AM' | 'PM') {
    let hr = parseInt(time, 10);
    if (period === 'PM' && hr !== 12) hr += 12;
    if (period === 'AM' && hr === 12) hr = 0;
    return hr;
}

function minutesTo12h(totalMinutes: number) {
    const hour24 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';

    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;

    return {
        time: `${hour12}:${minutes.toString().padStart(2, '0')}`,
        period
    };
}

export interface HourSlot {
    startTime: string;
    startPeriod: 'AM' | 'PM';
    endTime: string;
    endPeriod: 'AM' | 'PM';
}

export interface WeeklySlot {
    day: number;
    slots: HourSlot[];
}

export function buildSlotDate(dateStr: string, slot: HourSlot): Date {
    const base = new Date(dateStr);

    let hour = parseInt(slot.startTime, 10);

    if (slot.startPeriod === 'PM' && hour !== 12) hour += 12;
    if (slot.startPeriod === 'AM' && hour === 12) hour = 0;

    base.setHours(hour, 0, 0, 0);
    return base;
}

export function getWeekRange(dateStr: string): Date[] {

    const input = new Date(dateStr + "T00:00:00Z");

    const start = new Date(input);
    const weekday = start.getUTCDay();

    start.setUTCDate(start.getUTCDate() - weekday);
    start.setUTCHours(0, 0, 0, 0);

    const days: Date[] = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        days.push(d);
    }

    return days;
}

/** True when two half-open UTC minute intervals [start,end) on the same day overlap beyond a mere touchpoint. */
export function rawAvailabilitiesOverlap(slotA: HourSlot, slotB: HourSlot): boolean {
    const aStart = convertSlotToMinutes(slotA.startTime, slotA.startPeriod);
    const aEnd = convertSlotToMinutes(slotA.endTime, slotA.endPeriod);
    const bStart = convertSlotToMinutes(slotB.startTime, slotB.startPeriod);
    const bEnd = convertSlotToMinutes(slotB.endTime, slotB.endPeriod);
    return aStart < bEnd && bStart < aEnd;
}

/**
 * Validates that raw availability windows within the same day do not overlap.
 * Boundaries touching (ends when next starts) are allowed.
 */
export function validateSameDayRawSlotsNonOverlapping(slots: HourSlot[]): {
    ok: true;
} | {
    ok: false;
    message: string;
} {
    if (slots.length < 2) return { ok: true };
    const sorted = [...slots].sort(
        (a, b) => convertSlotToMinutes(a.startTime, a.startPeriod) - convertSlotToMinutes(b.startTime, b.startPeriod),
    );
    for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
            if (rawAvailabilitiesOverlap(sorted[i], sorted[j])) {
                return { ok: false, message: 'Availability time windows overlap; adjust or merge ranges.' };
            }
        }
    }
    return { ok: true };
}

export function utcDateFromDateKey(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00.000Z`);
}

export function dateKeyUtcForInput(dateInput: string): string {
    const d = new Date(dateInput.includes('T') ? dateInput : `${dateInput}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
        throw new Error('Invalid date.');
    }
    return d.toISOString().split('T')[0];
}

/** IST is UTC+5:30 — matches manual booking and {@link AppointmentsService.buildIstSlotStartUtc}. */
export const IST_OFFSET_MINUTES = 330;

/** Normalize slot clock label for comparisons (`9:00` and `09:00` → same key). */
export function normalizeSlotClockLabel(time: string): string {
    const parts = String(time ?? '').split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return String(time ?? '').trim();
    return `${h}:${String(m).padStart(2, '0')}`;
}

/** Calendar date key (YYYY-MM-DD) for an instant in IST. */
export function meetingUtcToIstDateKey(meetingDateUtc: Date): string {
    const ist = new Date(meetingDateUtc.getTime() + IST_OFFSET_MINUTES * 60_000);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Derive display slot start from a booked meeting UTC instant (IST wall clock). */
export function meetingUtcToSlotStart(
    meetingDateUtc: Date,
): Pick<HourSlot, 'startTime' | 'startPeriod'> {
    const ist = new Date(meetingDateUtc.getTime() + IST_OFFSET_MINUTES * 60_000);
    const hour24 = ist.getUTCHours();
    const minutes = ist.getUTCMinutes();
    const selectedPeriod: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
    let displayHour = hour24 % 12;
    if (displayHour === 0) displayHour = 12;
    const startTime =
        minutes > 0
            ? `${displayHour}:${String(minutes).padStart(2, '0')}`
            : `${displayHour}:00`;
    return { startTime, startPeriod: selectedPeriod };
}

export function slotStartKeysMatch(
    a: Pick<HourSlot, 'startTime' | 'startPeriod'>,
    b: Pick<HourSlot, 'startTime' | 'startPeriod'>,
): boolean {
    return (
        normalizeSlotClockLabel(a.startTime) === normalizeSlotClockLabel(b.startTime) &&
        a.startPeriod === b.startPeriod
    );
}

/**
 * IST wall-clock slot start as UTC instant (same semantics as manual appointment booking).
 * Example: 2026-06-10 9:00 PM IST → 2026-06-10T15:30:00.000Z
 */
export function buildIstSlotStartUtc(dateStr: string, slot: HourSlot): Date {
    const [y, m, d] = dateStr.split('-').map((x) => Number(x));
    if (!y || !m || !d) {
        throw new Error(`Invalid date key: ${dateStr}`);
    }
    const hour12 = parseInt(slot.startTime, 10);
    if (!Number.isFinite(hour12)) {
        throw new Error(`Invalid slot start time: ${slot.startTime}`);
    }
    const minutePart = slot.startTime.includes(':')
        ? Number(slot.startTime.split(':')[1])
        : 0;
    if (!Number.isFinite(minutePart)) {
        throw new Error(`Invalid slot start minutes: ${slot.startTime}`);
    }
    const hour24 =
        slot.startPeriod === 'PM'
            ? (hour12 % 12) + 12
            : hour12 === 12
              ? 0
              : hour12;
    return new Date(
        Date.UTC(y, m - 1, d, hour24, minutePart, 0, 0) -
            IST_OFFSET_MINUTES * 60_000,
    );
}

/** Resolve a weekly availability `day.date` + slot to the UTC instant for booking. */
export function buildIstSlotStartUtcFromDayDate(
    dayDate: Date | string,
    slot: HourSlot,
): Date {
    const iso =
        dayDate instanceof Date ? dayDate.toISOString() : String(dayDate);
    return buildIstSlotStartUtc(dateKeyUtcForInput(iso), slot);
}

/** Consolidate arbitrary calendar rows into weekday → merged raw-slot lists (UTC). */
export function consolidateTemplateSlotsByUtcWeekday(
    rows: { date: string; slots: HourSlot[] }[],
): Map<number, HourSlot[]> {
    const map = new Map<number, HourSlot[]>();

    for (const row of rows) {
        const dateKey = dateKeyUtcForInput(row.date);
        const d = utcDateFromDateKey(dateKey);
        const weekday = d.getUTCDay();
        const combined = [...(map.get(weekday) ?? []), ...row.slots];
        map.set(weekday, combined);
    }

    return map;
}

export interface UtcDayCursor {
    dateKey: string;
    weekday: number;
}

/** Walk UTC calendar days forward from UTC today midnight. */
export function iterateUtcDaysFromToday(horizonDays: number): UtcDayCursor[] {
    const out: UtcDayCursor[] = [];
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < horizonDays; i += 1) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        out.push({
            dateKey: d.toISOString().split('T')[0],
            weekday: d.getUTCDay(),
        });
    }
    return out;
}