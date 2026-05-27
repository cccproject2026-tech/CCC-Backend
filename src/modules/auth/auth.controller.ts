import {
    Body,
    Controller,
    Post,
    UseGuards,
    Req,
    Get,
    Query,
    ForbiddenException,
    BadRequestException,
    Logger,
    Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import {
    SetPasswordDto,
    ForgotPasswordDto,
    ResetPasswordDto,
} from './dto/password.dto';
import { RefreshTokenDto } from './dto/token.dto';
import {
    CheckOnboardingStatusDto,
    OnboardingStatusResponseDto,
} from './dto/onboarding-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
    ) { }

    @Post('check-onboarding-status')
    async checkOnboardingStatus(
        @Body() dto: CheckOnboardingStatusDto,
    ): Promise<BaseResponse<OnboardingStatusResponseDto>> {
        const data = await this.authService.checkOnboardingStatus(dto.email);
        return {
            success: true,
            message: 'Onboarding status retrieved successfully',
            data,
        };
    }

    @Post('login')
    async login(@Body() dto: LoginDto): Promise<BaseResponse<LoginResponseDto>> {
        const { email, password } = dto;
        const loginDetails = await this.authService.login(email, password);
        return {
            success: true,
            message: 'Login successful',
            data: loginDetails,
        };
    }

    @Post('send-otp')
    async sendOtp(@Body() dto: SendOtpDto): Promise<BaseResponse<null>> {
        await this.authService.sendOtp(dto.email, dto.purpose);
        return {
            success: true,
            message: 'OTP sent successfully',
            data: null,
        };
    }

    @Post('verify-otp')
    async verifyOtp(@Body() dto: VerifyOtpDto): Promise<BaseResponse<null>> {
        await this.authService.verifyOtp(dto.email, dto.otp);
        return {
            success: true,
            message: 'OTP verified successfully',
            data: null,
        };
    }

    @Post('set-password')
    async setPassword(@Body() dto: SetPasswordDto): Promise<BaseResponse<null>> {
        await this.authService.setPassword(
            dto.email,
            dto.password,
            dto.confirmPassword,
        );
        return {
            success: true,
            message: 'Password set successfully',
            data: null,
        };
    }

    @Post('forgot-password')
    async forgotPassword(
        @Body() dto: ForgotPasswordDto,
    ): Promise<BaseResponse<null>> {
        await this.authService.forgotPassword(dto.email);
        return {
            success: true,
            message: 'Password reset OTP sent successfully',
            data: null,
        };
    }

    @Post('reset-password')
    async resetPassword(
        @Body() dto: ResetPasswordDto,
    ): Promise<BaseResponse<null>> {
        await this.authService.resetPassword(
            dto.email,
            dto.otp,
            dto.newPassword,
            dto.confirmPassword,
        );
        return {
            success: true,
            message: 'Password reset successfully',
            data: null,
        };
    }

    @Post('refresh-token')
    async refresh(
        @Body() dto: RefreshTokenDto,
    ): Promise<BaseResponse<LoginResponseDto>> {
        const tokens = await this.authService.refreshToken(dto.refreshToken);
        return {
            success: true,
            message: 'Token refreshed successfully',
            data: tokens,
        };
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    async logout(@Req() req: any): Promise<BaseResponse<null>> {
        const user = req.user;
        await this.authService.logout(user.userId);
        return {
            success: true,
            message: 'Logged out successfully',
            data: null,
        };
    }

    /**
     * Builds Google authorize URL (`access_type=offline`, `prompt=consent`).
     * Call with **Bearer JWT**; optional `userId` query must match the authenticated user.
     */
    @UseGuards(JwtAuthGuard)
    @Get('google')
    getGoogleAuthUrl(
        @Req() req: { user?: { userId?: string } },
        @Query('userId') userIdQuery?: string,
    ) {
        const userId = req.user?.userId;
        if (!userId) {
            throw new BadRequestException('Not authenticated.');
        }
        if (userIdQuery && userIdQuery !== userId) {
            throw new ForbiddenException('userId query must match the authenticated user.');
        }

        const url = this.authService.getGoogleAuthUrl(userId);

        return {
            success: true,
            message:
                'Redirect the browser to url to finish Google consent. redirect_uri must match GOOGLE_REDIRECT_URI and GCP.',
            data: { url },
            url,
        };
    }

    /**
     * OAuth redirect target (PUBLIC). Validates `state`, exchanges code, persists tokens,
     * then redirects SPA to GOOGLE_OAUTH_SUCCESS_REDIRECT with `?googleCalendar=linked`.
     */
    @Get('google/callback')
    async googleOAuthCallback(
        @Query('code') code: string | undefined,
        @Query('state') state: string | undefined,
        @Query('error') oauthError: string | undefined,
        @Query('error_description') errorDescription: string | undefined,
        @Res({ passthrough: false }) res: Response,
    ) {
        const baseRedirectRaw = (
            this.configService.get<string>('googleCalendarOAuth.successRedirectUrl') || ''
        ).trim();

        const withCalendarParams = (base: string, params: Record<string, string>): string => {
            const u = new URL(base);
            for (const [k, v] of Object.entries(params)) {
                u.searchParams.set(k, v);
            }
            return u.toString();
        };

        if (!baseRedirectRaw) {
            this.logger.error(
                'GOOGLE_OAUTH_SUCCESS_REDIRECT / FRONTEND_SUCCESS_REDIRECT is not set — cannot redirect SPA after OAuth.',
            );
            try {
                if (oauthError) {
                    const reason = String(errorDescription || oauthError || 'access_denied');
                    return res.status(400).type('html').send(`<p>Google OAuth error: ${reason}</p>`);
                }
                if (!code?.trim() || !state?.trim()) {
                    return res.status(400).type('html').send('<p>Missing authorization code or state.</p>');
                }
                await this.authService.handleGoogleCallback(code.trim(), state.trim());
                return res.status(200).type('html').send(
                    '<p>Google Calendar linked successfully.</p><p>Set GOOGLE_OAUTH_SUCCESS_REDIRECT in the API env to redirect users back to CCC.</p>',
                );
            } catch (e: unknown) {
                const m = e instanceof Error ? e.message : 'calendar_link_failed';
                return res.status(400).type('html').send(`<p>${m}</p>`);
            }
        }

        if (!/^https?:\/\//i.test(baseRedirectRaw)) {
            return res
                .status(500)
                .send(
                    'GOOGLE_OAUTH_SUCCESS_REDIRECT must be an absolute URL (e.g. https://app.example.com/mentor/schedule)',
                );
        }

        try {
            if (oauthError) {
                const reason = (errorDescription || oauthError).slice(0, 400);
                return res.redirect(
                    withCalendarParams(baseRedirectRaw, {
                        googleCalendar: 'error',
                        reason,
                    }),
                );
            }

            if (!code?.trim() || !state?.trim()) {
                return res.redirect(
                    withCalendarParams(baseRedirectRaw, {
                        googleCalendar: 'error',
                        reason: 'missing_code_or_state',
                    }),
                );
            }

            await this.authService.handleGoogleCallback(code.trim(), state.trim());

            return res.redirect(
                withCalendarParams(baseRedirectRaw, {
                    googleCalendar: 'linked',
                }),
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'oauth_callback_failed';
            this.logger.warn(`Google OAuth callback: ${msg}`);
            return res.redirect(
                withCalendarParams(baseRedirectRaw, {
                    googleCalendar: 'error',
                    reason: msg.slice(0, 240),
                }),
            );
        }
    }
}
