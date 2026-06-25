import { ExtrasDocumentDto } from '../dto/extras.dto';
import { TaskSubmissionDto } from '../dto/submission.dto';

const SKIP_EXTRA_TYPES = new Set(['JUMPSTART_COMPLETE']);

function normName(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

/** Count submission versions from duplicate field entries in extras[]. */
export function computeHistoryVersionCount(extras: any[] | undefined | null): number {
    const allExtras = (extras ?? []).filter(
        (entry) => entry?.name && !SKIP_EXTRA_TYPES.has(entry.type),
    );
    if (allExtras.length === 0) return 1;

    const byName = new Map<string, number>();
    for (const entry of allExtras) {
        const key = String(entry.name);
        byName.set(key, (byName.get(key) ?? 0) + 1);
    }

    return Math.max(1, ...Array.from(byName.values()));
}

function groupExtrasByName(extras: any[]): Map<string, any[]> {
    const byName = new Map<string, any[]>();
    for (const entry of extras) {
        if (!entry?.name || SKIP_EXTRA_TYPES.has(entry.type)) continue;
        const key = String(entry.name);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(entry);
    }
    return byName;
}

function pickEntryForVersion(entries: any[], versionIndex: number): any | undefined {
    const direct = entries[versionIndex];
    if (direct) return direct;
    if (entries[0]?.type === 'UPLOAD') return undefined;
    return entries[entries.length - 1];
}

export function buildResponsesForVersion(
    extras: any[] | undefined | null,
    versionIndex: number,
): Record<string, any>[] {
    const byName = groupExtrasByName(extras ?? []);
    const responses: Record<string, any>[] = [];

    for (const [, entries] of byName) {
        const entry = pickEntryForVersion(entries, versionIndex);
        if (!entry) continue;
        responses.push({
            type: entry.type ?? 'TEXT_FIELD',
            name: entry.name ?? '',
            value: entry.value,
            signatureData: entry.signatureData,
        });
    }

    return responses;
}

function sortBatchesChronologically(batches: ExtrasDocumentDto[]): ExtrasDocumentDto[] {
    return [...batches].sort((a, b) => {
        const aMs = new Date(String(a.uploadedAt ?? '')).getTime();
        const bMs = new Date(String(b.uploadedAt ?? '')).getTime();
        if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
            return aMs - bMs;
        }
        return String(a.uploadBatchId ?? '').localeCompare(String(b.uploadBatchId ?? ''));
    });
}

/** Documents that belong to a specific history version (immutable snapshot). */
export function resolveUploadedDocumentsForVersion(
    uploadedDocuments: ExtrasDocumentDto[] | undefined | null,
    versionNumber: number,
): ExtrasDocumentDto[] {
    const batches = uploadedDocuments ?? [];
    if (batches.length === 0) return [];

    const stamped = batches.filter(
        (batch) => Number((batch as any).historyVersion) === versionNumber,
    );
    if (stamped.length > 0) return sortBatchesChronologically(stamped);

    const legacyBatches = batches.filter(
        (batch) => (batch as any).historyVersion == null,
    );

    const byField = new Map<string, ExtrasDocumentDto[]>();
    for (const batch of legacyBatches) {
        const key = normName(batch.name);
        if (!key) continue;
        if (!byField.has(key)) byField.set(key, []);
        byField.get(key)!.push(batch);
    }

    const resolved: ExtrasDocumentDto[] = [];
    for (const fieldBatches of byField.values()) {
        const sorted = sortBatchesChronologically(fieldBatches);
        const batch = sorted[versionNumber - 1];
        if (batch) resolved.push(batch);
    }

    return sortBatchesChronologically(resolved);
}

export function buildSubmissionId(extrasId: string, versionNumber: number): string {
    return `${extrasId}-v${versionNumber}`;
}

export function parseSubmissionId(
    submissionId: string,
): { extrasId: string; versionNumber: number } | null {
    const trimmed = String(submissionId ?? '').trim();
    const legacyPrefix = 'legacy-';
    const normalized = trimmed.startsWith(legacyPrefix)
        ? trimmed.slice(legacyPrefix.length)
        : trimmed;

    const match = normalized.match(/^(.+)-v(\d+)$/);
    if (!match) return null;

    const versionNumber = Number.parseInt(match[2], 10);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) return null;

    return {
        extrasId: match[1],
        versionNumber,
    };
}

function estimateSubmittedAt(
    createdAt: Date | undefined,
    updatedAt: Date | undefined,
    versionIndex: number,
    totalVersions: number,
): Date {
    if (totalVersions <= 1) {
        return createdAt ?? updatedAt ?? new Date();
    }

    const createdMs = new Date(String(createdAt ?? '')).getTime();
    const updatedMs = new Date(String(updatedAt ?? '')).getTime();
    const fraction = versionIndex / (totalVersions - 1);
    const ts = createdMs + fraction * (updatedMs - createdMs);

    if (Number.isFinite(ts)) return new Date(ts);
    return createdAt ?? updatedAt ?? new Date();
}

export function buildTaskSubmissionsFromExtras(doc: any): TaskSubmissionDto[] {
    const extrasId = doc._id?.toString() ?? String(doc._id);
    const totalVersions = computeHistoryVersionCount(doc.extras);
    const submissions: TaskSubmissionDto[] = [];

    for (let versionIndex = 0; versionIndex < totalVersions; versionIndex++) {
        const submissionNumber = versionIndex + 1;
        const isLatest = versionIndex === totalVersions - 1;
        const responses = buildResponsesForVersion(doc.extras, versionIndex);
        const uploadedDocuments = resolveUploadedDocumentsForVersion(
            doc.uploadedDocuments,
            submissionNumber,
        );

        submissions.push({
            _id: buildSubmissionId(extrasId, submissionNumber),
            roadMapId: doc.roadMapId?.toString() ?? String(doc.roadMapId),
            nestedRoadMapItemId: doc.nestedRoadMapItemId?.toString(),
            submittedBy: doc.userId?.toString() ?? String(doc.userId),
            submissionNumber,
            status: isLatest && totalVersions > 1 ? 'resubmitted' : 'submitted',
            responses,
            uploadedDocuments,
            resubmittedFromSubmissionId:
                versionIndex === 0
                    ? null
                    : buildSubmissionId(extrasId, submissionNumber - 1),
            submittedAt: estimateSubmittedAt(
                doc.createdAt,
                doc.updatedAt,
                versionIndex,
                totalVersions,
            ),
            createdAt: doc.createdAt ?? new Date(),
            updatedAt: doc.updatedAt ?? new Date(),
        });
    }

    return submissions;
}
