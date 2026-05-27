/**
 * Short, readable lines for push + in-app notification bodies (HomeService.addNotification).
 */

export function formatMeetingDateForNotification(meetingDate: Date): string {
    try {
        return meetingDate.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'UTC',
            timeZoneName: 'short',
        });
    } catch {
        return meetingDate.toUTCString();
    }
}

/** Interest / CCC user.application status (`pending` | `accepted` | `rejected`). */
export function interestDecisionNotification(statusRaw: string): { name: string; details: string } {
    const s = statusRaw.toLowerCase().trim();
    switch (s) {
        case 'accepted':
            return {
                name: 'Application approved',
                details:
                    'Your interest application has been approved. Sign in to CCC to continue onboarding and access your dashboard.',
            };
        case 'rejected':
            return {
                name: 'Application update',
                details:
                    'Your interest application was not approved at this time. If you believe this is a mistake or have questions, contact your CCC coordinator.',
            };
        case 'pending':
            return {
                name: 'Application pending review',
                details:
                    'Your application is awaiting review. You will receive another notification when the decision is ready.',
            };
        default:
            return {
                name: 'Account status updated',
                details: `Your CCC profile status has been updated to "${statusRaw}". Sign in for full details.`,
            };
    }
}

export function microGrantStatusNotification(statusRaw: string): { name: string; details: string } {
    const s = statusRaw.toLowerCase().trim();
    switch (s) {
        case 'rejected':
            return {
                name: 'Micro-grant decision',
                details:
                    'Your micro-grant application was not approved. Open CCC to review any notes and next steps.',
            };
        case 'pending':
            return {
                name: 'Micro-grant pending',
                details:
                    'Your micro-grant application is now pending further review. We will notify you when the status changes.',
            };
        case 'accepted':
            return {
                name: 'Micro-grant approved',
                details:
                    'Your micro-grant application has been approved. Open CCC to confirm details and reporting steps.',
            };
        case 'new':
            return {
                name: 'Micro-grant received',
                details: 'We received your application and it has been queued for director review.',
            };
        default:
            return {
                name: 'Micro-grant status',
                details: `Your micro-grant application status is now: ${statusRaw}. Open CCC for details.`,
            };
    }
}

/** In-app notification when a mentee (pastor path) learns their mentor name. */
export function assignmentNotificationAsMentee(mentorFullName: string): { name: string; details: string } {
    const n = mentorFullName.trim();
    return {
        name: 'Mentor assigned',
        details: `${n || 'Your mentor'} is now your mentor in CCC. Open the app to view their profile and plan mentorship sessions.`,
    };
}

/** In-app notification when a mentor learns a new mentee was assigned. */
export function assignmentNotificationAsMenteeToMentor(menteeFullName: string): { name: string; details: string } {
    const n = menteeFullName.trim();
    return {
        name: 'Mentee assigned',
        details: `${n || 'A participant'} has been assigned to you as a mentee. Open your dashboard to review their profile and next steps.`,
    };
}

/** Generic pairing when mentor/mentee role inference isn't used. */
export function assignmentNotificationGeneric(
    partnerName: string,
    roleLabel: string,
): { name: string; details: string } {
    const partner = partnerName.trim();
    const role = roleLabel.trim();
    const roleClause = role ? ` (${role})` : '';
    return {
        name: 'New connection',
        details: `You are now connected with ${partner || 'another participant'}${roleClause} in CCC. Open the app to view their profile and continue.`,
    };
}

export function assessmentSectionRecommendationNotification(sectionTitle?: string): { name: string; details: string } {
    const t = sectionTitle?.trim();
    if (t) {
        return {
            name: 'Assessment recommendations',
            details: `New recommendations are ready for "${t}". Open CCC to read them and plan your next steps.`,
        };
    }
    return {
        name: 'Assessment recommendations',
        details: 'New recommendations were added to your assessment. Open CCC to read them and plan your next steps.',
    };
}

export function mentoringRescheduleRequestNotification(args: {
    sessionNumber: number;
    priorWhenLabel?: string;
    reason?: string;
}): { name: string; details: string } {
    const n = args.sessionNumber;
    let details = `Mentoring session ${n}: your pastor asked to reschedule and pick a new time together.`;
    if (args.priorWhenLabel) {
        details += ` Current scheduled time: ${args.priorWhenLabel}.`;
    }
    const r = args.reason?.trim();
    if (r) {
        const clipped = r.length > 140 ? `${r.slice(0, 140)}…` : r;
        details += ` Note from pastor: "${clipped}"`;
    }
    details += ' Open CCC to pick a new time.';
    return {
        name: 'Reschedule request',
        details,
    };
}

export function mentoringSessionRescheduledNotification(args: {
    sessionNumber: number;
    whenLabel: string;
}): { name: string; details: string } {
    const sn = args.sessionNumber;
    const sessionPhrase = sn > 0 ? `Session ${sn}` : 'Your mentorship session';
    return {
        name: 'Mentorship session rescheduled',
        details: `${sessionPhrase} is now set for ${args.whenLabel}. Open CCC for your meeting link and full details.`,
    };
}
