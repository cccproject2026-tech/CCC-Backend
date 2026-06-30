import { Controller, Get, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';

@ApiTags('Google Calendar')
@Controller('google-calendar')
export class GoogleCalendarController {
    constructor(private readonly googleCalendarService: GoogleCalendarService) {}

    @ApiBearerAuth('access-token')
    @UseGuards(JwtAuthGuard)
    @Get('status')
    async getStatus(@Req() req: Request & { user?: { userId?: string } }) {
        const userId = req.user?.userId;
        if (!userId) {
            throw new BadRequestException('Not authenticated.');
        }
        return this.googleCalendarService.getConnectionStatus(userId);
    }
}
