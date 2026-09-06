import { gameLog } from './logger.js';

async function api(path, options = {}) {
    if (!/^https?:$/.test(location.protocol)) throw new Error('Global scoreboard requires the hosted game');
    const started = performance.now();
    try {
        const response = await fetch(path, {
            ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        });
        let body;
        try { body = await response.json(); }
        catch { throw new Error('Scoreboard service unavailable'); }
        if (!response.ok) throw new Error(body.error || `Scoreboard request failed (${response.status})`);
        gameLog('scoreboard.request', { path, status: response.status, ms: Math.round(performance.now() - started) });
        return body;
    } catch (error) {
        gameLog('scoreboard.request-failed', { path, message: error.message }, 'warn');
        throw error;
    }
}

export async function loadScores() {
    const body = await api('/api/scores');
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
    });
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
