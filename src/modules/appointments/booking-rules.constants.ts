/**
 * Mentor booking rules → API validation for `meetingDuration` (minutes).
 * Keep in sync with scheduling UI dropdown options.
 */
export const CCC_ALLOWED_MEETING_DURATION_MINUTES = [30, 60] as const;

export type AllowedMeetingDurationMinutes =
    (typeof CCC_ALLOWED_MEETING_DURATION_MINUTES)[number];
