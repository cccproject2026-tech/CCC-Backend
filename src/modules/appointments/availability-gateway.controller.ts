import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';

/**
 * Mentor availability merged with Google **Free/Busy** (opaque `{ start, end }` only — never event titles).
 * Omit query `participantUserId` when only the Mentor’s calendar should block slots (e.g. Director → Mentor UX).
 * Hosts still edit weekly windows via `POST/PATCH /appointments/availability/...`.
 */
@ApiTags('Availability')
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
