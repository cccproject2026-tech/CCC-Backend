import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseResponse } from 'src/shared/interfaces/base-response.interface';
import { HomeService } from './home.service';
import { HomeResponseDto } from './dto/home-response.dto';
import { MentorResponseDto } from './dto/mentor-response.dto';
import {
  AddNotificationDto,
  NotificationResponseDto,
} from './dto/notification.dto';
// import { JwtAuthGuard, RolesGuard } from '../../common/guards';
// import { Roles } from '../../common/decorators';
// import { ROLES } from '../../common/constants/roles.constants';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { CreateMediaDto, UpdateMediaDto } from './dto/media.dto';
import { FilesInterceptor } from '@nestjs/platform-express';

@ApiTags('Home')
@Controller('home')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) { }

  @Get('mentor/:email')
  // @Roles(ROLES.DIRECTOR, ROLES.PASTOR)
  async getMentorByEmail(
    @Param('email') email: string,
  ): Promise<BaseResponse<MentorResponseDto>> {
    const mentor = await this.homeService.getMentorByEmail(email);
    return {
      success: true,
      message: 'Mentor fetched successfully',
      data: mentor,
    };
  }

  @Get('mentee/:email')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR)
  async getMenteeByEmail(
    @Param('email') email: string,
  ): Promise<BaseResponse<MentorResponseDto>> {
    const mentee = await this.homeService.getMenteeByEmail(email);

    return {
      success: true,
      message: 'Mentee fetched successfully',
      data: mentee,
    };
  }

  @Get('mentors')
  // @Roles(ROLES.DIRECTOR, ROLES.PASTOR)
  async getAllMentors(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('country') country?: string,
    @Query('state') state?: string,
    @Query('conference') conference?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ): Promise<BaseResponse<{ mentors: MentorResponseDto[]; total: number }>> {
    const result = await this.homeService.getAllMentors({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      country,
      state,
      conference,
      role,
      search,
    });

    return {
      success: true,
      message: 'Mentors list fetched successfully',
      data: result,
    };
  }

  @Get('mentees')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR)
  async getAllMentees(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('phase') phase?: string,
    @Query('country') country?: string,
    @Query('search') search?: string,
  ): Promise<BaseResponse<{ mentees: MentorResponseDto[]; total: number }>> {
    const result = await this.homeService.getAllMentees({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      phase,
      country,
      search
    });

    return {
      success: true,
      message: 'Mentees list fetched successfully',
      data: result,
    };
  }

  @Post('notifications')
  async addNotification(
    @Body() dto: AddNotificationDto,
  ): Promise<BaseResponse<NotificationResponseDto>> {
    const result = await this.homeService.addNotification(dto);
    return {
      success: true,
      message: 'Notification added successfully',
      data: result,
    };
  }

  // GET /home/notifications?userId=... OR ?role=DIRECTOR
  @Get('notifications')
  async getNotifications(
    @Query('userId') userId?: string,
    @Query('role') role?: string,
  ): Promise<BaseResponse<NotificationResponseDto>> {
    const result = await this.homeService.getNotifications({ userId, role });
    return {
      success: true,
      message: 'Notifications fetched successfully',
      data: result,
    };
  }

  @Delete('notifications/user/:userId/:notificationId')
  async deleteUserNotification(
    @Param('userId', ParseMongoIdPipe) userId: string,
    @Param('notificationId') notificationId: string,
  ): Promise<BaseResponse<NotificationResponseDto>> {
    const result = await this.homeService.deleteNotification({
      userId,
      notificationId,
    });
    return {
      success: true,
      message: 'Notification marked read successfully',
      data: result,
    };
  }

  @Delete('notifications/role/:role/:notificationId')
  async deleteRoleNotification(
    @Param('role') role: string,
    @Param('notificationId') notificationId: string,
  ): Promise<BaseResponse<NotificationResponseDto>> {
    const result = await this.homeService.deleteNotification({
      role,
      notificationId,
    });
    return {
      success: true,
      message: 'Notification marked read successfully',
      data: result,
    };
  }

  @Post('device-token')
  async saveDeviceToken(
    @Body() body: { userId: string; token: string },
  ) {
    await this.homeService.saveDeviceToken(body.userId, body.token);
    return { success: true };
  }

  @Post("media")
  @UseInterceptors(FilesInterceptor('files', 10)) // multiple upload
  async create(
    @Body() dto: CreateMediaDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const data = await this.homeService.createMedia(dto, files);
    return { success: true, message: 'Media created successfully', data };
  }

  @Get("media")
  async findAll() {
    const data = await this.homeService.findAllMedia();
    return { success: true, message: 'Media fetched successfully', data };
  }

  @Get('media/:id')
  async findOne(@Param('id') id: string) {
    const data = await this.homeService.findOneMedia(id);
    return { success: true, message: 'Media fetched successfully', data };
  }

  @Patch('media/:id')
  @UseInterceptors(FilesInterceptor('files', 10))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const data = await this.homeService.updateMedia(id, dto, files);
    return { success: true, message: 'Media updated successfully', data };
  }

  @Delete('media/:id')
  async delete(@Param('id') id: string) {
    const data = await this.homeService.deleteMedia(id);
    return { success: true, message: 'Media deleted successfully', data };
  }

  @Get(':email')
  async getHomeDetails(
    @Param('email') email: string,
  ): Promise<BaseResponse<HomeResponseDto>> {
    const home = await this.homeService.getByEmail(email);
    return {
      success: true,
      message: 'Home details fetched successfully',
      data: home,
    };
  }
}
