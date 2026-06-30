import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MentoringSessionsService } from './mentoring-sessions.service';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import {
    MentorRescheduleDto,
    MentorSessionActionDto,
    PastorRescheduleRequestDto,
} from './dto/mentoring-sessions.dto';

@ApiTags('Mentoring Sessions')
@Controller('mentoring-sessions')
export class MentoringSessionsController {
    constructor(private readonly mentoringSessionsService: MentoringSessionsService) {}

    @Get('pastor/:pastorId')
    async listPastorSessions(
        @Param('pastorId', ParseMongoIdPipe) pastorId: string,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.listPastorSessions(pastorId);
        return { success: true, message: "Pastor's mentoring sessions (10-slot journey)", data };
    }

    @Get('mentor/:mentorId/grouped')
    async mentorGrouped(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.listMentorGrouped(mentorId);
        return { success: true, message: 'Assigned pastors with session journeys', data };
    }

    @Get('mentor/:mentorId/reschedule-requests')
    async mentorRescheduleQueue(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.listRescheduleRequestsForMentor(mentorId);
        return { success: true, message: 'Pending pastor reschedule requests', data };
    }

    /**
     * One row per pastor: summary fields + full unified session on `nextSession` only
     * (no full 10-slot arrays on this endpoint).
     */
    @Get('director/journeys')
    async directorJourneys(): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.listDirectorJourneys();
        return { success: true, message: 'Pastor journeys (director roster)', data };
    }

    /**
     * `sessionId` = mentoring **appointment** Mongo `_id` (extras `data.appointmentId`).
     * Response matches the unified mentoring session object (same shape as pastor/mentor list rows).
     */
    @Get(':sessionId')
    async sessionDetail(
        @Param('sessionId', ParseMongoIdPipe) sessionId: string,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.getSessionDetail(sessionId);
        return { success: true, message: 'Mentoring session detail', data };
    }

    /**
     * Pastor asks the mentor to pick a new time (`sessionId` = appointment `_id`).
     * Allowed while the session is `scheduled`, `in-progress`, `postponed`, or `missed` (one pending request per appointment).
     */
    @Post(':sessionId/reschedule-request')
    async pastorRequestReschedule(
        @Param('sessionId', ParseMongoIdPipe) sessionId: string,
        @Body() dto: PastorRescheduleRequestDto,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.createRescheduleRequest(
            sessionId,
            dto.pastorId,
            dto.reason,
        );
        return { success: true, message: 'Reschedule request recorded', data };
    }

    @Patch(':sessionId/reschedule')
    async mentorReschedule(
        @Param('sessionId', ParseMongoIdPipe) sessionId: string,
        @Body() dto: MentorRescheduleDto,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.mentorRescheduleSession(
            sessionId,
            dto.mentorId,
            dto.newMeetingDate,
        );
        return {
            success: true,
            message:
                'Session rescheduled; all later unlocked mentoring sessions shifted forward by 30 days.',
            data,
        };
    }

    @Patch(':sessionId/complete')
    async mentorComplete(
        @Param('sessionId', ParseMongoIdPipe) sessionId: string,
        @Body() dto: MentorSessionActionDto,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.mentorComplete(sessionId, dto.mentorId);
        return { success: true, message: 'Session marked complete', data };
    }

    @Patch(':sessionId/cancel')
    async mentorCancel(
        @Param('sessionId', ParseMongoIdPipe) sessionId: string,
        @Body() dto: MentorSessionActionDto,
    ): Promise<BaseResponse<unknown>> {
        const data = await this.mentoringSessionsService.mentorCancel(
            sessionId,
            dto.mentorId,
            dto.reason,
        );
        return { success: true, message: 'Session cancelled', data };
    }
}
