import { BadRequestException } from '@nestjs/common';

export type GoogleCalendarOAuthRedirectConfig = {
    /** Web SPA return URL (default client). */
    successRedirectUrl: string;
    /** Mobile deep link return URL when `platform=mobile`. */
    mobileSuccessRedirectUrl: string;
    /** Extra allowed return URLs or origin prefixes (comma-separated in env). */
    allowedRedirectUrls: string[];
};

export type GoogleOAuthBootstrapOptions = {
    platform?: string;
    redirectTo?: string;
};

function normalizeRedirectBase(url: string): string {
    const trimmed = url.trim();
    try {
        const u = new URL(trimmed);
        const path = u.pathname.replace(/\/+$/, '') || '/';
        return `${u.protocol}//${u.host}${path}`;
    } catch {
        return trimmed.replace(/\/+$/, '');
    }
}

function collectAllowlist(config: GoogleCalendarOAuthRedirectConfig): {
    exact: Set<string>;
    httpOrigins: Set<string>;
    customPrefixes: string[];
} {
    const exact = new Set<string>();
    const httpOrigins = new Set<string>();
    const customPrefixes: string[] = [];

    const candidates = [
        config.successRedirectUrl,
        config.mobileSuccessRedirectUrl,
        ...config.allowedRedirectUrls,
    ];

    for (const raw of candidates) {
        const candidate = raw?.trim();
        if (!candidate) continue;
        exact.add(normalizeRedirectBase(candidate));
        try {
            const u = new URL(candidate);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                httpOrigins.add(u.origin);
            } else {
                customPrefixes.push(normalizeRedirectBase(candidate));
            }
        } catch {
            exact.add(candidate);
        }
    }

    return { exact, httpOrigins, customPrefixes };
}

/** Reject open redirects — only http(s) origins or allowlisted custom schemes. */
export function assertAllowedOAuthSuccessRedirect(
    url: string,
    config: GoogleCalendarOAuthRedirectConfig,
): void {
    const trimmed = url.trim();
    if (!trimmed) {
        throw new BadRequestException('redirectTo must be a non-empty URL.');
    }
    if (trimmed.length > 2048) {
        throw new BadRequestException('redirectTo exceeds maximum length.');
    }
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        throw new BadRequestException('Invalid redirect URL scheme.');
    }

    const { exact, httpOrigins, customPrefixes } = collectAllowlist(config);
    const normalized = normalizeRedirectBase(trimmed);

    if (exact.has(normalized)) {
        return;
    }

    try {
        const u = new URL(trimmed);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            if (httpOrigins.has(u.origin)) {
                return;
            }
        } else {
            for (const prefix of customPrefixes) {
                if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
                    return;
                }
            }
        }
    } catch {
        throw new BadRequestException('redirectTo is not a valid URL.');
    }

    throw new BadRequestException('redirectTo is not an allowed OAuth return URL.');
}

/**
 * Resolve post-OAuth client return URL.
 * - `redirectTo` — explicit validated target (mobile dev/prod deep links).
 * - `platform=mobile` — configured mobile deep link.
 * - default / `platform=web` — existing web SPA URL.
 */
export function resolveOAuthSuccessRedirect(
    config: GoogleCalendarOAuthRedirectConfig,
    options?: GoogleOAuthBootstrapOptions,
): string | null {
    const redirectTo = options?.redirectTo?.trim();
    if (redirectTo) {
        assertAllowedOAuthSuccessRedirect(redirectTo, config);
        return redirectTo;
    }

    const platform = (options?.platform || 'web').trim().toLowerCase();
    if (platform === 'mobile') {
        const mobile = config.mobileSuccessRedirectUrl?.trim();
        if (!mobile) {
            throw new BadRequestException(
                'Mobile OAuth redirect is not configured (GOOGLE_OAUTH_MOBILE_SUCCESS_REDIRECT).',
            );
        }
        assertAllowedOAuthSuccessRedirect(mobile, config);
        return mobile;
    }

    if (platform !== 'web') {
        throw new BadRequestException('platform must be "web" or "mobile".');
    }

    const web = config.successRedirectUrl?.trim();
    if (!web) {
        return null;
    }
    assertAllowedOAuthSuccessRedirect(web, config);
    return web;
}

/** Whether the URL can receive `?googleCalendar=` query params (http(s) or custom scheme). */
export function isOAuthRedirectTarget(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (/^https?:\/\//i.test(trimmed)) return true;
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
}

export function appendGoogleCalendarOAuthParams(
    base: string,
    params: Record<string, string>,
): string {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, v);
    }
    return u.toString();
}
