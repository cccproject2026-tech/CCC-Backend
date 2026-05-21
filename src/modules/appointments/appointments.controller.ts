import { Controller, Post, Body, Get, Param, Patch, Query, HttpCode, Headers, Logger, Req, BadRequestException, Delete } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, AppointmentResponseDto, UpdateAppointmentDto, CancelAppointmentDto, TranscriptSummaryResponseDto } from './dto/appointment.dto';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
    AvailabilityDto,
    CreateRecurringAvailabilityDto,
    DeleteAvailabilitySlotDto,
    MentorAvailabilityDayDto,
    OpenMentorDayDto,
    UpdateMentorAvailabilitySettingsDto,
    UpsertSingleDayAvailabilityDto,
} from './dto/availability.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';

@Controller('appointments')
export class AppointmentsController {
    private readonly logger = new Logger(AppointmentsController.name);

    constructor(
        private readonly appointmentsService: AppointmentsService,
        private readonly configService: ConfigService,
    ) { }

    @Post()
    async create(@Body() dto: CreateAppointmentDto): Promise<BaseResponse<AppointmentResponseDto>> {
        const data = await this.appointmentsService.create(dto);
        return {
            success: true,
            message: 'Appointment scheduled successfully.',
            data,
        };
    }

    @Get('upcoming')
    async getAllUpcomingAppointments(
        @Query('userId') userId?: string,
        @Query('mentorId') mentorId?: string,
        @Query('status') status?: string,
        @Query('futureOnly') futureOnly?: string,
    ): Promise<BaseResponse<AppointmentResponseDto[]>> {
        const data = await this.appointmentsService.getAppointments({
            userId,
            mentorId,
            status: status || 'scheduled',
            futureOnly: futureOnly !== 'false',
        });
        return {
            success: true,
            message: 'Appointments fetched successfully.',
            data,
        };
    }

    @Get('user/:userId')
    async getUserSchedule(
        @Param('userId') userId: string,
        @Query('futureOnly') futureOnly: string = 'true'
    ): Promise<BaseResponse<AppointmentResponseDto[]>> {
        const data = await this.appointmentsService.getSchedule(
            userId,
            'user',
            futureOnly === 'true'
        );
        return {
            success: true,
            message: `Schedule fetched for user ${userId}.`,
            data,
        };
    }

    @Get('mentor/:userId')
    async getMentorSchedule(
        @Param('userId') userId: string,
        @Query('futureOnly') futureOnly: string = 'true'
    ): Promise<BaseResponse<AppointmentResponseDto[]>> {
        const data = await this.appointmentsService.getSchedule(
            userId,
            'mentor',
            futureOnly === 'true'
        );
        return {
            success: true,
            message: `Schedule fetched for mentor ${userId}.`,
            data,
        };
    }

    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateAppointmentDto
    ): Promise<BaseResponse<AppointmentResponseDto>> {
        const data = await this.appointmentsService.update(id, dto);
        return {
            success: true,
            message: 'Appointment updated successfully.',
            data,
        };
    }

    @Post('availability/recurring')
    async createRecurringAvailability(
        @Body() dto: CreateRecurringAvailabilityDto,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.appointmentsService.createRecurringWeeklyAvailability(dto);
        return {
            success: true,
            message: 'Recurring weekly availability saved and materialized for the configured horizon.',
            data,
        };
    }

    @Patch('availability/:mentorId/day')
    async upsertSingleDayAvailability(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
        @Body() dto: UpsertSingleDayAvailabilityDto,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.appointmentsService.upsertSingleDayAvailability(mentorId, dto);
        return {
            success: true,
            message: 'Single-day availability updated.',
            data,
        };
    }

    @Delete('availability/:mentorId/day/:date')
    async deleteSingleDayAvailability(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
        @Param('date') date: string,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.appointmentsService.deleteSingleDayAvailability(mentorId, date);
        return {
            success: true,
            message: 'Availability removed for the selected date.',
            data,
        };
    }

    @Post('availability')
    async upsertAvailability(@Body() dto: AvailabilityDto): Promise<BaseResponse<unknown>> {
        const data = await this.appointmentsService.upsertAvailability(dto);
        return {
            success: true,
            message: 'Weekly availability updated.',
            data,
        };
    }

    @Delete('availability/:mentorId/slot')
    async deleteAvailabilitySlot(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
        @Body() dto: DeleteAvailabilitySlotDto,
    ): Promise<BaseResponse<any>> {
        const data = await this.appointmentsService.deleteAvailabilitySlot(mentorId, dto);
        return {
            success: true,
            message: 'Availability slot deleted successfully.',
            data,
        };
    }

    @Post('availability/:mentorId/day/unavailable')
    async markMentorDayUnavailable(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
        @Body() dto: MentorAvailabilityDayDto,
    ): Promise<BaseResponse<any>> {
        const data = await this.appointmentsService.markMentorDayUnavailable(mentorId, dto);
        return {
            success: true,
            message: 'Day marked unavailable.',
            data,
        };
    }

    @Post('availability/:mentorId/day/available')
    async openMentorUnavailableDay(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
        @Body() dto: OpenMentorDayDto,
    ): Promise<BaseResponse<any>> {
        const data = await this.appointmentsService.openMentorUnavailableDay(mentorId, dto);
        return {
            success: true,
            message: 'Day reopened with specified availability.',
            data,
        };
    }

    @Patch('availability/:mentorId/settings')
    async updateMentorAvailabilitySettings(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
        @Body() dto: UpdateMentorAvailabilitySettingsDto,
    ): Promise<BaseResponse<any>> {
        const data = await this.appointmentsService.updateMentorAvailabilitySettings(mentorId, dto);
        return {
            success: true,
            message: 'Availability settings updated.',
            data,
        };
    }

    @Get('availability/:mentorId')
    async getMentorAvailability(@Param('mentorId') mentorId: string) {
        const data = await this.appointmentsService.getMentorAvailability(mentorId);
        return {
            success: true,
            message: "Weekly availability fetched.",
            data
        };
    }

    @Get('availability/:mentorId/month')
    async getMonthly(
        @Param('mentorId') mentorId: string,
        @Query('year') year: string,
        @Query('month') month: string,
        @Query('participantUserId') participantUserId?: string,
    ) {
        const y = Number(year);
        const m = Number(month) - 1;

        const data = await this.appointmentsService.getMonthlyAvailability(mentorId, y, m, participantUserId);

        return {
            success: true,
            message: "Monthly availability generated.",
            data
        };
    }

    @Get('availability/:mentorId/week')
    async getWeeklyAvailability(
        @Param('mentorId') mentorId: string,
        @Query('date') date: string,
        @Query('participantUserId') participantUserId?: string,
    ): Promise<BaseResponse<any>> {
        if (!date) {
            throw new BadRequestException('date query param is required');
        }

        const data =
            await this.appointmentsService.getWeeklyAvailabilityByDate(
                mentorId,
                date,
                participantUserId,
            );

        return {
            success: true,
            message: 'Weekly availability fetched successfully.',
            data,
        };
    }

    @Patch(':id/reschedule')
    async reschedule(
        @Param('id') id: string,
        @Body() dto: { newDate: string, startTime: string, startPeriod: 'AM' | 'PM' }
    ) {
        const data = await this.appointmentsService.reschedule(id, dto);
        return { success: true, message: 'Appointment rescheduled', data };
    }

    @Patch(':id/cancel')
    async cancel(
        @Param('id') id: string,
        @Body() body: CancelAppointmentDto
    ) {
        const result = await this.appointmentsService.cancel(id, { reason: body.reason });
        return { success: true, data: result };
    }

    @Get('pastor/:id/transcript-summary')
    async getTranscriptSummary(
        @Param('id') id: string
    ): Promise<BaseResponse<TranscriptSummaryResponseDto>> {
        const data = await this.appointmentsService.getTranscriptSummary(id);
        return {
            success: true,
            message: 'Transcript summary fetched successfully.',
            data,
        };
    }

    @Post('pastor/:id/transcript-summary')
    async generateTranscriptSummary(
        @Param('id') id: string,
        @Query('refresh') refresh?: string,
    ): Promise<BaseResponse<TranscriptSummaryResponseDto>> {
        const data = await this.appointmentsService.generateTranscriptSummary(id, refresh === 'true');
        return {
            success: true,
            message: data.cached ? 'Transcript summary fetched from cache.' : 'Transcript summary generated successfully.',
            data,
        };
    }

    @Post('zoom-webhook')
    @HttpCode(200)
    async zoomWebhook(
        @Req() req: any,
        @Body() body: any,
        @Headers('x-zm-request-timestamp') timestamp: string,
        @Headers('x-zm-signature') signature: string,
    ) {
        if (body?.event === 'endpoint.url_validation') {
            const plainToken = body?.payload?.plainToken;
            const secret = this.configService.get<string>('ZOOM_WEBHOOK_SECRET_TOKEN') ?? '';
            const encryptedToken = createHmac('sha256', secret)
                .update(plainToken)
                .digest('hex');
            return { plainToken, encryptedToken };
        }

        const secret = this.configService.get<string>('ZOOM_WEBHOOK_SECRET_TOKEN');
        if (secret) {
            const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
            const message = `v0:${timestamp}:${rawBody}`;
            const expected = 'v0=' + createHmac('sha256', secret).update(message).digest('hex');
            if (signature !== expected) {
                this.logger.warn('Zoom webhook: invalid signature — request ignored');
                return { success: false, message: 'Invalid signature' };
            }
        }

        await this.appointmentsService.handleZoomWebhook(body);
        return { success: true };
    }
}