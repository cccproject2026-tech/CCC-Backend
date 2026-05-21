import {
    ONBOARDING_NEXT_STEPS,
    OnboardingNextStep,
    USER_APPLICATION_STATUSES,
    USER_STATUSES,
} from '../../../common/constants/status.constants';
import { OnboardingStatusResponseDto } from '../dto/onboarding-status.dto';

export type OnboardingLookup = {
    email: string;
    interestStatus?: string | null;
    isEmailVerified?: boolean;
    isPasswordSet?: boolean;
    hasPassword?: boolean;
};

/** Maps DB interest/user status to API `interestStatus` (pending | accepted | rejected). */
export function resolveInterestStatus(
    interestStatus?: string | null,
    userStatus?: string | null,
): string {
    const raw = (interestStatus || userStatus || USER_STATUSES.PENDING).toLowerCase();
    if (raw === USER_APPLICATION_STATUSES.NEW || raw === USER_STATUSES.PENDING) {
        return USER_STATUSES.PENDING;
    }
    if (raw === USER_STATUSES.ACCEPTED || raw === USER_APPLICATION_STATUSES.ACCEPTED) {
        return USER_STATUSES.ACCEPTED;
    }
    if (raw === USER_STATUSES.REJECTED || raw === USER_APPLICATION_STATUSES.REJECTED) {
        return USER_STATUSES.REJECTED;
    }
    return USER_STATUSES.PENDING;
}

export function resolveIsPasswordSet(data: OnboardingLookup): boolean {
    if (data.isPasswordSet === true) return true;
    return Boolean(data.hasPassword);
}

export function buildOnboardingStatusResponse(data: OnboardingLookup): OnboardingStatusResponseDto {
    const interestStatus = resolveInterestStatus(data.interestStatus);
    const email = data.email;
    const isEmailVerified = Boolean(data.isEmailVerified);
    const isPasswordSet = resolveIsPasswordSet(data);

    if (interestStatus === USER_STATUSES.REJECTED) {
        return { email, interestStatus, nextStep: ONBOARDING_NEXT_STEPS.REJECTED };
    }

    if (interestStatus === USER_STATUSES.PENDING) {
        return {
            email,
            interestStatus,
            isEmailVerified,
            isPasswordSet,
            nextStep: ONBOARDING_NEXT_STEPS.PENDING,
        };
    }

    // accepted
    let nextStep: OnboardingNextStep = ONBOARDING_NEXT_STEPS.LOGIN;
    if (!isEmailVerified) {
        nextStep = ONBOARDING_NEXT_STEPS.VERIFY_EMAIL;
    } else if (!isPasswordSet) {
        nextStep = ONBOARDING_NEXT_STEPS.SET_PASSWORD;
    }

    return {
        email,
        interestStatus,
        isEmailVerified,
        isPasswordSet,
        nextStep,
    };
}
