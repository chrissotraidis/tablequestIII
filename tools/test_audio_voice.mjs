import assert from 'node:assert/strict';
import { createVoice, voiceCounts, stopVoices } from '../src/audio-voice.js';
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

const nextBus = ctx.createGain(), oldMusic = createVoice(ctx,bus), nextMusic = createVoice(ctx,nextBus), sfx = createVoice(ctx);
const oldSource = oldMusic.create('createOscillator'), nextSource = nextMusic.create('createOscillator'), effectSource = sfx.create('createOscillator');
oldMusic.finish();nextMusic.finish();sfx.finish();
stopVoices(bus);
assert.equal(oldSource.disconnected,true);
assert.equal(nextSource.disconnected,false);
assert.equal(effectSource.disconnected,false);
assert.equal(bus.disconnected,false);
assert.equal(voiceCounts(ctx).voices,2);
nextSource.listeners.ended();effectSource.listeners.ended();
assert.equal(voiceCounts(ctx).nodes,0);
console.log('Audio voice groups: PASS (old song cancelled without cutting off new song or SFX)');
