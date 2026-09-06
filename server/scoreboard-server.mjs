import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, stat, appendFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const publicRoot = resolve(root, 'dist');
const port = Number(process.env.PORT || process.argv.find(v => v.startsWith('--port='))?.split('=')[1] || 4176);
const host = process.env.HOST || '127.0.0.1';
const dataFile = resolve(process.env.TQ_DATA_FILE || join(root, 'data', 'leaderboard.json'));
const telemetryFile = resolve(process.env.TQ_TELEMETRY_FILE || join(dirname(dataFile), 'telemetry.jsonl'));
const telemetryIpSalt = process.env.TQ_TELEMETRY_IP_SALT || '';
const MAX_SCORE = 10_000_000;
const MAX_RUN_AGE = 24 * 60 * 60 * 1000;
const rates = new Map();

function log(event, data = {}) { console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data })); }
function cleanName(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 10); }
function json(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
}
async function body(req) {
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 64 * 1024) throw new Error('Request too large');
    }
    return raw ? JSON.parse(raw) : {};
}
function telemetryClient(req, input) {
    const countryHeader = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').toUpperCase();
    const country = /^[A-Z]{2}$/.test(countryHeader) ? countryHeader : undefined;
    const ip = req.socket.remoteAddress || '';
    const networkId = telemetryIpSalt && ip
        ? createHash('sha256').update(`${telemetryIpSalt}:${ip}`).digest('hex').slice(0, 16)
        : undefined;
    const client = input && typeof input === 'object' ? input : {};
    return {
        visitorId: /^[a-z0-9-]{8,64}$/i.test(client.visitorId || '') ? client.visitorId : undefined,
        build: String(client.build || 'unknown').slice(0, 64),
        automated: client.automated === true,
        language: String(client.language || '').slice(0, 24),
        timezone: String(client.timezone || '').slice(0, 64),
        platform: String(client.platform || '').slice(0, 48),
        browser: String(client.browser || '').slice(0, 180),
        ...(country ? { country } : {}),
        ...(networkId ? { networkId } : {}),
    };
}
function cleanTelemetryEvents(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 50).flatMap(raw => {
        const event = String(raw?.event || '').slice(0, 64);
        if (!/^[a-z0-9._-]+$/i.test(event)) return [];
        let data = {};
        try {
            const encoded = JSON.stringify(raw.data ?? {});
            if (encoded.length <= 4096) data = JSON.parse(encoded);
        } catch { /* malformed event data is dropped */ }
        return [{
            seq: Number.isSafeInteger(raw.seq) && raw.seq > 0 ? raw.seq : undefined,
            at: String(raw.at || '').slice(0, 30),
            elapsedMs: Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(raw.elapsedMs) || 0)),
            level: ['info', 'warn', 'error'].includes(raw.level) ? raw.level : 'info',
            event,
            data,
        }];
    });
}
async function loadState() {
    try {
        const parsed = JSON.parse(await readFile(dataFile, 'utf8'));
        return { scores: Array.isArray(parsed.scores) ? parsed.scores : [], runs: parsed.runs && typeof parsed.runs === 'object' ? parsed.runs : {} };
    } catch (error) {
        if (error.code !== 'ENOENT') log('state.read-failed', { message: error.message });
        return { scores: [], runs: {} };
    }
}
async function saveState(state) {
    await mkdir(dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, dataFile);
}
function pruneRuns(state) {
    const cutoff = Date.now() - MAX_RUN_AGE;
    for (const [token, run] of Object.entries(state.runs)) if (run.startedAt < cutoff || run.submitted) delete state.runs[token];
}
function allowed(req) {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rates.get(ip) || { start: now, count: 0 };
    if (now - record.start > 60_000) { record.start = now; record.count = 0; }
    record.count += 1; rates.set(ip, record);
    return record.count <= 90;
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

async function serveStatic(req, res, pathname) {
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(publicRoot, `.${normalize(requested)}`);
    if (file !== publicRoot && !file.startsWith(`${publicRoot}/`)) return json(res, 403, { error: 'Forbidden' });
    try {
        const info = await stat(file);
        if (!info.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
        res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'content-length': info.size });
        createReadStream(file).pipe(res);
    } catch (error) {
        if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
        json(res, 500, { error: 'Server error' });
    }
}

async function handleRequest(req, res) {
    const started = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    res.on('finish', () => log('http.request', { method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - started }));
    if (!allowed(req)) return json(res, 429, { error: 'Too many requests' });
    try {
        if (req.method === 'GET' && url.pathname === '/api/health') {
            return json(res, 200, { ok: true, persistence: true, telemetry: true });
        }
        if (req.method === 'POST' && url.pathname === '/api/telemetry') {
            const input = await body(req);
            const sessionId = String(input.sessionId || '').slice(0, 64);
            const events = cleanTelemetryEvents(input.events);
            if (!/^[a-z0-9-]{8,64}$/i.test(sessionId) || !events.length) return json(res, 400, { error: 'Invalid telemetry batch' });
            await mkdir(dirname(telemetryFile), { recursive: true });
            await appendFile(telemetryFile, `${JSON.stringify({ receivedAt: new Date().toISOString(), sessionId, client: telemetryClient(req, input.client), events })}\n`);
            return json(res, 202, { accepted: events.length });
        }
        if (req.method === 'GET' && url.pathname === '/api/scores') {
            const state = await loadState();
            return json(res, 200, { scores: state.scores.slice(0, 20) });
        }
        if (req.method === 'POST' && url.pathname === '/api/runs') {
            const state = await loadState(); pruneRuns(state);
            const runToken = randomUUID();
            state.runs[runToken] = { startedAt: Date.now(), completedFloor: 0, submitted: false };
            await saveState(state);
            return json(res, 201, { runToken });
        }
        const checkpoint = url.pathname.match(/^\/api\/runs\/([0-9a-f-]+)\/checkpoint$/i);
        if (req.method === 'POST' && checkpoint) {
            const input = await body(req), floor = Number(input.floor);
            const state = await loadState(), run = state.runs[checkpoint[1]];
            if (!run || Date.now() - run.startedAt > MAX_RUN_AGE) return json(res, 404, { error: 'Ranked run expired' });
            if (!Number.isInteger(floor) || floor !== run.completedFloor + 1 || floor > 6) return json(res, 409, { error: 'Invalid floor sequence' });
            run.completedFloor = floor; await saveState(state);
            return json(res, 200, { completedFloor: floor });
        }
        if (req.method === 'POST' && url.pathname === '/api/scores') {
            const input = await body(req), name = cleanName(input.name), score = Number(input.score);
            if (!name) return json(res, 400, { error: 'Enter a name' });
            if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) return json(res, 400, { error: 'Invalid score' });
            const state = await loadState(), run = state.runs[String(input.runToken || '')];
            if (!run || run.submitted || run.completedFloor !== 6 || Date.now() - run.startedAt > MAX_RUN_AGE) return json(res, 403, { error: 'Only completed New Game runs can be ranked' });
            run.submitted = true;
            const entry = { id: randomUUID(), name, score, createdAt: new Date().toISOString() };
            state.scores.push(entry);
            state.scores.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
            state.scores = state.scores.slice(0, 20);
            pruneRuns(state); await saveState(state);
            return json(res, 201, { entry, rank: state.scores.findIndex(item => item.id === entry.id) + 1, scores: state.scores });
        }
        if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
        return serveStatic(req, res, url.pathname);
    } catch (error) {
        log('request.failed', { method: req.method, path: url.pathname, message: error.message });
        return json(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'Invalid JSON' : 'Server error' });
    }
}

// File-backed read/modify/write transactions must not overlap: concurrent
// runs otherwise overwrite each other and race on the same temporary file.
let writes = Promise.resolve();
export function handleScoreboardRequest(req, res) {
    if (req.method === 'POST' && /^\/api\/(runs|scores)(\/|\?|$)/.test(req.url)) {
        const request = writes.then(() => handleRequest(req, res));
        writes = request.catch(() => {});
        return request;
    }
    return handleRequest(req, res);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    createServer(handleScoreboardRequest).listen(port, host, () => log('server.started', { url: `http://${host}:${port}`, dataFile, telemetryFile }));
}
