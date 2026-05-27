import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConversationProcessingService } from './conversation-processing.service';
import { WhisperTranscriptionService } from '../voice-notes/whisper-transcription.service';
import { TranscriptSummaryService } from '../appointments/transcript-summary.service';

@Module({
    imports: [ConfigModule],
    providers: [
        WhisperTranscriptionService,
        TranscriptSummaryService,
        ConversationProcessingService,
    ],
    exports: [
        WhisperTranscriptionService,
        TranscriptSummaryService,
        ConversationProcessingService,
    ],
})
export class ConversationProcessingModule { }
