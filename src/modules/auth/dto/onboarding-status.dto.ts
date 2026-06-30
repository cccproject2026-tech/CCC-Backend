import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ONBOARDING_NEXT_STEPS, type OnboardingNextStep } from '../../../common/constants/status.constants';

export class CheckOnboardingStatusDto {
    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class OnboardingStatusResponseDto {
    @ApiProperty()
    email: string;

    @ApiProperty()
    interestStatus: string;

    @ApiProperty({ enum: Object.values(ONBOARDING_NEXT_STEPS), example: ONBOARDING_NEXT_STEPS.LOGIN })
    nextStep: OnboardingNextStep;

    @ApiPropertyOptional()
    isEmailVerified?: boolean;

    @ApiPropertyOptional()
    isPasswordSet?: boolean;
}
