import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, stat, rename, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'tablequest-scoreboard-'));
const dataFile = join(temporary, 'leaderboard.json');
const telemetryFile = join(temporary, 'telemetry.jsonl');

async function freePort() {
    return new Promise((resolvePort, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(error => error ? reject(error) : resolvePort(port));
        });
    });
}

async function startServer(port) {
    const child = spawn(process.execPath, ['server/scoreboard-server.mjs'], {
        cwd: root,
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TQ_DATA_FILE: dataFile, TQ_TELEMETRY_FILE: telemetryFile, TQ_TELEMETRY_MAX_BYTES: '65536' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.resume();
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Scoreboard server exited early: ${stderr}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) return child;
        } catch { /* server is still starting */ }
        await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
    child.kill();
    throw new Error('Timed out waiting for scoreboard server');
}

async function stopServer(child) {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise(resolveExit => child.once('exit', resolveExit));
}

async function request(port, path, options) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    const value = await response.json();
    return { status: response.status, value };
}

let server;
try {
    const port = await freePort();
    server = await startServer(port);

    const run = await request(port, '/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (run.status !== 201 || !run.value.runToken) throw new Error('New Game did not receive a ranked-run token');

    for (let floor = 1; floor <= 6; floor += 1) {
        const checkpoint = await request(port, `/api/runs/${run.value.runToken}/checkpoint`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ floor }),
        });
        if (checkpoint.status !== 200 || checkpoint.value.completedFloor !== floor) throw new Error(`Floor ${floor} checkpoint failed`);
        const duplicate = await request(port, `/api/runs/${run.value.runToken}/checkpoint`, {
            method: 'POST', body: JSON.stringify({ floor }),
        });
        assert.equal(duplicate.status, 200, 'Retry of latest checkpoint must succeed');
        if (floor === 1) {
            for (const invalid of [0, 3, 1.5]) {
                const result = await request(port, `/api/runs/${run.value.runToken}/checkpoint`, { method: 'POST', body: JSON.stringify({ floor: invalid }) });
                assert.equal(result.status, 409, 'Invalid floor sequence must be rejected');
            }
        }
        if (floor === 2) {
            const old = await request(port, `/api/runs/${run.value.runToken}/checkpoint`, { method: 'POST', body: JSON.stringify({ floor: 1 }) });
            assert.equal(old.status, 409, 'Old checkpoint must not move progress backwards');
        }
    }

    const submitted = await request(port, '/api/scores', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runToken: run.value.runToken, name: 'PERSIST', score: 123456 }),
    });
    if (submitted.status !== 201 || submitted.value.rank !== 1) throw new Error('Completed New Game score was not accepted');

    await stopServer(server);
    server = await startServer(port);

    const reloaded = await request(port, '/api/scores');
    const first = reloaded.value.scores?.[0];
    if (reloaded.status !== 200 || first?.name !== 'PERSIST' || first?.score !== 123456) {
        throw new Error('Score did not survive a server restart');
    }

    const forged = await request(port, '/api/scores', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'CHEAT', score: 999999 }),
    });
    if (forged.status !== 403) throw new Error('Score without a completed New Game token was accepted');

    const concurrentRuns = await Promise.all(Array.from({ length: 8 }, () =>
        request(port, '/api/runs', { method: 'POST', body: '{}' })));
    if (concurrentRuns.some(run => run.status !== 201)) throw new Error('Concurrent run creation failed');
    const checkpoints = await Promise.all(concurrentRuns.map(run => request(port,
        `/api/runs/${run.value.runToken}/checkpoint`, { method: 'POST', body: JSON.stringify({ floor: 1 }) })));
    if (checkpoints.some(result => result.status !== 200)) throw new Error('Concurrent runs overwrote one another');
    const persisted = JSON.parse(await readFile(dataFile, 'utf8'));
    if (concurrentRuns.some(run => persisted.runs[run.value.runToken]?.completedFloor !== 1)) {
        throw new Error('Concurrent checkpoints were lost');
    }

    // A defeat is a valid campaign result. Progress takes priority over score.
    const partial = await request(port, '/api/scores', { method: 'POST', body: JSON.stringify({runToken: concurrentRuns[0].value.runToken, name: 'FLOOR2', score: 999999}) });
    assert.equal(partial.status, 201);
    assert.equal(partial.value.rank, 2, 'completed campaign outranks a larger partial score');
    const early = await request(port, '/api/runs', {method:'POST',body:'{}'});
    assert.equal((await request(port, '/api/scores', {method:'POST',body:JSON.stringify({runToken:early.value.runToken,name:'FLOOR1',score:999999})})).status,201);
    const ranked = (await request(port, '/api/scores')).value.scores;
    assert.deepEqual(ranked.slice(0,3).map(s=>[s.name,s.completedFloor,s.floorReached]), [['PERSIST',6,6],['FLOOR2',1,2],['FLOOR1',0,1]]);
    assert.equal((await request(port, `/api/runs/${concurrentRuns[0].value.runToken}/checkpoint`, {method:'POST',body:'{"floor":2}'})).status,404,'submitted runs cannot advance');
    assert.equal((await request(port, '/api/scores', {method:'POST',body:JSON.stringify({runToken:early.value.runToken,name:'AGAIN',score:1})})).status,403,'one result per run');
    // Old completed-only records have no progress fields; retain their ranking.
    const legacy = JSON.parse(await readFile(dataFile,'utf8'));
    delete legacy.scores[0].completedFloor; delete legacy.scores[0].floorReached;
    await writeFile(dataFile,JSON.stringify(legacy));
    assert.equal((await request(port,'/api/scores')).value.scores[0].completedFloor,6);

    const telemetry = await request(port, '/api/telemetry', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            sessionId: 'test-session-1234', client: { timezone: 'Asia/Tokyo', language: 'en', visitorId: 'anonymous-browser-1', build: 'test-build', automated: true },
            events: [{ seq: 7, at: new Date().toISOString(), elapsedMs: 12345, level: 'warn', event: 'performance.sample', data: { floor: 2, fps: 31 } }],
        }),
    });
    if (telemetry.status !== 202 || telemetry.value.accepted !== 1) throw new Error('Telemetry batch was not accepted');
    const telemetryRecord = JSON.parse((await readFile(telemetryFile, 'utf8')).trim());
    if (telemetryRecord.sessionId !== 'test-session-1234' || telemetryRecord.events[0]?.data?.floor !== 2) throw new Error('Telemetry was not persisted');

    if (telemetryRecord.client.visitorId !== 'anonymous-browser-1' || telemetryRecord.client.build !== 'test-build' || !telemetryRecord.client.automated || telemetryRecord.events[0].seq !== 7) throw new Error('Telemetry identity/build/sequence fields were dropped');

    // Thirty visitors share one proxy/NAT peer: four telemetry and six scoreboard reads
    // each in a minute, plus a full set of campaign checkpoints, without mutual throttling.
    const mixed = await Promise.all(Array.from({ length: 30 }, async (_, visitor) => {
        const created = await request(port, '/api/runs', { method: 'POST', body: '{}' });
        assert.equal(created.status, 201);
        const background = await Promise.all([
            ...Array.from({ length: 6 }, () => request(port, '/api/scores')),
            ...Array.from({ length: 4 }, () => request(port, '/api/telemetry', { method: 'POST', body: JSON.stringify({
                sessionId: `conference-visitor-${visitor}`, events: [{ event: 'session.activity', data: { sample: 'x'.repeat(3900) } }],
            }) })),
        ]);
        assert.equal(background.filter(result => result.status === 200).length, 6);
        assert.equal(background.filter(result => result.status === 202).length, 4);
        for (let floor = 1; floor <= 6; floor++) {
            assert.equal((await request(port, `/api/runs/${created.value.runToken}/checkpoint`, { method: 'POST', body: JSON.stringify({ floor }) })).status, 200);
        }
        return created.value.runToken;
    }));
    const conferenceState = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.ok(mixed.every(token => conferenceState.runs[token]?.completedFloor === 6));
    for (const file of [telemetryFile, `${telemetryFile}.1`]) {
        assert.ok((await stat(file)).size <= 65536, 'Telemetry rotation must bound both files');
        for (const line of (await readFile(file, 'utf8')).trim().split('\n')) JSON.parse(line);
    }

    // Static files have validators and HEAD support; private files are not served.
    const head = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.ok(head.headers.get('etag'));
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, { headers: { 'if-none-match': head.headers.get('etag') } })).status, 304);
    for (const path of ['/data/leaderboard.json', '/data/telemetry.jsonl', '/server/scoreboard-server.mjs', '/.env']) {
        assert.equal((await request(port, path)).status, 404);
    }
    assert.equal((await request(port, '/', { method: 'POST' })).status, 405);

    // A slow body is outside the write queue, so another player can still start.
    const slow = httpRequest(`http://127.0.0.1:${port}/api/runs`, { method: 'POST', signal: AbortSignal.timeout(12000) });
    const slowResponse = new Promise((resolveResponse, reject) => {
        slow.once('response', response => { response.resume(); resolveResponse(response.statusCode); });
        slow.once('error', reject);
    });
    slow.write('{');
    try {
        assert.equal((await request(port, '/api/runs', { method: 'POST', body: '{}', signal: AbortSignal.timeout(2000) })).status, 201);
        assert.equal(await slowResponse, 408, 'Unfinished upload must time out');
    } finally { slow.destroy(); }
    assert.equal((await request(port, '/api/runs', { method: 'POST', body: JSON.stringify({ sample: 'é'.repeat(40000) }) })).status, 413);
    assert.equal((await request(port, '/api/runs', { method: 'POST', body: 'null' })).status, 400);

    const goodState = await readFile(dataFile, 'utf8');
    for (const damaged of ['{broken', '{"scores":[],"runs":[]}']) {
        await writeFile(dataFile, damaged);
        assert.equal((await request(port, '/api/health')).status, 503);
        assert.equal((await request(port, '/api/scores')).status, 503);
        assert.equal((await request(port, '/api/runs', { method: 'POST', body: '{}' })).status, 503);
        assert.equal(await readFile(dataFile, 'utf8'), damaged, 'Never overwrite damaged state');
    }
    await writeFile(dataFile, goodState);
    await rename(dataFile, `${dataFile}.held`);
    await mkdir(dataFile);
    assert.equal((await request(port, '/api/health')).status, 503, 'Unreadable state must fail readiness');
    assert.equal((await request(port, '/api/runs', { method: 'POST', body: '{}' })).status, 503);
    await rm(dataFile, { recursive: true });
    await rename(`${dataFile}.held`, dataFile);
    assert.equal((await request(port, '/api/health')).status, 200);

    // Exhaust reads to verify their budget cannot consume the submission budget.
    let limited;
    for (let attempt = 0; attempt < 610; attempt++) {
        limited = await fetch(`http://127.0.0.1:${port}/api/scores`);
        await limited.arrayBuffer();
        if (limited.status === 429) break;
    }
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await request(port, '/api/scores', { method: 'POST', body: JSON.stringify({ runToken: mixed[0], name: 'CONFERENCE', score: 123 }) })).status, 201);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' })).status, 200);

    console.log('Scoreboard integration: PASS (restart persistence, 30 shared-peer visitors, isolated rate budgets, checkpoint retries, bounded telemetry rotation, static protection/cache, bounded bodies, corrupt-state preservation/readiness)');
} finally {
    if (server) await stopServer(server);
    await rm(temporary, { recursive: true, force: true });
}
