import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    Patch,
    Delete,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    // UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { RoadMapsService } from './roadmaps.service';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { RoadMapResponseDto, CreateRoadMapDto, UpdateRoadMapDto, UpdateNestedRoadMapItemDto, NestedRoadMapItemDto, ReorderRoadmapsDto } from './dto/roadmap.dto';
import {
    RemoveRoadmapAssignmentsDto,
    RoadmapAssignmentResponseDto,
    RemoveRoadmapAssignmentsResponseDto,
} from './dto/roadmap-assignments.dto';
import { AddCommentDto, CommentsThreadResponseDto } from './dto/comments.dto';
import {
    CreateQueryDto,
    QueriesThreadResponseDto,
    ReplyQueryDto,
    UpdateQueryDto,
} from './dto/queries.dto';
import {
    CreateExtrasDto,
    UpdateExtrasDto,
    ExtrasResponseDto,
    ExtrasDocumentDto,
    RoadmapSubmissionActivityDto,
} from './dto/extras.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { Roles } from '../../common/decorators/roles.decorator';
// import { ROLES } from '../../common/constants/roles.constants';

@Controller('roadmaps')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class RoadMapsController {
    constructor(private readonly roadMapsService: RoadMapsService) { }

    @Post()
    @UseInterceptors(FileInterceptor('image'))
    // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
    async createRoadMap(
        @Body() dto: CreateRoadMapDto,
        @UploadedFile() image?: Express.Multer.File,
    ): Promise<BaseResponse<RoadMapResponseDto>> {
        const roadmap = await this.roadMapsService.create(dto, image);
        return {
            success: true,
            message: 'RoadMap created successfully',
            data: roadmap,
        };
    }

    @Get()
    async getAllRoadmaps(
        @Query('status') status: string = 'all',
        @Query('search') search: string = '',
    ): Promise<BaseResponse<RoadMapResponseDto[]>> {
        const roadmaps = await this.roadMapsService.findAll(status, search);
        return {
            success: true,
            message: 'RoadMaps fetched successfully',
            data: roadmaps,
        };
    }

    @Patch('reorder')
    async reorderRoadmaps(
        @Body() dto: ReorderRoadmapsDto,
    ): Promise<BaseResponse<{ updatedCount: number }>> {
        const data = await this.roadMapsService.reorderRoadmaps(dto.orderedRoadmapIds);
        return {
            success: true,
            message: 'Roadmap library order saved successfully.',
            data,
        };
    }

    @Get('user/:userId')
    async getUserRoadmaps(@Param('userId') userId: string) {
        return this.roadMapsService.getUserRoadmaps(userId);
    }

    @Get('mentor/:mentorId/resubmitted')
    async getResubmittedExtrasForMentor(
        @Param('mentorId', ParseMongoIdPipe) mentorId: string,
    ): Promise<BaseResponse<ExtrasResponseDto[]>> {
        const extras = await this.roadMapsService.getResubmittedExtrasForMentor(mentorId);
        return {
            success: true,
            message: extras.length > 0
                ? 'Resubmitted extras fetched successfully'
                : 'No resubmitted extras found',
            data: extras,
        };
    }

    @Get('submissions/activity')
    async getSubmissionActivity(
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('from') from: string,
        @Query('to') to: string,
    ): Promise<BaseResponse<RoadmapSubmissionActivityDto[]>> {
        const data = await this.roadMapsService.getSubmissionActivity(userId, from, to);
        return {
            success: true,
            message: data.length > 0
                ? 'Roadmap submission activity fetched successfully'
                : 'No roadmap submission activity found for this date range',
            data,
        };
    }

    // @Get(':id/details')
    // async getRoadMapDetails(@Param('id') id: string): Promise<BaseResponse<any>> {

    //     const result = await this.roadMapsService.getRoadMap(id);
    //     return {
    //         success: true,
    //         message: 'RoadMap details and comments fetched successfully',
    //         data: result,
    //     };
    // }

    @Get(':roadMapId/nested/:nestedItemId')
    async getNestedRoadMapItem(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('nestedItemId', ParseMongoIdPipe) nestedItemId: string,
    ): Promise<BaseResponse<any>> {
        const item = await this.roadMapsService.findNestedItemById(roadMapId, nestedItemId);
        return {
            success: true,
            message: 'Nested roadmap item fetched successfully',
            data: item,
        };
    }

    @Get(':roadMapId/assignments')
    async getRoadmapAssignments(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
    ): Promise<BaseResponse<RoadmapAssignmentResponseDto[]>> {
        const assignments = await this.roadMapsService.getRoadmapAssignments(roadMapId);
        return {
            success: true,
            message: assignments.length > 0
                ? 'Roadmap assignments fetched successfully'
                : 'No users are assigned to this roadmap',
            data: assignments,
        };
    }

    @Delete(':roadMapId/assignments')
    async removeRoadmapAssignments(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Body() dto: RemoveRoadmapAssignmentsDto,
    ): Promise<BaseResponse<RemoveRoadmapAssignmentsResponseDto>> {
        const result = await this.roadMapsService.removeRoadmapAssignments(roadMapId, dto.userIds);
        return {
            success: true,
            message: result.removedUserIds.length > 0
                ? `Removed roadmap assignment for ${result.removedUserIds.length} user(s)`
                : 'No matching roadmap assignments found for the selected users',
            data: result,
        };
    }

    @Get(':id')
    async getRoadMapById(
        @Param('id', ParseMongoIdPipe) id: string,
    ): Promise<BaseResponse<RoadMapResponseDto>> {
        const roadmap = await this.roadMapsService.findById(id);
        return {
            success: true,
            message: 'RoadMap fetched successfully',
            data: roadmap,
        };
    }

    @Patch(':id')
    @UseInterceptors(FileInterceptor('image'))
    // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
    async updateRoadMap(
        @Param('id', ParseMongoIdPipe) id: string,
        @Body() dto: UpdateRoadMapDto,
        @UploadedFile() image?: Express.Multer.File,
    ): Promise<BaseResponse<RoadMapResponseDto>> {
        const roadmap = await this.roadMapsService.update(id, dto, image);
        return {
            success: true,
            message: 'RoadMap updated successfully',
            data: roadmap,
        };
    }

    @Delete(':id')
    // @Roles(ROLES.DIRECTOR)
    async deleteRoadMap(
        @Param('id', ParseMongoIdPipe) id: string,
    ): Promise<BaseResponse<{ _id: string }>> {
        const result = await this.roadMapsService.delete(id);
        return {
            success: true,
            message: 'RoadMap deleted successfully',
            data: result,
        };
    }

    @Patch(':roadMapId/nested/:nestedItemId')
    @UseInterceptors(FileInterceptor('image'))
    // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
    async updateNestedRoadMapItem(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('nestedItemId', ParseMongoIdPipe) nestedItemId: string,
        @Body() dto: UpdateNestedRoadMapItemDto,
        @UploadedFile() image?: Express.Multer.File,
    ): Promise<BaseResponse<RoadMapResponseDto>> {
        const roadmap = await this.roadMapsService.updateNestedRoadMapItem(
            roadMapId,
            nestedItemId,
            dto,
            image,
        );
        return {
            success: true,
            message: 'Nested roadmap item updated successfully',
            data: roadmap,
        };
    }

    @Post(':roadMapId/nested')
    @UseInterceptors(FileInterceptor('image'))
    // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
    async addNestedRoadMap(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Body() dto: NestedRoadMapItemDto,
        @UploadedFile() image?: Express.Multer.File,
    ): Promise<BaseResponse<RoadMapResponseDto>> {
        const roadmap = await this.roadMapsService.addNestedRoadMap(roadMapId, dto, image);
        return {
            success: true,
            message: 'Nested RoadMap item added successfully',
            data: roadmap,
        };
    }

    @Post(':roadMapId/comments')
    async addComment(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Body() dto: AddCommentDto,
    ): Promise<BaseResponse<CommentsThreadResponseDto>> {
        const thread = await this.roadMapsService.addComment(roadMapId, dto);
        return {
            success: true,
            message: 'Comment added successfully',
            data: thread,
        };
    }

    @Get(':roadMapId/comments')
    async getCommentThread(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
        @Query('taskId') taskId?: string,
    ): Promise<BaseResponse<CommentsThreadResponseDto>> {
        const thread = await this.roadMapsService.getCommentThread(
            roadMapId,
            userId,
            nestedRoadMapItemId ?? taskId,
        );
        return {
            success: true,
            message: 'Comment thread fetched successfully',
            data: thread,
        };
    }

    /** Path alias identical to POST `:roadMapId/queries` (helps clients that nest under `/pastor/`). */
    @Post('pastor/:roadMapId/queries')
    async addQueryPastorPath(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Body() dto: CreateQueryDto,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.addQuery(roadMapId, dto);
        return {
            success: true,
            message: 'Query added and thread updated successfully',
            data: thread,
        };
    }

    @Post(':roadMapId/queries')
    async addQuery(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Body() dto: CreateQueryDto,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.addQuery(roadMapId, dto);
        return {
            success: true,
            message: 'Query added and thread updated successfully',
            data: thread,
        };
    }

    @Get('pastor/:roadMapId/queries')
    async getAllQueryThreadsPastorPath(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('status') status?: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<QueriesThreadResponseDto[]>> {
        const threads = await this.roadMapsService.getAllQueryThreads(
            roadMapId,
            userId,
            status,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'Query threads fetched successfully',
            data: threads,
        };
    }

    @Get(':roadMapId/queries')
    async getAllQueryThreads(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('status') status?: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<QueriesThreadResponseDto[]>> {
        const threads = await this.roadMapsService.getAllQueryThreads(
            roadMapId,
            userId,
            status,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'Query threads fetched successfully',
            data: threads,
        };
    }

    @Patch('pastor/:roadMapId/queries/:queryItemId/reply')
    async replyQueryPastorPath(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('queryItemId', ParseMongoIdPipe) queryItemId: string,
        @Body() dto: ReplyQueryDto,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.replyQuery(roadMapId, queryItemId, dto);
        return {
            success: true,
            message: 'Query replied successfully',
            data: thread,
        };
    }

    @Patch(':roadMapId/queries/:queryItemId/reply')
    async replyQuery(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('queryItemId', ParseMongoIdPipe) queryItemId: string,
        @Body() dto: ReplyQueryDto,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.replyQuery(
            roadMapId,
            queryItemId,
            dto,
        );
        return {
            success: true,
            message: 'Query replied successfully',
            data: thread,
        };
    }

    @Patch('pastor/:roadMapId/queries/:queryItemId')
    async updateQueryPastorPath(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('queryItemId', ParseMongoIdPipe) queryItemId: string,
        @Body() dto: UpdateQueryDto,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.updateQuery(roadMapId, queryItemId, dto);
        return {
            success: true,
            message: 'Query updated successfully',
            data: thread,
        };
    }

    @Patch(':roadMapId/queries/:queryItemId')
    async updateQuery(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('queryItemId', ParseMongoIdPipe) queryItemId: string,
        @Body() dto: UpdateQueryDto,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.updateQuery(roadMapId, queryItemId, dto);
        return {
            success: true,
            message: 'Query updated successfully',
            data: thread,
        };
    }

    @Delete('pastor/:roadMapId/queries/:queryItemId')
    async deleteQueryPastorPath(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('queryItemId', ParseMongoIdPipe) queryItemId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.deleteQuery(roadMapId, queryItemId, userId);
        return {
            success: true,
            message: 'Query deleted successfully',
            data: thread,
        };
    }

    @Delete(':roadMapId/queries/:queryItemId')
    async deleteQuery(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Param('queryItemId', ParseMongoIdPipe) queryItemId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
    ): Promise<BaseResponse<QueriesThreadResponseDto>> {
        const thread = await this.roadMapsService.deleteQuery(roadMapId, queryItemId, userId);
        return {
            success: true,
            message: 'Query deleted successfully',
            data: thread,
        };
    }

    @Get(':roadMapId/extras')
    async getExtras(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<ExtrasResponseDto | null>> {
        const extras = await this.roadMapsService.getExtras(
            roadMapId,
            userId,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: extras ? 'Extras fetched successfully' : 'No extras found',
            data: extras,
        };
    }

    @Post(':roadMapId/extras')
    async saveExtras(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Body() dto: CreateExtrasDto,
    ): Promise<BaseResponse<ExtrasResponseDto>> {
        const extras = await this.roadMapsService.saveExtras(roadMapId, dto);
        return {
            success: true,
            message: 'Extras saved successfully',
            data: extras,
        };
    }

    @Patch(':roadMapId/extras')
    async updateExtras(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId: string | undefined,
        @Body() dto: UpdateExtrasDto,
    ): Promise<BaseResponse<ExtrasResponseDto>> {
        const extras = await this.roadMapsService.updateExtras(
            roadMapId,
            userId,
            dto,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'Extras updated successfully',
            data: extras,
        };
    }

    @Delete(':roadMapId/extras')
    async deleteExtras(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<{ message: string }>> {
        const result = await this.roadMapsService.deleteExtras(
            roadMapId,
            userId,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'Extras deleted successfully',
            data: result,
        };
    }

    @Post(':roadMapId/extras/documents')
    @UseInterceptors(FilesInterceptor('files', 10)) // Support up to 10 files
    async uploadExtrasDocument(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('nestedRoadMapItemId', ParseMongoIdPipe) nestedRoadMapItemId: string | undefined,
        @Query('name') name: string | undefined,
        @UploadedFiles() files: Express.Multer.File[],
    ): Promise<BaseResponse<ExtrasDocumentDto>> {
        const document = await this.roadMapsService.uploadExtrasDocuments(
            roadMapId,
            userId,
            files,
            nestedRoadMapItemId,
            name,
        );
        return {
            success: true,
            message: files.length > 1 ? 'Documents uploaded successfully' : 'Document uploaded successfully',
            data: document,
        };
    }

    @Get(':roadMapId/extras/documents')
    async getExtrasDocuments(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<ExtrasDocumentDto[]>> {
        const documents = await this.roadMapsService.getExtrasDocuments(
            roadMapId,
            userId,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'Documents fetched successfully',
            data: documents,
        };
    }

    @Delete(':roadMapId/extras/documents')
    async deleteExtrasDocument(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('uploadBatchId') uploadBatchId: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<{ message: string }>> {
        const result = await this.roadMapsService.deleteExtrasDocumentBatch(
            roadMapId,
            userId,
            uploadBatchId,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'Document(s) deleted successfully',
            data: result,
        };
    }

    @Delete(':roadMapId/extras/documents/file')
    async deleteSingleFile(
        @Param('roadMapId', ParseMongoIdPipe) roadMapId: string,
        @Query('userId', ParseMongoIdPipe) userId: string,
        @Query('uploadBatchId') uploadBatchId: string,
        @Query('fileUrl') fileUrl: string,
        @Query('nestedRoadMapItemId') nestedRoadMapItemId?: string,
    ): Promise<BaseResponse<{ message: string }>> {
        const result = await this.roadMapsService.deleteSingleFileFromBatch(
            roadMapId,
            userId,
            uploadBatchId,
            fileUrl,
            nestedRoadMapItemId,
        );
        return {
            success: true,
            message: 'File deleted successfully',
            data: result,
        };
    }

    @Post('redo-session')
    async redoSession(@Body() body: { appointmentId: string }) {
        const result = await this.roadMapsService.redoSession(
            body.appointmentId
        );

        return {
            success: true,
            message: "Redo successful",
            data: result
        };
    }

    @Get('sessions/:userId')
    getUserSessions(@Param('userId') userId: string) {
        return this.roadMapsService.getUserSessions(userId);
    }

    @Post('complete-session')
    completeSession(@Body() body: { appointmentId: string }) {
        return this.roadMapsService.handleSessionCompletion(body.appointmentId);
    }
}
