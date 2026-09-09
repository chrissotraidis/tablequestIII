const MAX_ENTRIES = 240;
const SESSION_KEY = 'tq3d-log-tail';
const sessionId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const entries = [];
const telemetry = [];
const sessionStartedAt = performance.now();
let telemetrySending = false;
let droppedEvents = 0;
let failedSends = 0;
let lastSendError = null;
let lastSentAt = null;
export function telemetryStatus() {
    return { queued: telemetry.length, sending: telemetrySending, droppedEvents, failedSends, lastSendError, lastSentAt };
}
function boundQueue() {
    if (telemetry.length > 120) droppedEvents += telemetry.splice(0, telemetry.length - 120).length;
}
let sequence = 0;
const build = typeof __TQ_BUILD_ID__ === 'string' ? __TQ_BUILD_ID__ : 'dev';
const automated = navigator.webdriver || new URLSearchParams(location.search).has('test');
let visitorId;
try {
    visitorId = localStorage.getItem('tq3d-visitor');
    if (!/^[a-z0-9-]{8,64}$/i.test(visitorId || '')) {
        visitorId = crypto.randomUUID();
        localStorage.setItem('tq3d-visitor', visitorId);
    }
} catch { /* no stable visitor estimate when storage is unavailable */ }
let context = { state: 'boot-memory', floor: 1 };
let lastActivity = performance.now();
let activityVisible = !document.hidden;
function logActivity() {
    const now = performance.now();
    const activeMs = context.state === 'play' && activityVisible ? Math.round(now - lastActivity) : 0;
    lastActivity = now;
    activityVisible = !document.hidden;
    gameLog('session.activity', { activeMs, telemetry: telemetryStatus() });
}
export function setLogContext(next) {
    logActivity();
    context = { ...context, ...next };
}

function safeData(data) {
    try { return JSON.parse(JSON.stringify(data ?? {})); }
    catch { return { note: String(data) }; }
}

export function gameLog(event, data = {}, level = 'info') {
    const entry = {
        seq: ++sequence,
        at: new Date().toISOString(),
        sessionId,
        elapsedMs: Math.round(performance.now() - sessionStartedAt),
        level,
        event,
        data: safeData({ ...context, gameState: context.state, ...data }),
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(entries.slice(-80))); } catch { /* storage may be disabled */ }
    telemetry.push({ seq: entry.seq, at: entry.at, elapsedMs: entry.elapsedMs, level, event, data: entry.data });
    boundQueue();
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`[TQ] ${event}`, entry.data);
    if (level === 'error' || level === 'warn') queueMicrotask(() => flushTelemetry());
    return entry;
}

export function getGameLogs() { return entries.map(entry => ({ ...entry, data: safeData(entry.data) })); }

function telemetryPayload(events) {
    return JSON.stringify({
        sessionId,
        client: {
            visitorId, build, automated,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            platform: navigator.userAgentData?.platform || navigator.platform || 'unknown',
            browser: navigator.userAgent.slice(0, 180),
        },
        events,
    });
}

/** Send anonymous technical/session events to the same-origin VPS service. */
export async function flushTelemetry({ beacon = false } = {}) {
    if (!telemetry.length || (telemetrySending && !beacon) || !/^https?:$/.test(location.protocol)) return false;
    // Stay below both the server body limit and the browser keepalive budget.
    const batch = [];
    let bytes = 0;
    while (telemetry.length && batch.length < 40) {
        const event = telemetry[0];
        if (JSON.stringify(event.data).length > 4096) event.data = { note: 'Event data exceeded 4096 characters', floor: event.data.floor, state: event.data.state };
        const size = new TextEncoder().encode(JSON.stringify(event)).length;
        if (batch.length && bytes + size > 48000) break;
        batch.push(telemetry.shift()); bytes += size;
    }
    const payload = telemetryPayload(batch);
    if (beacon && navigator.sendBeacon) {
        const sent = navigator.sendBeacon('/api/telemetry', new Blob([payload], { type: 'application/json' }));
        if (!sent) { telemetry.unshift(...batch); boundQueue(); }
        return sent;
    }
    telemetrySending = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch('/api/telemetry', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true, signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        lastSentAt = new Date().toISOString(); lastSendError = null;
        return true;
    } catch (error) {
        failedSends++;
        lastSendError = controller.signal.aborted ? 'timeout' : String(error.message || error).slice(0, 160);
        telemetry.unshift(...batch);
        boundQueue();
        return false;
    } finally {
        clearTimeout(deadline);
        telemetrySending = false;
    }
}

export function downloadGameLogs() {
    const blob = new Blob([JSON.stringify({ sessionId, build, telemetry: telemetryStatus(), entries }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tablequest-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function installErrorLogging() {
    window.addEventListener('error', event => gameLog('runtime.error', {
        message: event.message,
        source: event.filename?.split('/').pop(),
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack?.slice(0, 2000),
    }, 'error'));
    window.addEventListener('unhandledrejection', event => gameLog('runtime.unhandled-rejection', {
        reason: event.reason?.message || String(event.reason),
        stack: event.reason?.stack?.slice(0, 2000),
    }, 'error'));
}

gameLog('session.started', { userAgent: navigator.userAgent, viewport: [window.innerWidth, window.innerHeight] });
setInterval(() => { logActivity(); flushTelemetry(); }, 15000);
document.addEventListener('visibilitychange', () => { logActivity(); flushTelemetry({ beacon: document.hidden }); });
window.addEventListener('pagehide', () => {
    logActivity();
    gameLog('session.ended', { durationMs: Math.round(performance.now() - sessionStartedAt) });
    flushTelemetry({ beacon: true });
});
