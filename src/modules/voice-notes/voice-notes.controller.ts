import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceNotesService } from './voice-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { CreateVoiceNoteDto } from './dto/create-voice-note.dto';
@Controller('voice-notes')
@UseGuards(JwtAuthGuard)
export class VoiceNotesController {
    constructor(private readonly voiceNotesService: VoiceNotesService) { }

    @Post()
    @UseInterceptors(FileInterceptor('audio'))
    async upload(
        @UploadedFile() audio: Express.Multer.File,
        @Body() dto: CreateVoiceNoteDto,
        @CurrentUser() user: { userId: string },
    ) {
        const data = await this.voiceNotesService.upload(user, audio, dto.title);
        return { success: true, data };
    }

    @Get()
    async list(@CurrentUser() user: { userId: string }) {
        const data = await this.voiceNotesService.findAllForUser(user.userId);
        return { success: true, data };
    }

    @Get(':id')
    async getById(
        @Param('id', ParseMongoIdPipe) id: string,
        @CurrentUser() user: { userId: string },
    ) {
        const data = await this.voiceNotesService.findById(user.userId, id);
        return { success: true, data };
    }

    @Delete(':id')
    async delete(
        @Param('id', ParseMongoIdPipe) id: string,
        @CurrentUser() user: { userId: string },
    ) {
        await this.voiceNotesService.delete(user.userId, id);
        return { success: true, data: null };
    }
}
