import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry<T> {
    value: T;
    /** Pastor (mentee) ids covered by this entry — used for targeted invalidation. */
    pastorIds: Set<string>;
    expiresAtMs: number;
}

/**
 * Lightweight in-memory TTL cache for the Mentor Review Center aggregated payload.
 *
 * There is no Redis/cache-manager in this codebase, so this is a process-local
 * Map. It is intentionally simple: a short TTL (default 5 min) plus precise
 * invalidation on the mutations that change review state guarantees we never
 * serve stale data after a mutation. Disable entirely with REVIEW_CENTER_CACHE_TTL_MS=0.
 */
@Injectable()
export class ReviewCenterCacheService {
    private readonly logger = new Logger(ReviewCenterCacheService.name);
    private readonly store = new Map<string, CacheEntry<unknown>>();
    private readonly ttlMs: number;

    constructor(private readonly configService: ConfigService) {
        this.ttlMs = this.configService.get<number>('reviewCenter.cacheTtlMs') ?? 5 * 60 * 1000;
    }

    get enabled(): boolean {
        return this.ttlMs > 0;
    }

    get<T>(key: string): T | undefined {
        if (!this.enabled) return undefined;
        const entry = this.store.get(key) as CacheEntry<T> | undefined;
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAtMs) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set<T>(key: string, value: T, pastorIds: Iterable<string>): void {
        if (!this.enabled) return;
        this.store.set(key, {
            value,
            pastorIds: new Set([...pastorIds].map(String)),
            expiresAtMs: Date.now() + this.ttlMs,
        });
    }

    /** Drop every cached mentor payload that includes this pastor (mentee). */
    invalidateForPastor(pastorId: string | undefined | null): void {
        if (!this.enabled || !pastorId) return;
        const id = String(pastorId);
        let removed = 0;
        for (const [key, entry] of this.store) {
            if (entry.pastorIds.has(id)) {
                this.store.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            this.logger.debug(`Invalidated ${removed} review-center cache entr(ies) for pastor ${id}`);
        }
    }

    invalidateForMentor(mentorId: string): void {
        if (!this.enabled || !mentorId) return;
        this.store.delete(this.keyForMentor(mentorId));
    }

    invalidateAll(): void {
        this.store.clear();
    }

    keyForMentor(mentorId: string): string {
        return `review-center:${mentorId}`;
    }
}
