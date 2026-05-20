/**
 * Smoke test: Mongo + recurring availability HTTP API (localhost).
 * Run: node scripts/e2e-recurring-smoke.mjs
 * Loads .env from project root via dotenv.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.SMOKE_API_BASE ?? 'http://127.0.0.1:3000/api/v1';

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.log(JSON.stringify({ ok: false, step: 'missing_env', hint: 'MONGO_URI not set in .env' }));
        process.exit(1);
    }

    await mongoose.connect(uri, { dbName: process.env.MONGO_DB_NAME || undefined });
    try {
        const col = mongoose.connection.collection('users');
        const u = await col.findOne({ role: { $in: ['mentor', 'director', 'field mentor'] } });
        if (!u) {
            console.log(JSON.stringify({ ok: false, step: 'no_host_user' }));
            process.exit(3);
        }
        const id = u._id.toString();

        const body = JSON.stringify({
            mentorId: id,
            horizonDays: 14,
            clearPersonalizations: true,
            templateWeeklySlots: [
                {
                    date: '2026-06-09',
                    slots: [
                        { startTime: '10:00', startPeriod: 'AM', endTime: '1:00', endPeriod: 'PM' },
                    ],
                },
                {
                    date: '2026-06-10',
                    slots: [
                        { startTime: '2:00', startPeriod: 'PM', endTime: '5:00', endPeriod: 'PM' },
                    ],
                },
            ],
            meetingDuration: 60,
        });

        const post = await fetch(`${BASE}/appointments/availability/recurring`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        const postPayload = await post.json().catch(() => ({}));
        const gr = await fetch(`${BASE}/appointments/availability/${id}`);
        const gj = await gr.json().catch(() => ({}));
        const d = gj.data ?? {};

        const weekly = d.weeklySlots ?? [];

        console.log(
            JSON.stringify(
                {
                    ok: post.ok && gr.ok && post.status >= 200 && post.status < 300,
                    mongoConnected: mongoose.connection.readyState === 1,
                    postStatus: post.status,
                    getStatus: gr.status,
                    recurringPatternWeekdays: (d.recurringWeeklyPattern ?? []).map((p) => p.weekday),
                    weeklySlotsCount: weekly.length,
                    exceptions: (d.recurringExceptionDates ?? []).length,
                    suppressed: (d.recurringSuppressedDates ?? []).length,
                    recurringGenerationsAmongFirst15: weekly.slice(0, 15).map((w) => w.generation),
                    apiMessage: gj.message ?? null,
                    postMessage: postPayload.message ?? postPayload ?? null,
                },
                null,
                2,
            ),
        );
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((e) => {
    console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
    process.exit(1);
});
