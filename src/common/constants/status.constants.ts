export const ROADMAP_STATUSES = {
  IN_PROGRESS: 'in progress',
  NOT_STARTED: 'not started',
  COMPLETED: 'completed',
  ALL: 'all',
} as const;

export const VALID_ROADMAP_STATUSES = [
  ROADMAP_STATUSES.IN_PROGRESS,
  ROADMAP_STATUSES.NOT_STARTED,
  ROADMAP_STATUSES.COMPLETED,
] as const;

export const SCHOLARSHIP_TYPES = {
  FULL_SCHOLARSHIP: 'Full scholarship',
  PARTIAL_SCHOLARSHIP: 'Partial Scholarship',
  FULL_COST: 'Full Cost',
  HALF_SCHOLARSHIP: 'Half Scholarship',
  ADRA_DISCOUNT: 'ADRA Discount',
} as const;

export const VALID_SCHOLARSHIP_TYPES = [
  SCHOLARSHIP_TYPES.FULL_SCHOLARSHIP,
  SCHOLARSHIP_TYPES.PARTIAL_SCHOLARSHIP,
  SCHOLARSHIP_TYPES.FULL_COST,
  SCHOLARSHIP_TYPES.HALF_SCHOLARSHIP,
  SCHOLARSHIP_TYPES.ADRA_DISCOUNT,
] as const;

export const SCHOLARSHIP_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
} as const;

export const VALID_SCHOLARSHIP_STATUSES = [
  SCHOLARSHIP_STATUSES.ACTIVE,
  SCHOLARSHIP_STATUSES.INACTIVE,
  SCHOLARSHIP_STATUSES.SUSPENDED,
] as const;

export const APPOINTMENT_STATUSES = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  MISSED: 'missed',
  POSTPONED: 'postponed',
  CANCELED: 'canceled',
} as const;

export const VALID_APPOINTMENT_STATUSES = [
  APPOINTMENT_STATUSES.SCHEDULED,
  APPOINTMENT_STATUSES.COMPLETED,
  APPOINTMENT_STATUSES.MISSED,
  APPOINTMENT_STATUSES.POSTPONED,
  APPOINTMENT_STATUSES.CANCELED,
] as const;

export const APPOINTMENT_PLATFORMS = {
  GMEET: 'gmeet',
  ZOOM: 'zoom',
  TEAMS: 'teams',
  PHONE: 'phone',
  IN_PERSON: 'in-person',
  CALENDLY: 'calendly',
  OTHER: 'other',
} as const;

export const VALID_APPOINTMENT_PLATFORMS = [
  APPOINTMENT_PLATFORMS.GMEET,
  APPOINTMENT_PLATFORMS.ZOOM,
  APPOINTMENT_PLATFORMS.TEAMS,
  APPOINTMENT_PLATFORMS.PHONE,
  APPOINTMENT_PLATFORMS.IN_PERSON,
  APPOINTMENT_PLATFORMS.CALENDLY,
  APPOINTMENT_PLATFORMS.OTHER,
] as const;

export const QUERY_STATUSES = {
  PENDING: 'pending',
  ANSWERED: 'answered',
} as const;

export const VALID_QUERY_STATUSES = [
  QUERY_STATUSES.PENDING,
  QUERY_STATUSES.ANSWERED,
] as const;

export const USER_ROLES = {
  DIRECTOR: 'director',
  MENTOR: 'mentor',
  PASTOR: 'pastor',
  PENDING: 'pending',
} as const;

export const VALID_USER_ROLES = [
  USER_ROLES.DIRECTOR,
  USER_ROLES.MENTOR,
  USER_ROLES.PASTOR,
  USER_ROLES.PENDING,
] as const;

export const OTP_PURPOSES = {
  EMAIL_VERIFICATION: 'email-verification',
  PASSWORD_RESET: 'password-reset',
  TWO_FACTOR_AUTH: '2fa',
} as const;

export const VALID_OTP_PURPOSES = [
  OTP_PURPOSES.EMAIL_VERIFICATION,
  OTP_PURPOSES.PASSWORD_RESET,
  OTP_PURPOSES.TWO_FACTOR_AUTH,
] as const;

export const USER_STATUSES = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

export const VALID_USER_STATUSES = [
  USER_STATUSES.PENDING,
  USER_STATUSES.ACCEPTED,
  USER_STATUSES.REJECTED,
] as const;

export const USER_APPLICATION_STATUSES = {
  NEW: 'new',
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

export const VALID_USER_APPLICATION_STATUSES = [
  USER_APPLICATION_STATUSES.NEW,
  USER_APPLICATION_STATUSES.PENDING,
  USER_APPLICATION_STATUSES.ACCEPTED,
  USER_APPLICATION_STATUSES.REJECTED,
] as const;

export const ASSESSMENT_ASSIGNMENT_STATUSES = {
  ASSIGNED: 'assigned',
  DUE: 'due',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
} as const;

export const VALID_ASSESSMENT_ASSIGNMENT_STATUSES = [
  ASSESSMENT_ASSIGNMENT_STATUSES.ASSIGNED,
  ASSESSMENT_ASSIGNMENT_STATUSES.DUE,
  ASSESSMENT_ASSIGNMENT_STATUSES.IN_PROGRESS,
  ASSESSMENT_ASSIGNMENT_STATUSES.COMPLETED,
] as const;

export const PROGRESS_STATUSES = {
  NOT_STARTED: 'not_started',
  DUE: 'due',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export const VALID_PROGRESS_STATUSES = [
  PROGRESS_STATUSES.NOT_STARTED,
  PROGRESS_STATUSES.DUE,
  PROGRESS_STATUSES.IN_PROGRESS,
  PROGRESS_STATUSES.COMPLETED,
] as const;

export const AWARD_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  REVOKED: 'revoked',
} as const;

export const VALID_AWARD_STATUSES = [
  AWARD_STATUSES.ACTIVE,
  AWARD_STATUSES.COMPLETED,
  AWARD_STATUSES.REVOKED,
] as const;

export const VALID_ASSESSMENT_TYPES = ['CMA', 'PMP'] as const;

export type AssessmentType = (typeof VALID_ASSESSMENT_TYPES)[number];
export type RoadMapStatus = (typeof VALID_ROADMAP_STATUSES)[number];
export type ScholarshipType = (typeof VALID_SCHOLARSHIP_TYPES)[number];
export type ScholarshipStatus = (typeof VALID_SCHOLARSHIP_STATUSES)[number];
export type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number];
export type AppointmentPlatform = (typeof VALID_APPOINTMENT_PLATFORMS)[number];
export type QueryStatus = (typeof VALID_QUERY_STATUSES)[number];
export type UserRole = (typeof VALID_USER_ROLES)[number];
export type OtpPurpose = (typeof VALID_OTP_PURPOSES)[number];
export type UserStatus = (typeof VALID_USER_STATUSES)[number];
export type UserApplicationStatus =
  (typeof VALID_USER_APPLICATION_STATUSES)[number];
export type AssessmentAssignmentStatus =
  (typeof VALID_ASSESSMENT_ASSIGNMENT_STATUSES)[number];
export type ProgressStatus = (typeof VALID_PROGRESS_STATUSES)[number];
export type AwardStatus = (typeof VALID_AWARD_STATUSES)[number];
