import { Body, Controller, Post, UseGuards, Req, Get, Query } from '@nestjs/common';
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
    constructor(private readonly authService: AuthService) { }

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

    @Get('google')
    getGoogleAuthUrl(@Query('userId') userId: string) {
        if (!userId) {
            throw new Error('userId is required');
        }

        const url = this.authService.getGoogleAuthUrl(userId);
        console.log(url);
        return { url };
    }
    @Get('google/callback')
    async googleCallback(
        @Query('code') code: string,
        @Query('state') userId: string 
    ) {
        await this.authService.handleGoogleCallback(code, userId);

        return { message: 'Google connected successfully' };
    }
}
