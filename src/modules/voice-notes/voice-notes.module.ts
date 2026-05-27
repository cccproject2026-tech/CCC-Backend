import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { VoiceNotesController } from './voice-notes.controller';
import { VoiceNotesService } from './voice-notes.service';
import { VoiceNote, VoiceNoteSchema } from './schemas/voice-note.schema';
import { S3Module } from '../s3/s3.module';
import { ConversationProcessingModule } from '../conversation-processing/conversation-processing.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: VoiceNote.name, schema: VoiceNoteSchema },
        ]),
        S3Module,
        ConversationProcessingModule,
        ConfigModule,
        MulterModule.register({
            storage: require('multer').memoryStorage(),
        }),
    ],
    controllers: [VoiceNotesController],
    providers: [VoiceNotesService],
})
export class VoiceNotesModule { }
