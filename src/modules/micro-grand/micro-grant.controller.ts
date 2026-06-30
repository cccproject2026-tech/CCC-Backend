import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
  // UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MicroGrantService } from './micro-grant.service';
import {
  ApplyMicroGrantDto,
  CreateOrUpdateFormDto,
  UpdateApplicationStatusDto,
} from './dto/micro-grant.dto';
// import { JwtAuthGuard, RolesGuard } from '../../common/guards';
// import { Roles } from '../../common/decorators';
// import { ROLES } from '../../common/constants/roles.constants';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { FilesInterceptor } from '@nestjs/platform-express';

@ApiTags('Micro Grant')
@Controller('microgrant')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class MicroGrantController {
  constructor(private readonly microGrantService: MicroGrantService) { }

  @Post('form')
  // @Roles(ROLES.DIRECTOR)
  async createOrUpdateForm(@Body() dto: CreateOrUpdateFormDto) {
    const form = await this.microGrantService.createOrUpdateForm(dto);
    return { success: true, message: 'Form saved successfully', data: form };
  }

  @Get('form')
  // @Roles(ROLES.DIRECTOR, ROLES.PASTOR)
  async getForm() {
    const result = await this.microGrantService.getForm();
    return {
      success: true,
      message: 'Form fetched successfully',
      data: result,
    };
  }

  @Post('apply')
  // @Roles(ROLES.PASTOR)
  @UseInterceptors(FilesInterceptor('files', 10))
  async applyForGrant(@Body() dto: ApplyMicroGrantDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const result = await this.microGrantService.applyForGrant(dto, files);
    return {
      success: true,
      message: 'Micro grant application submitted successfully',
      data: result,
    };
  }

  @Get('applications')
  // @Roles(ROLES.DIRECTOR)
  async getApplications(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.microGrantService.getApplications(status, search);
    return {
      success: true,
      message: 'Applications fetched successfully',
      data: result,
    };
  }

  @Get('application/:userId')
  // @Roles(ROLES.DIRECTOR)
  async getUserApplication(@Param('userId', ParseMongoIdPipe) userId: string) {
    const result = await this.microGrantService.getUserApplication(userId);
    return {
      success: true,
      message: 'Fetched user application successfully',
      data: result,
    };
  }

  @Patch('application/:id/status')
  // @Roles(ROLES.DIRECTOR)
  async updateApplicationStatus(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    const result = await this.microGrantService.updateApplicationStatus(
      id,
      dto.status,
    );
    return {
      success: true,
      message: result.message,
      data: result.application,
    };
  }

  @Get('application/check/:userId')
  async checkApplication(
    @Param('userId', ParseMongoIdPipe) userId: string,
  ) {
    const result = await this.microGrantService.checkApplication(userId);

    return {
      success: true,
      message: "Application check completed",
      data: result,
    };
  }
}