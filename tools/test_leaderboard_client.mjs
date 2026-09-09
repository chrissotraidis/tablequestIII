// Exercise the real HTTP client with a fake transport, without booting WebGL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = (await readFile(new URL('../src/leaderboard.js', import.meta.url), 'utf8'))
    .replace("import { gameLog } from './logger.js';", 'const gameLog = () => {};');
const client = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
globalThis.location = { protocol: 'https:' };
const realTimeout = globalThis.setTimeout;
const delays = [];
// Advance retry delays and the request deadline quickly, preserving abort behavior.
globalThis.setTimeout = (callback, ms, ...args) => { delays.push(ms); return realTimeout(callback, ms === 8000 ? 20 : 1, ...args); };
let calls = [];
function transport(replies) {
    calls = [];
    globalThis.fetch = async (path, options) => {
        calls.push({ path, options });
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        if (typeof reply === 'function') return reply(options);
        assert.ok(reply, 'unexpected extra HTTP attempt');
        return new Response(JSON.stringify(reply.body), { status: reply.status, headers: reply.headers });
    };
}
try {
    transport([{ status: 503, body: {} }, { status: 200, body: { scores: [{ name: 'CHRIS', score: 100 }] } }]);
    assert.equal((await client.loadScores())[0].score, 100);
    assert.equal(calls.length, 2);

    transport([new TypeError('network lost'), { status: 200, body: { completedFloor: 1 } }]);
    assert.equal(await client.checkpointRankedRun('test-token', 1), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.body, calls[1].options.body, 'retry keeps the same checkpoint');

    transport([{ status: 429, body: {}, headers: { 'retry-after': '60' } }, { status: 200, body: { completedFloor: 1 } }]);
    await client.checkpointRankedRun('test-token', 1);
    assert.ok(delays.includes(60000), 'rate-limit retry honors the server recovery window');

    transport([{ status: 409, body: { error: 'Invalid floor sequence' } }]);
    await assert.rejects(client.checkpointRankedRun('test-token', 3), /Invalid floor sequence/);
    assert.equal(calls.length, 1, 'validation failures do not retry');

    transport(Array.from({ length: 3 }, () => new TypeError('network lost')));
    await assert.rejects(client.checkpointRankedRun('test-token', 1), /network lost/);
    assert.equal(calls.length, 3, 'checkpoint retries are bounded');

    for (const action of [() => client.startRankedRun(), () => client.submitScore('test-token', 'CHRIS', 100)]) {
        transport([new TypeError('response lost')]);
        await assert.rejects(action(), /response lost/);
        assert.equal(calls.length, 1, 'non-idempotent POST is never automatically repeated');
    }

    const stalled = ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    transport([stalled, stalled]);
    await assert.rejects(client.loadScores(), /connection timed out/);
    assert.equal(calls.length, 2, 'stalled requests abort and exhaust a bounded retry');

    location.protocol = 'file:';
    transport([]);
    await assert.rejects(client.loadScores(), /requires the hosted game/);
    assert.equal(calls.length, 0, 'offline play never sends score requests');

    // Run the real victory handler in isolation: a late response must belong
    // to the run that submitted it, even after another game has begun.
    const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
    const handlerSource = main.slice(main.indexOf("$('victory-score-form').addEventListener('submit'"), main.indexOf('// ------------------------------------------------------------------ INPUT'));
    let handler, finishCheckpoint;
    const run = { eligible: true, queue: new Promise(resolve => { finishCheckpoint = resolve; }) };
    const nodes = {
        'victory-score-form': { addEventListener: (_, callback) => { handler = callback; } },
        'victory-name': { value: 'CHRIS' }, 'btn-submit-score': {}, 'victory-submit-status': {},
    };
    const submitted = [];
    const context = {
        $: id => nodes[id], rankedRun: run, game: { player: { score: 12345 } }, state: 'victory',
        cleanPlayerName: client.cleanPlayerName, localStorage: { setItem() {} }, gameLog() {},
        submitScore: async (...args) => { submitted.push(args); return { rank: 1 }; },
    };
    runInNewContext(handlerSource, context);
    const pending = handler({ preventDefault() {} });
    await handler({ preventDefault() {} }); // Repeated form activation while waiting.
    const nextRun = { eligible: true };
    context.rankedRun = nextRun;
    context.game.player.score = 999;
    nodes['victory-submit-status'].textContent = 'NEW SCREEN';
    finishCheckpoint('old-token');
    await pending;
    assert.deepEqual(submitted, [['old-token', 'CHRIS', 12345]]);
    assert.equal(run.submitted, true);
    assert.equal(nextRun.submitted, undefined, 'late submission cannot mark another run submitted');
    assert.equal(nodes['victory-submit-status'].textContent, 'NEW SCREEN', 'late result cannot overwrite another screen');
    console.log('Leaderboard client: PASS (transient recovery, bounded timeouts/retries, validation, unsafe POST protection, offline mode)');
} finally {
    globalThis.setTimeout = realTimeout;
}
