import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BaseResponse } from '../../shared/interfaces/base-response.interface';
import { MentorReviewCenterResponseDto } from './dto/review-center.dto';
import { MentorService } from './mentor.service';

@Controller('mentor')
export class MentorController {
    constructor(private readonly mentorService: MentorService) {}

    /**
     * Aggregated Mentor Review Center payload.
     * GET /api/v1/mentor/review-center?mentorId=<id>
     *
     * Replaces the legacy per-mentee / per-task / per-assessment client fan-out
     * with a single bulk request.
     */
    @Get('review-center')
    async getReviewCenter(
        @Query('mentorId') mentorId: string,
    ): Promise<BaseResponse<MentorReviewCenterResponseDto>> {
        if (!mentorId) {
            throw new BadRequestException('mentorId query param is required');
        }
        const data = await this.mentorService.getReviewCenter(mentorId);
        return {
            success: true,
            message: 'Mentor review center fetched successfully',
            data,
        };
    }
}
