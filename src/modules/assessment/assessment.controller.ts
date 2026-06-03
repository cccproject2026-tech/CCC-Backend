import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  // UseGuards,
} from '@nestjs/common';
import { CreateAssessmentDto, SectionDto, UpdateAssessmentDto } from './dto/assessment.dto';
import { Assessment } from './schemas/assessment.schema';
import { AssessmentService } from './assessment.service';
// import { JwtAuthGuard, RolesGuard } from '../../common/guards';
// import { ROLES } from '../../common/constants/roles.constants';
// import { Roles } from '../../common/decorators';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { SubmitSectionAnswersDto } from './dto/submit-section-answers.dto';
import { SubmitPreSurveyDto, UpdatePreSurveyDto } from './dto/submit-pre-survey.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('assessment')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) { }

  @Post()
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAssessmentDto): Promise<Assessment> {
    return this.assessmentService.create(dto);
  }

  @Get()
  async getAll(): Promise<Assessment[]> {
    return this.assessmentService.getAll();
  }

  @Get(':id')
  async getById(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<Assessment> {
    return this.assessmentService.getById(id);
  }

  @Delete()
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  async deleteMultipleAssessments(
    @Body('ids') ids: string[]
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Assessment IDs are required');
    }

    const result = await this.assessmentService.deleteMany(ids);

    return {
      success: true,
      deletedCount: result.deletedCount,
      message: 'Assessments deleted successfully',
    };
  }

  @Patch(':id/instructions')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  async updateAssessmentInstructions(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateAssessmentDto,
  ): Promise<Assessment> {
    return this.assessmentService.updateAssessment(id, dto);
  }

  @Patch(':id/sections')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  async updateSections(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body('sections') sections: SectionDto[],
  ): Promise<Assessment> {
    return this.assessmentService.updateSections(id, sections);
  }

  @Post(':assessmentId/assign')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  async assignAssessment(
    @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
    @Body('userIds') userIds: string[],
  ) {
    const result = await this.assessmentService.assignAssessmentToUsers(
      assessmentId,
      userIds,
    );
    return {
      success: true,
      message: 'Assessment assigned successfully',
      data: result,
    };
  }

  @Get('assigned/:userId')
  async getAssignedAssessments(
    @Param('userId', ParseMongoIdPipe) userId: string,
  ) {
    const result = await this.assessmentService.getAssignedAssessments(userId);
    return {
      success: true,
      message: 'Assigned assessments fetched successfully',
      data: result,
    };
  }

  // Save or update answers for a single section
  @Post(':assessmentId/section/:userId')
  async saveSectionAnswers(
    @Param('assessmentId') assessmentId: string,
    @Param('userId', ParseMongoIdPipe) userId: string,
    @Body()
    body: {
      sectionId: string;
      layers: { layerId: string; selectedChoice: string }[];
    },
  ) {
    const result = await this.assessmentService.saveOrUpdateSectionAnswers(
      assessmentId,
      userId,
      body.sectionId,
      body.layers,
    );

    return {
      success: true,
      message: 'Section answers saved successfully',
      data: result,
    };
  }

  // Fetch user’s saved answers
  @Get(':assessmentId/answers/:userId')
  async getUserAnswers(
    @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
    @Param('userId', ParseMongoIdPipe) userId: string,
  ) {
    const result = await this.assessmentService.getUserAnswers(
      assessmentId,
      userId,
    );

    return {
      success: true,
      message: 'User answers fetched successfully',
      data: result,
    };
  }

  // Submit Pre-Survey Answers
  @Post(':assessmentId/pre-survey')
  async submitPreSurvey(
    @Param('assessmentId') assessmentId: string,
    @Body() dto: SubmitPreSurveyDto,
  ) {
    const result = await this.assessmentService.submitPreSurvey(
      assessmentId,
      dto,
    );
    return {
      success: true,
      message: 'Pre-survey answers submitted successfully',
      data: result,
    };
  }

  @Get(':assessmentId/pre-survey/:userId')
  async getPreSurveyAnswers(
    @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
    @Param('userId', ParseMongoIdPipe) userId: string,
  ) {
    const result = await this.assessmentService.getPreSurveyAnswers(
      assessmentId,
      userId,
    );

    return {
      success: true,
      message: result
        ? 'Pre-survey answers fetched successfully'
        : 'No pre-survey data found',
      data: result,
    };
  }


  // Submit Section Answers
  @Post(':assessmentId/answers')
  async submitSectionAnswers(
    @Param('assessmentId') assessmentId: string,
    @Body() dto: SubmitSectionAnswersDto,
  ) {
    const result = await this.assessmentService.submitSectionAnswers(
      assessmentId,
      dto,
    );
    return {
      success: true,
      message: 'Section answers submitted successfully',
      data: result,
    };
  }

  @Patch(':id/banner-image')
  @UseInterceptors(FileInterceptor('file'))
  async updateBannerImage(
    @Param('id', ParseMongoIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const updated = await this.assessmentService.updateBannerImage(id, file);

    return {
      success: true,
      message: 'Banner image updated successfully',
      data: updated,
    };
  }

  @Patch(':id/pre-survey')
  async updatePreSurvey(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdatePreSurveyDto,
  ): Promise<Assessment> {
    return this.assessmentService.updatePreSurvey(id, dto);
  }

  @Patch(':id')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  async updateAssessment(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateAssessmentDto,
  ): Promise<Assessment> {
    return this.assessmentService.updateAssessment(id, dto);
  }

  @Get(':assessmentId/recommendation-rules')
  async getRecommendationRules(
    @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
  ) {
    const data =
      await this.assessmentService.getAssessmentRecommendationRules(
        assessmentId,
      );

    return {
      success: true,
      message: 'Assessment recommendation rules fetched successfully',
      data,
    };
  }

  @Get(':assessmentId/recommendations/:userId')
  async getRecommendations(
    @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
    @Param('userId', ParseMongoIdPipe) userId: string,
  ) {
    const data = await this.assessmentService.getAssessmentRecommendations(
      assessmentId,
      userId,
    );

    return {
      success: true,
      message: 'Assessment recommendation preview fetched successfully',
      data,
    };
  }

  @Post(':assessmentId/send-recommendation')
  async sendRecommendation(
    @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
    @Body() dto: {
      userId: string;
      sectionId: string;
      recommendations: string[];
    },
  ) {
    const result = await this.assessmentService.sendSectionRecommendation(
      assessmentId,
      dto.userId,
      dto.sectionId,
      dto.recommendations,
    );

    return {
      success: true,
      message: 'Recommendation sent successfully',
      data: result,
    };
  }

  // @Patch(':assessmentId/edit-recommendation')
  // async editRecommendation(
  //   @Param('assessmentId', ParseMongoIdPipe) assessmentId: string,
  //   @Body()
  //   body: {
  //     userId: string;
  //     sectionId: string;
  //     recommendations: string[];
  //   },
  // ) {
  //   const result = await this.assessmentService.editSectionRecommendation(
  //     assessmentId,
  //     body.userId,
  //     body.sectionId,
  //     body.recommendations,
  //   );

  //   return {
  //     success: true,
  //     message: 'Recommendation updated successfully',
  //     data: result,
  //   };
  // }
}