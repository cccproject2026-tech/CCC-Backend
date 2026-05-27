import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../../modules/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { comparePassword } from '../../common/utils/bcrypt.util';
import { OtpService } from './otp.service';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { LoginResponseDto } from './dto/login.dto';
import { OnboardingStatusResponseDto } from './dto/onboarding-status.dto';
import { toUserResponseDto } from '../users/utils/user.mapper';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { Interest, InterestDocument } from '../interests/schemas/interest.schema';
import { buildOnboardingStatusResponse } from './utils/onboarding-status.util';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly otpService: OtpService,
        private readonly configService: ConfigService,
        private readonly googleService: GoogleCalendarService,
        @InjectModel(Interest.name) private readonly interestModel: Model<InterestDocument>,
    ) { }

    private emailFilter(email: string): { email: RegExp } {
        const trimmed = email.trim();
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return { email: new RegExp(`^${escaped}$`, 'i') };
    }

    async checkOnboardingStatus(email: string): Promise<OnboardingStatusResponseDto> {
        const filter = this.emailFilter(email);
        const [user, interest] = await Promise.all([
            this.usersService.findByEmailOptional(filter.email),
            this.interestModel.findOne(filter).select('email status').lean().exec(),
        ]);

        if (!user && !interest) {
            throw new NotFoundException('No application found for this email');
        }

        return buildOnboardingStatusResponse({
            email: (interest?.email || user?.email || email).trim(),
            interestStatus: interest?.status ?? user?.status,
            isEmailVerified: user?.isEmailVerified,
            isPasswordSet: user?.isPasswordSet,
            hasPassword: Boolean(user?.password),
        });
    }

    async login(email: string, password: string): Promise<LoginResponseDto> {
        const user = await this.usersService.findByEmail(email);
        if (!user) throw new UnauthorizedException('Invalid credentials');

        const ok = await comparePassword(password, user.password || '');
        if (!ok) throw new UnauthorizedException('Invalid credentials');

        if (!user.isEmailVerified) {
            throw new BadRequestException('Email not verified');
        }

        const payload = {
            sub: user._id!.toString(),
            email: user.email,
            role: user.role,
        };
        const accessToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get<string>('jwtExpiresIn') || '15m',
        });

        const refreshToken = this.jwtService.sign(
            {
                sub: user._id!.toString(),
                email: user.email,
                role: user.role,
                tokenType: 'refresh',
            },
            { expiresIn: this.configService.get<string>('refreshTokenExpiresIn') || '7d' },
        );

        const refreshHash = await bcrypt.hash(refreshToken, 10);
        await this.usersService.saveRefreshToken(user._id!.toString(), refreshHash);

        const userResponseDto = toUserResponseDto(user);

        return { accessToken, refreshToken, user: userResponseDto };
    }

    async sendOtp(email: string, purpose: string): Promise<{ success: boolean }> {
        await this.otpService.generateAndSendOtp(email, purpose);
        return { success: true };
    }

    async verifyOtp(email: string, otp: string): Promise<{ success: boolean }> {
        const ok = await this.otpService.verifyOtp(email, otp, 'email_verification');
        if (!ok) throw new BadRequestException('OTP invalid or expired');

        const user = await this.usersService.findByEmail(email);
        if (user) {
            await this.usersService.update(user._id!.toString(), { isEmailVerified: true });
        }

        return { success: true };
    }

    async setPassword(email: string, password: string, confirmPassword: string): Promise<{ success: boolean }> {
        if (password !== confirmPassword) throw new BadRequestException('Passwords do not match');
        const user = await this.usersService.findByEmail(email);
        if (!user) throw new BadRequestException('User not found');
        if (!user.isEmailVerified) throw new BadRequestException('Email not verified');

        await this.usersService.update(user._id!.toString(), {
            password,
            isPasswordSet: true,
            passwordCreatedAt: new Date(),
        });
        return { success: true };
    }

    async forgotPassword(email: string): Promise<{ success: boolean }> {
        const user = await this.usersService.findByEmail(email);
        if (!user) throw new BadRequestException('User not found');
        await this.otpService.generateAndSendOtp(email, 'password_reset');
        return { success: true };
    }

    async resetPassword(email: string, otp: string, newPassword: string, confirmPassword: string): Promise<{ success: boolean }> {
        if (newPassword !== confirmPassword) throw new BadRequestException('Passwords do not match');
        const ok = await this.otpService.verifyOtp(email, otp, 'password_reset');
        if (!ok) throw new BadRequestException('OTP invalid or expired');

        const user = await this.usersService.findByEmail(email);
        if (!user) throw new BadRequestException('User not found');

        await this.usersService.update(user._id!.toString(), { password: newPassword });

        return { success: true };
    }

    async refreshToken(refreshToken: string): Promise<LoginResponseDto> {
        try {
            const payload: any = this.jwtService.verify(refreshToken);

            const userEmail = payload.email;
            if (!userEmail) {
                throw new UnauthorizedException('Invalid token structure');
            }

            if (payload.tokenType !== 'refresh') {
                throw new UnauthorizedException('Invalid token type');
            }

            const user = await this.usersService.findByEmail(userEmail);
            if (!user) throw new UnauthorizedException('Invalid token');

            if (!user.refreshToken) throw new UnauthorizedException('Invalid token');
            const valid = await bcrypt.compare(refreshToken, user.refreshToken);
            if (!valid) throw new UnauthorizedException('Invalid token');

            const newAccessPayload = {
                sub: user._id!.toString(),
                email: user.email,
                role: user.role,
            };
            const newAccess = this.jwtService.sign(
                newAccessPayload,
                { expiresIn: this.configService.get<string>('jwtExpiresIn') || '15m' }
            );

            const newRefreshPayload = {
                sub: user._id!.toString(),
                email: user.email,
                role: user.role,
                tokenType: 'refresh',
            };
            const newRefresh = this.jwtService.sign(
                newRefreshPayload,
                { expiresIn: this.configService.get<string>('refreshTokenExpiresIn') || '7d' }
            );

            const newRefreshHash = await bcrypt.hash(newRefresh, 10);
            await this.usersService.saveRefreshToken(user._id!.toString(), newRefreshHash);

            const userResponseDto = toUserResponseDto(user);

            return { accessToken: newAccess, refreshToken: newRefresh, user: userResponseDto };
        } catch (err) {
            throw new UnauthorizedException('Invalid token');
        }
    }

    async logout(userId: string): Promise<{ success: boolean }> {
        await this.usersService.clearRefreshToken(userId);
        return { success: true };
    }

    getGoogleAuthUrl(userId: string): string {
        const state = this.jwtService.sign(
            { sub: userId, googleCalendarOAuth: true },
            { expiresIn: '10m' },
        );
        return this.googleService.getAuthUrl(state);
    }

    /**
     * Validates signed `state` from Google redirect; returns CCC user mongo id (links tokens to this user).
     */
    private recoverUserIdFromGoogleOAuthState(state: string): string {
        if (!state?.trim()) {
            throw new BadRequestException('Missing OAuth state.');
        }
        try {
            const payload = this.jwtService.verify<{ sub?: string; googleCalendarOAuth?: boolean }>(state.trim());
            if (!payload?.sub || payload.googleCalendarOAuth !== true) {
                throw new BadRequestException('Invalid OAuth state payload.');
            }
            return payload.sub;
        } catch (e: unknown) {
            if (e instanceof BadRequestException) throw e;
            throw new BadRequestException(
                'Invalid or expired OAuth state. Open “Link Google Calendar” again from CCC.',
            );
        }
    }

    async handleGoogleCallback(code: string, state: string) {
        const userId = this.recoverUserIdFromGoogleOAuthState(state);
        await this.usersService.findById(userId);
        const tokens = await this.googleService.getTokens(code);
        /** `findById` strips OAuth fields from the payload; must read secrets from DB separately. */
        const existingOAuth = await this.usersService.getGoogleOAuthCalendarCredentials(userId);

        const nextRefreshToken = tokens.refresh_token ?? existingOAuth?.googleRefreshToken;
        await this.usersService.update(userId, {
            googleAccessToken: tokens.access_token ?? undefined,
            ...(nextRefreshToken !== undefined && nextRefreshToken !== null
                ? { googleRefreshToken: nextRefreshToken }
                : {}),
            googleTokenExpiry: tokens.expiry_date ?? undefined,
        });

        return true;
    }
}
