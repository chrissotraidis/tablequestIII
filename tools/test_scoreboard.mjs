import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
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
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TQ_DATA_FILE: dataFile, TQ_TELEMETRY_FILE: telemetryFile },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
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

    console.log('Scoreboard integration: PASS (eligible submission, restart persistence, forged-score rejection, anonymous telemetry)');
} finally {
    if (server) await stopServer(server);
    await rm(temporary, { recursive: true, force: true });
}
