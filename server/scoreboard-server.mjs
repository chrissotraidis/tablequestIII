import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, stat, appendFile, rm, access } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
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
const MAX_RATE_KEYS = 4096;
const BODY_LIMIT = 64 * 1024;
const BODY_TIMEOUT_MS = 10_000;
const telemetryMaxBytes = Number(process.env.TQ_TELEMETRY_MAX_BYTES || 16 * 1024 * 1024);
if (!Number.isSafeInteger(telemetryMaxBytes) || telemetryMaxBytes < BODY_LIMIT) {
    throw new Error('TQ_TELEMETRY_MAX_BYTES must be an integer of at least 65536');
}
if (dataFile === telemetryFile || dataFile === `${telemetryFile}.1` || dataFile === publicRoot || telemetryFile === publicRoot || dataFile.startsWith(`${publicRoot}/`) || telemetryFile.startsWith(`${publicRoot}/`)) {
    throw new Error('Scoreboard and telemetry must use separate files outside dist');
}
function failure(status, message) { return Object.assign(new Error(message), { status }); }
function serialized() {
    let pending = Promise.resolve();
    return operation => {
        const result = pending.then(operation);
        pending = result.catch(() => {});
        return result;
    };
}
const stateWrite = serialized();
const telemetryWrite = serialized();

function log(event, data = {}) { console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data })); }
function cleanName(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 10); }
function json(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
}
function body(req) {
    // Read before joining a storage queue, so a slow upload cannot block other players.
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        let bytes = 0;
        let finished = false;
        const timer = setTimeout(() => finish(failure(408, 'Request body timed out')), BODY_TIMEOUT_MS);
        function finish(error, value) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            if (!error) req.removeListener('error', onError);
            req.removeListener('aborted', onAborted);
            if (error) { req.resume(); reject(error); }
            else resolveBody(value);
        }
        function onData(chunk) {
            bytes += chunk.length;
            if (bytes > BODY_LIMIT) return finish(failure(413, 'Request too large'));
            chunks.push(chunk);
        }
        function onEnd() {
            try {
                const input = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
                if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure(400, 'Expected a JSON object');
                finish(null, input);
            } catch (error) { finish(error instanceof SyntaxError ? failure(400, 'Invalid JSON') : error); }
        }
        function onError(error) { finish(error); }
        function onAborted() { finish(failure(400, 'Request aborted')); }
        req.on('data', onData);
        req.on('end', onEnd);
        req.once('error', onError);
        req.on('aborted', onAborted);
    });
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
        if (!parsed || !Array.isArray(parsed.scores) || !parsed.runs || typeof parsed.runs !== 'object' || Array.isArray(parsed.runs)
            || parsed.scores.some(score => !score || typeof score.id !== 'string' || typeof score.name !== 'string'
                || !Number.isSafeInteger(score.score) || score.score < 0 || score.score > MAX_SCORE
                || typeof score.createdAt !== 'string' || !Number.isFinite(Date.parse(score.createdAt)))
            || Object.values(parsed.runs).some(run => !run || !Number.isFinite(run.startedAt)
                || !Number.isInteger(run.completedFloor) || run.completedFloor < 0 || run.completedFloor > 6 || typeof run.submitted !== 'boolean')) {
            throw new Error('Invalid scoreboard state');
        }
        return parsed;
    } catch (error) {
        if (error.code === 'ENOENT') return { scores: [], runs: {} };
        log('state.read-failed', { message: error.message });
        throw failure(503, 'Scoreboard storage unavailable');
    }
}
async function saveState(state) {
    await mkdir(dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.tmp`;
    try {
        await writeFile(tmp, JSON.stringify(state, null, 2));
        await rename(tmp, dataFile);
    } finally { await rm(tmp, { force: true }).catch(() => {}); }
}
async function checkStorage(file) {
    await mkdir(dirname(file), { recursive: true });
    try {
        if (!(await stat(file)).isFile()) throw new Error('Storage path must be a file');
        await access(file, constants.W_OK);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const probe = join(dirname(file), `.tablequest-readiness-${randomUUID()}`);
    try { await writeFile(probe, 'ready\n', { flag: 'wx' }); }
    finally { await rm(probe, { force: true }); }
}
async function appendTelemetry(record) {
    if (Buffer.byteLength(record) > telemetryMaxBytes) throw failure(413, 'Telemetry record too large');
    return telemetryWrite(async () => {
        await mkdir(dirname(telemetryFile), { recursive: true });
        let size = 0;
        try { size = (await stat(telemetryFile)).size; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (size && size + Buffer.byteLength(record) > telemetryMaxBytes) await rename(telemetryFile, `${telemetryFile}.1`);
        await appendFile(telemetryFile, record);
    });
}
function pruneRuns(state) {
    const cutoff = Date.now() - MAX_RUN_AGE;
    for (const [token, run] of Object.entries(state.runs)) if (run.startedAt < cutoff || run.submitted) delete state.runs[token];
}
function allowed(req, pathname) {
    // Deliberately use the socket peer, never unverified forwarded IP headers.
    // Budgets allow a conference behind one NAT/proxy and keep telemetry separate.
    let bucket, limit;
    if (!pathname.startsWith('/api/')) return true;
    if (req.method === 'GET') { bucket = 'read'; limit = 600; }
    else if (pathname === '/api/telemetry') { bucket = 'telemetry'; limit = 600; }
    else if (pathname === '/api/runs') { bucket = 'starts'; limit = 180; }
    else if (/^\/api\/runs\/[^/]+\/checkpoint$/.test(pathname)) { bucket = 'checkpoints'; limit = 600; }
    else if (pathname === '/api/scores') { bucket = 'scores'; limit = 180; }
    else { bucket = 'other'; limit = 120; }
    const key = `${req.socket.remoteAddress || 'unknown'}:${bucket}`;
    const now = Date.now();
    let record = rates.get(key);
    if (!record || now - record.start >= 60_000) {
        for (const [oldKey, old] of rates) if (now - old.start >= 60_000) rates.delete(oldKey);
        // Do not evict an active limit: excess unknown peers wait for a window to expire.
        if (!rates.has(key) && rates.size >= MAX_RATE_KEYS) return false;
        record = { start: now, count: 0 };
        rates.set(key, record);
    }
    return ++record.count <= limit;
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

async function serveStatic(req, res, pathname) {
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(publicRoot, `.${normalize(requested)}`);
    if (file !== publicRoot && !file.startsWith(`${publicRoot}/`)) return json(res, 403, { error: 'Forbidden' });
    try {
        const info = await stat(file);
        if (!info.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
        const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
        const headers = { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', etag };
        if (String(req.headers['if-none-match'] || '').split(',').map(value => value.trim()).some(value => value === '*' || value === etag)) {
            res.writeHead(304, headers); return res.end();
        }
        res.writeHead(200, { ...headers, 'content-length': info.size });
        if (req.method === 'HEAD') return res.end();
        createReadStream(file).on('error', error => res.destroy(error)).pipe(res);
    } catch (error) {
        if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
        json(res, 500, { error: 'Server error' });
    }
}

async function handleRequest(req, res, url, input) {
    if (req.method === 'GET' && url.pathname === '/api/health') {
        try {
            await loadState();
            await checkStorage(dataFile);
            await checkStorage(telemetryFile);
            return json(res, 200, { ok: true, persistence: true, telemetry: true });
        } catch (error) {
            log('readiness.failed', { message: error.message });
            return json(res, 503, { ok: false, error: 'Storage unavailable' });
        }
    }
    if (req.method === 'POST' && url.pathname === '/api/telemetry') {
        const sessionId = String(input.sessionId || '').slice(0, 64);
        const events = cleanTelemetryEvents(input.events);
        if (!/^[a-z0-9-]{8,64}$/i.test(sessionId) || !events.length) return json(res, 400, { error: 'Invalid telemetry batch' });
        await appendTelemetry(`${JSON.stringify({ receivedAt: new Date().toISOString(), sessionId, client: telemetryClient(req, input.client), events })}\n`);
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
        const floor = Number(input.floor);
        const state = await loadState(), run = state.runs[checkpoint[1]];
        if (!run || Date.now() - run.startedAt > MAX_RUN_AGE) return json(res, 404, { error: 'Ranked run expired' });
        if (Number.isInteger(floor) && floor >= 1 && floor === run.completedFloor) return json(res, 200, { completedFloor: floor });
        if (!Number.isInteger(floor) || floor !== run.completedFloor + 1 || floor > 6) return json(res, 409, { error: 'Invalid floor sequence' });
        run.completedFloor = floor; await saveState(state);
        return json(res, 200, { completedFloor: floor });
    }
    if (req.method === 'POST' && url.pathname === '/api/scores') {
        const name = cleanName(input.name), score = Number(input.score);
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
    if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('allow', 'GET, HEAD');
        return json(res, 405, { error: 'Method not allowed' });
    }
    return serveStatic(req, res, url.pathname);
}

export async function handleScoreboardRequest(req, res) {
    const started = Date.now();
    let url;
    try {
        url = new URL(req.url, 'http://localhost');
        res.on('finish', () => log('http.request', { method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - started }));
        if (!allowed(req, url.pathname)) {
            res.setHeader('retry-after', '60');
            return json(res, 429, { error: 'Too many requests' });
        }
        const input = req.method === 'POST' && url.pathname.startsWith('/api/') ? await body(req) : {};
        if (req.method === 'POST' && /^\/api\/(runs|scores)(\/|$)/.test(url.pathname)) {
            return await stateWrite(() => handleRequest(req, res, url, input));
        }
        return await handleRequest(req, res, url, input);
    } catch (error) {
        log('request.failed', { method: req.method, path: url?.pathname, message: error.message });
        if (res.destroyed || res.headersSent) return;
        const status = error.status || 500;
        if (status === 408 || status === 413) res.setHeader('connection', 'close');
        return json(res, status, { error: error.status ? error.message : 'Server error' });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    createServer(handleScoreboardRequest).listen(port, host, () => log('server.started', { url: `http://${host}:${port}`, dataFile, telemetryFile }));
}
