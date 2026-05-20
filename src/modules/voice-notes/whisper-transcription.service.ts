import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

const MIME_TO_EXTENSION: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'mp4',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-m4a': 'm4a',
};

@Injectable()
export class WhisperTranscriptionService {
    private readonly logger = new Logger(WhisperTranscriptionService.name);

    constructor(private readonly configService: ConfigService) { }

    async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        originalFilename?: string,
    ): Promise<string> {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
        if (!apiKey) {
            throw new UnprocessableEntityException('OPENAI_API_KEY is not configured');
        }

        const model =
            this.configService.get<string>('OPENAI_WHISPER_MODEL')?.trim() ?? 'whisper-1';
        const timeoutMs = this.getNumberEnv('OPENAI_WHISPER_TIMEOUT_MS', 120000);
        const retries = 1;

        let lastError: unknown = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this.callWhisperApi(
                    apiKey,
                    model,
                    audioBuffer,
                    mimeType,
                    originalFilename,
                    timeoutMs,
                );
            } catch (error) {
                lastError = error;
                this.logger.warn(
                    `Whisper transcription attempt ${attempt + 1} failed: ${(error as Error)?.message ?? error}`,
                );
                if (attempt < retries) {
                    await this.delay(500 * (attempt + 1));
                }
            }
        }

        throw new UnprocessableEntityException(
            `Unable to transcribe audio: ${(lastError as Error)?.message ?? lastError}`,
        );
    }

    private async callWhisperApi(
        apiKey: string,
        model: string,
        audioBuffer: Buffer,
        mimeType: string,
        originalFilename: string | undefined,
        timeoutMs: number,
    ): Promise<string> {
        const extension = MIME_TO_EXTENSION[mimeType] ?? 'audio';
        const filename = originalFilename?.trim() || `audio.${extension}`;

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append('file', blob, filename);
        formData.append('model', model);
        formData.append('response_format', 'json');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(WHISPER_API_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                body: formData,
                signal: controller.signal,
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(
                    `Whisper API HTTP ${response.status}: ${JSON.stringify(payload)}`,
                );
            }

            const transcript =
                typeof payload?.text === 'string' ? payload.text.trim() : '';

            if (!transcript) {
                throw new Error('Whisper API returned an empty transcript');
            }

            return transcript;
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') {
                throw new Error(`Whisper API request timed out after ${timeoutMs}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    private getNumberEnv(name: string, fallback: number): number {
        const raw = this.configService.get<string>(name);
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    private async delay(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
