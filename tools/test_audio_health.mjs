import assert from 'node:assert/strict';
import { playbackHealth, audioProgress } from '../src/audio-health.js';
assert.deepEqual(playbackHealth(null), { playback: null, outputTimestamp: null });
const absent = playbackHealth({ sampleRate: 48000 });
assert.equal(absent.playback, null); assert.equal(absent.outputTimestamp, null);
const stats = { underrunDuration: 12.34567, underrunEvents: 30, totalDuration: 40, averageLatency: .02, minimumLatency: .01, maximumLatency: .04 };
const output = playbackHealth({ playbackStats: stats, sampleRate: 48000, getOutputTimestamp: () => ({ contextTime: 20, performanceTime: 990 }) }, 1000);
assert.equal(output.playback.underrunDuration, 12.3457); assert.equal(output.outputTimestamp.ageMs, 10);
assert.equal(playbackHealth({ get playbackStats() { throw Error('blocked'); }, getOutputTimestamp() { throw Error('unsupported'); } }).playback, null);
const before = { at: 1000, generation: 1, hidden: false, state: 'running', contextTime: 10, playback: stats };
const healthy = { ...before, at: 2000, contextTime: 11 };
assert.equal(audioProgress(before, healthy).stalled, false);
assert.equal(audioProgress(before, { ...healthy, contextTime: 10 }).stalled, true);
for (const variation of [{ hidden: true }, { generation: 2 }, { state: 'suspended' }, { at: 6000 }]) {
    assert.equal(audioProgress(before, { ...before, at: 2000, ...variation }).stalled, false);
}
assert.equal(audioProgress({ ...before, outputTimestamp: { contextTime: 9 } }, { ...healthy, outputTimestamp: { contextTime: 9, ageMs: 4000 } }).stalled, true);
const delta = audioProgress(before, { ...healthy, playback: { ...stats, underrunDuration: 13.34567, underrunEvents: 35 } });
assert.equal(delta.underrunSeconds, 1); assert.equal(delta.underrunEvents, 5);
console.log('Audio health: PASS (optional/restricted APIs, device counters, clock stalls, background/resume/context replacement)');
