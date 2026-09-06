import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const temp = await mkdtemp(join(tmpdir(), 'tq-telemetry-test-'));
const file = join(temp, 'fixture.jsonl');
const event = (seq, at, name, data = {}, level = 'info') => ({ seq, at, elapsedMs: seq * 1000, event: name, data, level });
const batch = (id, visitorId, events, automated = false) => ({ sessionId: id, receivedAt: events[0].at, client: { visitorId, automated, build: 'test' }, events });
const a = batch('session-a', 'browser-1', [event(1, '2026-09-06T14:59:00Z', 'state.changed', { to: 'play', floor: 3 }), event(2, '2026-09-06T14:59:15Z', 'session.activity', { activeMs: 15000 }), event(3, '2026-09-06T15:01:00Z', 'audio.music-silent', { floor: 3 }, 'warn')]);
try {
    await writeFile(file, [a, a, batch('session-b', 'browser-1', [event(1, '2026-09-06T12:00:00Z', 'state.changed', { to: 'play' })]), batch('session-c', 'browser-2', [event(1, '2026-09-06T12:00:00Z', 'session.started')]), batch('session-test', 'robot', [event(1, '2026-09-06T12:00:00Z', 'state.changed', { to: 'play' })], true)].map(x => JSON.stringify(x)).join('\n') + '\n{"partial":');
    const report = (...args) => JSON.parse(execFileSync(process.execPath, ['tools/telemetry_report.mjs', file, '--json', ...args], { encoding: 'utf8' }));
    const daily = report('--date', '2026-09-06', '--timezone', 'Asia/Tokyo');
    assert.equal(daily.playedSessions, 2); assert.equal(daily.uniqueBrowsers, 1); assert.equal(daily.sessions, 3);
    assert.equal(daily.audioIssues, 0); assert.equal(daily.records.find(s => s.id === 'session-a').activeMs, 15000);
    assert.equal(daily.malformedLines, 1);
    assert.equal(report('--date', '2026-09-07', '--timezone', 'Asia/Tokyo').audioIssues, 1);
    assert.equal(report('--include-tests').playedSessions, 3);
    const incident = report('--session', 'session-a'); assert.equal(incident.records[0].events.length, 3); assert.equal(incident.audioIssues, 1);
    // No server needed: exercise the copy wrapper with a local scp stand-in.
    const scp = join(temp, 'scp');
    await writeFile(scp, '#!/bin/sh\nprintf "copied" > "$2"\nexit "${TQ_TEST_EXIT:-0}"\n'); await chmod(scp, 0o755);
    const out = join(temp, 'local.jsonl'), env = { ...process.env, PATH: `${temp}:${process.env.PATH}` };
    execFileSync(process.execPath, ['tools/pull_telemetry.mjs', '--host', 'test-vps', '--remote', '/srv/game/telemetry.jsonl', '--out', out], { env });
    assert.equal(await readFile(out, 'utf8'), 'copied');
    await writeFile(out, 'previous');
    assert.throws(() => execFileSync(process.execPath, ['tools/pull_telemetry.mjs', '--host', 'test-vps', '--remote', '/srv/game/telemetry.jsonl', '--out', out], { env: { ...env, TQ_TEST_EXIT: '1' }, stdio: 'pipe' }));
    assert.equal(await readFile(out, 'utf8'), 'previous');
    console.log('Telemetry: PASS (daily timezone, browser/session distinction, deduplication, bot exclusion, incident timeline, partial log, safe copy failure)');
} finally { await rm(temp, { recursive: true, force: true }); }
