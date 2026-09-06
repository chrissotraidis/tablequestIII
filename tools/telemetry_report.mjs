import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opts, positionals } = parseArgs({ allowPositionals: true, options: {
    date: { type: 'string' }, timezone: { type: 'string', default: 'UTC' },
    session: { type: 'string' }, json: { type: 'boolean' }, 'include-tests': { type: 'boolean' },
} });
if (opts.date && !/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error('--date requires YYYY-MM-DD');
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: opts.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = at => {
    const date = new Date(at);
    if (!Number.isFinite(+date)) return null;
    const parts = Object.fromEntries(dayFormat.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};
const file = resolve(positionals[0] || 'data/telemetry.jsonl');
const sessions = new Map();
let malformedLines = 0;
try {
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
        if (!line.trim()) continue;
        let batch;
        try { batch = JSON.parse(line); } catch { malformedLines++; continue; }
        if (typeof batch.sessionId !== 'string' || !Array.isArray(batch.events)) { malformedLines++; continue; }
        if (opts.session && !batch.sessionId.startsWith(opts.session)) continue;
        if (!opts['include-tests'] && batch.client?.automated) continue;
        for (const event of batch.events) {
            if (!event || typeof event.event !== 'string') continue;
            const at = dayOf(event.at) ? event.at : batch.receivedAt;
            if (!dayOf(at) || (opts.date && dayOf(at) !== opts.date)) continue;
            let session = sessions.get(batch.sessionId);
            if (!session) {
                session = { id: batch.sessionId, client: batch.client || {}, events: [], seen: new Set() };
                sessions.set(session.id, session);
            }
            session.client = { ...session.client, ...batch.client };
            const key = event.seq ?? JSON.stringify([event.at, event.elapsedMs, event.event, event.data]);
            if (session.seen.has(key)) continue;
            session.seen.add(key);
            session.events.push({ ...event, at });
        }
    }
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.error(`No telemetry yet at ${file}`);
}
if (opts.session && sessions.size > 1) throw new Error('Session prefix is ambiguous; provide a longer ID');
const issue = e => e.level === 'error' || e.level === 'warn' || e.event.startsWith('runtime.');
const all = [...sessions.values()].map(({ seen, ...s }) => {
    s.events.sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0));
    const played = s.events.some(e => e.event === 'performance.sample' || e.event === 'state.changed' && e.data?.to === 'play' || e.event === 'session.activity' && e.data?.activeMs > 0);
    return { ...s, played, activeMs: s.events.reduce((n, e) => n + (e.event === 'session.activity' ? Number(e.data?.activeMs) || 0 : 0), 0),
        floors: [...new Set(s.events.map(e => e.data?.floor).filter(Number.isFinite))].sort((a, b) => a - b),
        issues: s.events.filter(issue).length, first: s.events[0]?.at, last: s.events.at(-1)?.at };
}).sort((a, b) => b.last.localeCompare(a.last));
const played = all.filter(s => s.played);
const events = all.flatMap(s => s.events);
const floorSamples = new Map();
for (const e of events) if (e.event === 'performance.sample' && Number.isFinite(e.data?.floor)) {
    const list = floorSamples.get(e.data.floor) || []; list.push(e.data); floorSamples.set(e.data.floor, list);
}
const performanceByFloor = [...floorSamples].sort(([a], [b]) => a - b).map(([floor, rows]) => ({
    floor, samples: rows.length,
    averageFps: +(rows.reduce((n, r) => n + (Number(r.fps) || 0), 0) / rows.length).toFixed(1),
    worstP95Ms: Math.max(...rows.map(r => Number(r.p95FrameMs) || 0)),
    worstFrameMs: Math.max(...rows.map(r => Number(r.maxFrameMs) || 0)),
    longFrames: rows.reduce((n, r) => n + (Number(r.longFrames) || 0), 0),
}));
const report = {
    date: opts.date || 'all dates', timezone: opts.timezone, sessions: all.length,
    playedSessions: played.length, uniqueBrowsers: new Set(played.map(s => s.client.visitorId).filter(Boolean)).size,
    playedSessionsWithoutVisitorId: played.filter(s => !s.client.visitorId).length,
    activeMinutes: +(played.reduce((n, s) => n + s.activeMs, 0) / 60000).toFixed(1),
    victories: events.filter(e => e.event === 'state.changed' && e.data?.to === 'victory').length,
    issues: events.filter(issue).length, audioIssues: events.filter(e => e.event.startsWith('audio.') && issue(e)).length,
    malformedLines, performanceByFloor, records: all,
};
if (opts.json) console.log(JSON.stringify(report, null, 2));
else {
    console.log(`Table Quest — ${report.date} (${report.timezone})`);
    console.log(`${report.playedSessions} played sessions · ${report.uniqueBrowsers} unique browsers · ${report.sessions} total sessions`);
    console.log(`${report.activeMinutes} active minutes · ${report.victories} victories · ${report.issues} warnings/errors (${report.audioIssues} audio)`);
    if (report.playedSessionsWithoutVisitorId) console.log(`${report.playedSessionsWithoutVisitorId} played sessions have no visitor ID (older logs or unavailable storage).`);
    console.log('Unique browsers are an estimate, not a count of individual people. Automated clients excluded unless --include-tests.');
    for (const p of performanceByFloor) console.log(`Floor ${p.floor}: ${p.averageFps} avg FPS · ${p.worstP95Ms}ms worst p95 · ${p.worstFrameMs}ms worst frame · ${p.longFrames} long frames`);
    if (malformedLines) console.log(`Skipped ${malformedLines} malformed/incomplete lines.`);
    for (const s of all.slice(0, opts.session ? 1 : 30)) {
        console.log(`\n${s.last} · ${s.id} · ${s.played ? 'played' : 'opened only'} · floors ${s.floors.join(', ') || 'none'} · ${s.issues} issues · build ${s.client.build || 'unknown'}`);
        for (const e of s.events.filter(e => opts.session || issue(e))) console.log(`  ${e.at} ${e.level} ${e.event} ${JSON.stringify(e.data)}`);
    }
}
