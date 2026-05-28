export const GOOGLE_CALENDAR_STATUSES = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    EXPIRED: 'expired',
    ERROR: 'error',
} as const;

export type GoogleCalendarStatus =
    (typeof GOOGLE_CALENDAR_STATUSES)[keyof typeof GOOGLE_CALENDAR_STATUSES];

export const VALID_GOOGLE_CALENDAR_STATUSES = Object.values(GOOGLE_CALENDAR_STATUSES);
