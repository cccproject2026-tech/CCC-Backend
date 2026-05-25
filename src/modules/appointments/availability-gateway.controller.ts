import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';

/**
 * Thin REST alias for availability + Google Calendar busy data (global prefix e.g. `/api/v1`).
 * Mentors/directors still manage windows under `POST/PATCH /appointments/availability/...`.
 */
@Controller('availability')
export class AvailabilityGatewayController {
    constructor(private readonly appointmentsService: AppointmentsService) {}

    @Get(':userId')
    async getMergedAvailability(
        @Param('userId', ParseMongoIdPipe) userId: string,
        @Query('participantUserId') participantUserId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.appointmentsService.getAvailabilityWithGoogleSummary(userId, {
            participantUserId,
            from,
            to,
        });
        return {
            success: true,
            message: 'CCC availability with Google Calendar busy intervals',
            data,
        };
    }
}
