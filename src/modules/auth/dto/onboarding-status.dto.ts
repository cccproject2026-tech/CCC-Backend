import { IsEmail, IsNotEmpty } from 'class-validator';
import { OnboardingNextStep } from '../../../common/constants/status.constants';

export class CheckOnboardingStatusDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class OnboardingStatusResponseDto {
    email: string;
    interestStatus: string;
    nextStep: OnboardingNextStep;
    isEmailVerified?: boolean;
    isPasswordSet?: boolean;
}
