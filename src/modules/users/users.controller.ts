import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  // UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { BaseResponse } from '../../shared/interfaces/base-response.interface';
import { AssignMentorMenteeDto, RemoveMentorMenteeDto, UserResponseDto } from './dto/user-response.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import {
  InviteFieldMentorDto,
  AcceptInvitationDto,
  IssueCertificateDto,
} from './dto/user-operations.dto';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { Roles } from '../../common/decorators/roles.decorator';
// import { ROLES } from 'src/common/constants/roles.constants';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { DeleteDocumentDto, UserDocumentResponseDto } from './dto/upload-document.dto';
import { CreateNoteDto, NoteResponseDto, UpdateNoteDto } from './dto/notes.dto';

@ApiTags('Users')
@Controller('users')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.PASTOR)
  async createUser(
    @Body() dto: CreateUserDto,
  ): Promise<BaseResponse<UserResponseDto>> {
    const user = await this.usersService.create(dto);
    return {
      success: true,
      message: 'User created successfully',
      data: user,
    };
  }

  @Get()
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  async getAllUsers(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('hasCompleted') hasCompleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('roleMatch') roleMatch?: 'exact' | 'mixed',
  ): Promise<BaseResponse<{
    users: UserResponseDto[];
    total: number;
    page: number;
    totalPages: number;
  }>> {
    const filters = {
      role,
      status,
      hasCompleted: hasCompleted !== undefined ? hasCompleted === 'true' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      roleMatch,
    };
    const result = await this.usersService.findAll(filters);
    return {
      success: true,
      message: 'Users fetched successfully',
      data: result,
    };
  }

  @Get('check-status/:id')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  async checkUserStatus(
    @Param('id', ParseMongoIdPipe) userId: string,
  ): Promise<BaseResponse<{ status: string }>> {
    const userStatus = await this.usersService.checkUserStatus(userId);
    return {
      success: true,
      message: 'User status fetched successfully',
      data: { status: userStatus },
    };
  }

  @Post(':userId/assign')
  async assignUsers(
    @Param('userId', ParseMongoIdPipe) userId: string,
    @Body() dto: AssignMentorMenteeDto,
  ) {
    const result = await this.usersService.assignUsers(userId, dto);
    return {
      success: true,
      message: 'Users assigned successfully',
      data: result,
    };
  }

  @Patch(':userId/remove')
  async removeAssignedUsers(
    @Param('userId', ParseMongoIdPipe) userId: string,
    @Body() dto: RemoveMentorMenteeDto,
  ) {
    const result = await this.usersService.removeUsers(userId, dto);
    return {
      success: true,
      message: 'Users removed successfully',
      data: result,
    };
  }

  @Get(':userId/assigned')
  async getAssignedUsers(@Param('userId', ParseMongoIdPipe) userId: string) {
    const assignedUsers = await this.usersService.getAssignedUsers(userId);
    return {
      success: true,
      message: 'Assigned users fetched successfully',
      data: assignedUsers,
    };
  }

  @Get(':id')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  async getUser(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<BaseResponse<UserResponseDto>> {
    const user = await this.usersService.findById(id);
    return {
      success: true,
      message: 'User fetched successfully',
      data: user,
    };
  }

  @Patch(':id')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  async updateUser(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateData: UpdateUserDto,
  ): Promise<BaseResponse<UserResponseDto>> {
    const updated = await this.usersService.update(id, updateData);
    return {
      success: true,
      message: 'User updated successfully',
      data: updated,
    };
  }

  @Delete(':id')
  // @Roles(ROLES.DIRECTOR)
  async deleteUser(@Param('id', ParseMongoIdPipe) id: string): Promise<BaseResponse<null>> {
    await this.usersService.delete(id);
    return {
      success: true,
      message: 'User deleted successfully',
      data: null,
    };
  }

  @Patch(':id/profile-picture')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  @UseInterceptors(FileInterceptor('file'))
  async updateProfilePicture(
    @Param('id', ParseMongoIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<BaseResponse<UserResponseDto>> {
    const updated = await this.usersService.updateProfilePicture(id, file);
    return {
      success: true,
      message: 'Profile picture updated successfully',
      data: updated,
    };
  }

  @Post(':id/documents')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id', ParseMongoIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<BaseResponse<UserDocumentResponseDto>> {
    const document = await this.usersService.uploadDocument(id, file);
    return {
      success: true,
      message: 'Document uploaded successfully',
      data: document,
    };
  }

  @Get(':id/documents')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  async getDocuments(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<BaseResponse<UserDocumentResponseDto[]>> {
    const documents = await this.usersService.getDocuments(id);
    return {
      success: true,
      message: 'Documents fetched successfully',
      data: documents,
    };
  }

  @Delete(':id/documents')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR, ROLES.FIELD_MENTOR, ROLES.PASTOR)
  async deleteDocument(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() body: DeleteDocumentDto,
  ): Promise<BaseResponse<null>> {
    await this.usersService.deleteDocument(id, body.docId);
    return {
      success: true,
      message: 'Document deleted successfully',
      data: null,
    };
  }

  @Get(':id/notes')
  async getNotes(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<BaseResponse<NoteResponseDto[]>> {
    const notes = await this.usersService.getNotes(id);
    return {
      success: true,
      message: 'Notes fetched successfully',
      data: notes,
    };
  }

  @Post(':id/notes')
  async addNote(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: CreateNoteDto,
  ): Promise<BaseResponse<NoteResponseDto>> {
    const note = await this.usersService.addNote(id, dto);
    return {
      success: true,
      message: 'Note added successfully',
      data: note,
    };
  }

  @Patch(':id/notes/:noteId')
  async updateNote(
    @Param('id', ParseMongoIdPipe) id: string,
    @Param('noteId', ParseMongoIdPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<BaseResponse<NoteResponseDto>> {
    const note = await this.usersService.updateNote(id, noteId, dto);
    return {
      success: true,
      message: 'Note updated successfully',
      data: note,
    };
  }

  @Delete(':id/notes/:noteId')
  async deleteNote(
    @Param('id', ParseMongoIdPipe) id: string,
    @Param('noteId', ParseMongoIdPipe) noteId: string,
  ): Promise<BaseResponse<null>> {
    await this.usersService.deleteNote(id, noteId);
    return {
      success: true,
      message: 'Note deleted successfully',
      data: null,
    };
  }

  @Post('invite-field-mentor')
  // @Roles(ROLES.DIRECTOR)
  async inviteFieldMentor(
    @Body() dto: InviteFieldMentorDto,
  ): Promise<BaseResponse<{ token: string; expiresAt: Date }>> {
    const result = await this.usersService.inviteFieldMentor(dto);
    return {
      success: true,
      message: 'Field mentor invitation sent successfully',
      data: result,
    };
  }

  @Post('accept-invitation')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
  ): Promise<BaseResponse<UserResponseDto>> {
    const user = await this.usersService.acceptInvitation(dto);
    return {
      success: true,
      message: 'Invitation accepted successfully. Role updated to field-mentor.',
      data: user,
    };
  }

  @Post('reject-invitation')
  async rejectInvitation(
    @Body() dto: AcceptInvitationDto,
  ): Promise<BaseResponse<UserResponseDto>> {
    const user = await this.usersService.rejectInvitation(dto);
    return {
      success: true,
      message: 'Invitation rejected successfully.',
      data: user,
    };
  }

  @Patch(':id/mark-completed')
  // @Roles(ROLES.DIRECTOR, ROLES.MENTOR)
  async markCompleted(
    @Param('id', ParseMongoIdPipe) userId: string,
  ): Promise<BaseResponse<UserResponseDto>> {
    const user = await this.usersService.markCompleted({ userId: userId as any });
    return {
      success: true,
      message: 'User marked as completed successfully',
      data: user,
    };
  }

  @Post(':id/issue-certificate')
  // @Roles(ROLES.DIRECTOR)
  async issueCertificate(
    @Param('id', ParseMongoIdPipe) userId: string,
    @Body() dto: Omit<IssueCertificateDto, 'userId'>,
  ): Promise<BaseResponse<UserResponseDto>> {
    const user = await this.usersService.issueCertificate({
      userId: userId as any,
      issuedBy: dto.issuedBy,
    });
    return {
      success: true,
      message: 'Certificate issued successfully',
      data: user,
    };
  }
}
