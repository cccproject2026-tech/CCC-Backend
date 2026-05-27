import { Injectable } from '@nestjs/common';
import { TranscriptSummaryDto } from '../appointments/dto/appointment.dto';
import { TranscriptSummaryService } from '../appointments/transcript-summary.service';
import { WhisperTranscriptionService } from '../voice-notes/whisper-transcription.service';

export type ProcessConversationAudioInput = {
    audioBuffer: Buffer;
    mimeType: string;
    originalFilename?: string;
};

export type ProcessConversationAudioResult = {
    transcript: string;
    summary: TranscriptSummaryDto;
    model: string;
};

@Injectable()
export class ConversationProcessingService {
    constructor(
        private readonly whisperTranscriptionService: WhisperTranscriptionService,
        private readonly transcriptSummaryService: TranscriptSummaryService,
    ) { }

    async processAudio(input: ProcessConversationAudioInput): Promise<ProcessConversationAudioResult> {
        const transcript = await this.transcribeAudio(input);
        const summary = await this.summarizeTranscript(transcript);
        return {
            transcript,
            summary,
            model: this.transcriptSummaryService.modelName,
        };
    }

    async transcribeAudio(input: ProcessConversationAudioInput): Promise<string> {
        return this.whisperTranscriptionService.transcribeAudio(
            input.audioBuffer,
            input.mimeType,
            input.originalFilename,
        );
    }

    async summarizeTranscript(transcript: string): Promise<TranscriptSummaryDto> {
        return this.transcriptSummaryService.summarizeTranscript(transcript);
    }

    getSummaryModelName(): string {
        return this.transcriptSummaryService.modelName;
    }
}
