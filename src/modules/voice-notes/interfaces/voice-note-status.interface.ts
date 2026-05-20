export const VOICE_NOTE_STATUSES = [
    'pending',
    'transcribing',
    'summarizing',
    'completed',
    'failed',
] as const;

export type VoiceNoteStatus = (typeof VOICE_NOTE_STATUSES)[number];

export const VOICE_NOTE_SOURCES = ['upload'] as const;

export type VoiceNoteSource = (typeof VOICE_NOTE_SOURCES)[number];
