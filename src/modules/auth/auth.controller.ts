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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
    appendGoogleCalendarOAuthParams,
    isOAuthRedirectTarget,
} from './utils/google-oauth-redirect.util';
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

@ApiTags('Auth')
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

    @ApiBearerAuth('access-token')
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
     *
     * Multi-client return URL:
     * - `platform=web` (default) — `GOOGLE_OAUTH_SUCCESS_REDIRECT`
     * - `platform=mobile` — `GOOGLE_OAUTH_MOBILE_SUCCESS_REDIRECT`
     * - `redirectTo=<url>` — explicit allowlisted return URL (stored in signed `state`)
     */
    @ApiBearerAuth('access-token')
    @UseGuards(JwtAuthGuard)
    @Get('google')
    getGoogleAuthUrl(
        @Req() req: Request & { user?: { userId?: string } },
        @Query('userId') userIdQuery?: string,
        @Query('platform') platform?: string,
        @Query('redirectTo') redirectTo?: string,
    ) {
        const userId = req.user?.userId;
        if (!userId) {
            throw new BadRequestException('Not authenticated.');
        }
        if (userIdQuery && userIdQuery !== userId) {
            throw new ForbiddenException('userId query must match the authenticated user.');
        }

        const url = this.authService.getGoogleAuthUrl(userId, { platform, redirectTo });
        const parsed = new URL(url);
        this.logger.log(
            `OAuth bootstrap: user=${userId}, platform=${platform || 'web'}, redirectTo=${Boolean(redirectTo?.trim())}, redirect_uri=${parsed.searchParams.get('redirect_uri')}, callback=${this.configService.get<string>('GOOGLE_REDIRECT_URI') ?? ''}`,
        );

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
     * then redirects client to URL embedded in signed `state` (web or mobile), falling back
     * to GOOGLE_OAUTH_SUCCESS_REDIRECT with `?googleCalendar=linked`.
     */
    @Get('google/callback')
    async googleOAuthCallback(
        @Req() req: Request,
        @Query('code') code: string | undefined,
        @Query('state') state: string | undefined,
        @Query('error') oauthError: string | undefined,
        @Query('error_description') errorDescription: string | undefined,
        @Res({ passthrough: false }) res: Response,
    ) {
        const envDefaultRedirect = (
            this.configService.get<string>('googleCalendarOAuth.successRedirectUrl') || ''
        ).trim();

        const resolveClientRedirect = (): string => {
            const fromState = state?.trim()
                ? this.authService.resolveOAuthSuccessRedirectFromState(state.trim())
                : null;
            return (fromState || envDefaultRedirect).trim();
        };

        this.logger.log(
            `OAuth callback hit: request_url=${req.originalUrl}, callback_env=${this.configService.get<string>('GOOGLE_REDIRECT_URI') ?? ''}`,
        );

        const redirectWithCalendarParams = (
            base: string,
            params: Record<string, string>,
        ): string => appendGoogleCalendarOAuthParams(base, params);

        const baseRedirectRaw = resolveClientRedirect();

        if (!baseRedirectRaw) {
            this.logger.error(
                'GOOGLE_OAUTH_SUCCESS_REDIRECT / FRONTEND_SUCCESS_REDIRECT is not set — cannot redirect client after OAuth.',
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

        if (!isOAuthRedirectTarget(baseRedirectRaw)) {
            return res
                .status(500)
                .send(
                    'OAuth success redirect must be an absolute http(s) URL or an allowed app deep link (e.g. cccpastormentor://oauth/google-calendar).',
                );
        }

        try {
            if (oauthError) {
                const reason = (errorDescription || oauthError).slice(0, 400);
                return res.redirect(
                    redirectWithCalendarParams(baseRedirectRaw, {
                        googleCalendar: 'error',
                        reason,
                    }),
                );
            }

            if (!code?.trim() || !state?.trim()) {
                return res.redirect(
                    redirectWithCalendarParams(baseRedirectRaw, {
                        googleCalendar: 'error',
                        reason: 'missing_code_or_state',
                    }),
                );
            }

            await this.authService.handleGoogleCallback(code.trim(), state.trim());

            return res.redirect(
                redirectWithCalendarParams(baseRedirectRaw, {
                    googleCalendar: 'linked',
                }),
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'oauth_callback_failed';
            this.logger.warn(`Google OAuth callback: ${msg}`);
            return res.redirect(
                redirectWithCalendarParams(baseRedirectRaw, {
                    googleCalendar: 'error',
                    reason: msg.slice(0, 240),
                }),
            );
        }
    }
}
