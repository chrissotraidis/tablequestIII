import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const listeners = {}, sent = [];
let mode = 'hang', nextTimer = 0;
const timers = new Map();
const sandbox = {
    performance: { now: () => 1000 }, crypto: { randomUUID: () => 'test-session-id' },
    navigator: { language: 'en', userAgent: 'test', webdriver: true }, location: { protocol: 'https:', search: '' },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { setItem() {} },
    document: { hidden: false, addEventListener() {} }, window: { addEventListener: (name, fn) => listeners[name] = fn },
    console: { info() {}, warn() {}, error() {} }, URLSearchParams, TextEncoder, AbortController, Intl, Date, JSON, Blob,
    setInterval() {}, queueMicrotask() {}, clearTimeout: id => timers.delete(id),
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    fetch: async (_, options) => {
        sent.push(JSON.parse(options.body));
        if (mode === 'hang') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted'))));
        return { ok: true };
    },
};
const source = readFileSync(new URL('../src/logger.js', import.meta.url), 'utf8').replace(/export /g, '');
const api = runInNewContext(source + '\n({ gameLog, flushTelemetry, telemetryStatus, installErrorLogging, getGameLogs, setLogContext })', sandbox);
const stalled = api.flushTelemetry();
assert.equal(api.telemetryStatus().sending, true);
[...timers.values()].find(t => t.ms === 8000).fn();
assert.equal(await stalled, false);
assert.equal(api.telemetryStatus().sending, false); assert.equal(api.telemetryStatus().lastSendError, 'timeout');
mode = 'ok'; assert.equal(await api.flushTelemetry(), true);
assert.equal(sent[0].events[0].seq, sent[1].events[0].seq, 'timed-out batch remains retryable with stable sequence IDs');
api.setLogContext({ state: 'pause', floor: 2 });
api.installErrorLogging();
listeners.error({ message: 'fixture', error: Error('fixture'), filename: 'http://localhost/game.js', lineno: 2, colno: 3 });
const entry = api.getGameLogs().at(-1);
assert.ok(entry.data.stack.includes('fixture')); assert.equal(entry.data.floor, 2); assert.equal(entry.data.gameState, 'pause');
for (let i = 0; i < 140; i++) api.gameLog('fixture');
assert.equal(api.telemetryStatus().queued, 120); assert.ok(api.telemetryStatus().droppedEvents >= 20);
assert.ok(api.getGameLogs().length <= 240);
console.log('Logger: PASS (hung upload timeout, retry identity, stack/floor/game state, bounded queue and drop reporting)');
