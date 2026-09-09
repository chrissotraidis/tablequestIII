import assert from 'node:assert/strict';
import { createVoice, voiceCounts } from '../src/audio-voice.js';
const nodes = [];
const ctx = { createGain: make, createOscillator: () => Object.assign(make(), { start() {}, stop() {} }) };
function make() { const n = { disconnected: false, listeners: {}, disconnect() { this.disconnected = true; }, addEventListener(e, fn) { this.listeners[e] = fn; } }; nodes.push(n); return n; }
const bus = ctx.createGain(), voice = createVoice(ctx);
const a = voice.create('createOscillator'), b = voice.create('createOscillator'), effect = voice.create('createGain');
voice.finish();
assert.deepEqual(voiceCounts(ctx), { voices: 1, nodes: 3 });
a.listeners.ended(); assert.equal(effect.disconnected, false, 'do not cut off another source in the same sound');
b.listeners.ended();
assert.ok([a, b, effect].every(n => n.disconnected)); assert.equal(bus.disconnected, false, 'shared buses survive voice disposal');
assert.deepEqual(voiceCounts(ctx), { voices: 0, nodes: 0 });
const failed = createVoice(ctx); const partial = failed.create('createGain'); failed.cancel(); failed.cancel();
assert.equal(partial.disconnected, true); assert.deepEqual(voiceCounts(ctx), { voices: 0, nodes: 0 });
console.log('Audio voice: PASS (all sources finish, shared bus retained, partial failure cleanup, idempotent disposal)');
