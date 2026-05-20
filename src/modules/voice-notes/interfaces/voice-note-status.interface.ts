export const VOICE_NOTE_STATUSES = [
    'pending',
    'transcribing',
    'summarizing',
    'completed',
    'failed',
] as const;

export type VoiceNoteStatus = (typeof VOICE_NOTE_STATUSES)[number];

export const VOICE_NOTE_SOURCES = ['upload', 'recording'] as const;

export type VoiceNoteSource = (typeof VOICE_NOTE_SOURCES)[number];

/** Common client values for recordingPlatform (not enforced strictly). */
export const RECORDING_PLATFORMS = ['ios', 'android', 'web'] as const;

export type RecordingPlatform = (typeof RECORDING_PLATFORMS)[number];
