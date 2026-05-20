/** MIME types accepted for voice note uploads (base type, before `;` parameters). */
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/ogg',
    'audio/opus',
    'audio/3gpp',
    'audio/quicktime',
    'video/mp4',
    // Common mobile / client aliases
    'audio/m4a',
    'audio/mp3',
    'audio/x-wav',
    'application/ogg',
    'video/3gpp',
]);

/** File extensions (lowercase, without dot) accepted when MIME is missing or wrong. */
export const ALLOWED_AUDIO_EXTENSIONS = new Set([
    'mp3',
    'wav',
    'm4a',
    'webm',
    'ogg',
    'opus',
    'mp4',
    '3gp',
]);

export const MIME_TO_EXTENSION: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/ogg': 'ogg',
    'application/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/3gpp': '3gp',
    'video/3gpp': '3gp',
    'audio/quicktime': 'm4a',
    'video/mp4': 'mp4',
};

export function normalizeMimeType(mimeType: string | undefined): string {
    return (mimeType ?? '').split(';')[0].trim().toLowerCase();
}

export function getExtensionFromFilename(filename: string | undefined): string | null {
    if (!filename?.includes('.')) {
        return null;
    }
    const ext = filename.split('.').pop()?.trim().toLowerCase();
    return ext || null;
}

export function isAllowedAudioMime(mimeType: string | undefined): boolean {
    const normalized = normalizeMimeType(mimeType);
    return normalized.length > 0 && ALLOWED_AUDIO_MIME_TYPES.has(normalized);
}

export function isAllowedAudioExtension(filename: string | undefined): boolean {
    const ext = getExtensionFromFilename(filename);
    return ext !== null && ALLOWED_AUDIO_EXTENSIONS.has(ext);
}

export function isAllowedAudioUpload(
    mimeType: string | undefined,
    filename: string | undefined,
): boolean {
    return isAllowedAudioMime(mimeType) || isAllowedAudioExtension(filename);
}

export function resolveAudioExtension(
    mimeType: string | undefined,
    filename?: string | undefined,
): string {
    const normalized = normalizeMimeType(mimeType);
    if (normalized && MIME_TO_EXTENSION[normalized]) {
        return MIME_TO_EXTENSION[normalized];
    }
    const fromName = getExtensionFromFilename(filename);
    if (fromName && ALLOWED_AUDIO_EXTENSIONS.has(fromName)) {
        return fromName;
    }
    return 'bin';
}
