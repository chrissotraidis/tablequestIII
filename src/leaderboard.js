import { gameLog } from './logger.js';

async function api(path, options = {}, retries = 0) {
    if (!/^https?:$/.test(location.protocol)) throw new Error('Global scoreboard requires the hosted game');
    const started = performance.now();
    for (let attempt = 0; ; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let retryable = true;
        let retryDelay = 500 * (attempt + 1);
        try {
            const response = await fetch(path, {
                ...options,
                signal: controller.signal,
                headers: { 'content-type': 'application/json', ...(options.headers || {}) },
            });
            retryable = response.ok || response.status === 429 || response.status >= 500;
            if (response.status === 429) {
                const seconds = Number(response.headers.get('retry-after'));
                if (Number.isFinite(seconds) && seconds > 0) retryDelay = Math.min(seconds, 60) * 1000;
            }
            let body;
            try { body = await response.json(); }
            catch { throw new Error('Scoreboard service unavailable'); }
            if (!response.ok) throw new Error(body.error || `Scoreboard request failed (${response.status})`);
            gameLog('scoreboard.request', { path, status: response.status, ms: Math.round(performance.now() - started) });
            return body;
        } catch (error) {
            if (error.name === 'AbortError') error = new Error('Scoreboard connection timed out');
            gameLog('scoreboard.request-failed', { path, message: error.message, attempt }, 'warn');
            if (!retryable || attempt >= retries) throw error;
        } finally {
            clearTimeout(timeout);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
}

export async function loadScores() {
    const body = await api('/api/scores', {}, 1);
    return Array.isArray(body.scores) ? body.scores : [];
}

export async function startRankedRun() {
    const body = await api('/api/runs', { method: 'POST', body: '{}' });
    return body.runToken;
}

export async function checkpointRankedRun(runToken, floor) {
    if (!runToken) return false;
    await api(`/api/runs/${encodeURIComponent(runToken)}/checkpoint`, {
        method: 'POST', body: JSON.stringify({ floor }),
    }, 2); // The server accepts a repeat of the latest checkpoint.
    return true;
}

export async function submitScore(runToken, name, score) {
    return api('/api/scores', {
        method: 'POST',
        body: JSON.stringify({ runToken, name, score }),
    });
}

export function cleanPlayerName(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 10);
}
