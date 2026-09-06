/**
 * M6 evidence (GOAL_LOOP M6.1–M6.4): offline renders of every instrument,
 * every song's modern orchestration, every SFX cue; a bot-fight mix log; and
 * the note-data listing for the preservation diff.
 *   node tools/audio_evidence.mjs [url] [outDir]
 * Writes JSON + 8-second WAV previews of each song into outDir.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/M6';
fs.mkdirSync(out, { recursive: true });
const systemBrowser = process.env.TQ_BROWSER_PATH || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].find(candidate => fs.existsSync(candidate));
const b = await chromium.launch({ executablePath: systemBrowser, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
await p.evaluate(() => { TQ.skipBoot(); });

// M6.1 — instrument demo render
const demo = await p.evaluate(async () => TQ.renderDemo());
fs.writeFileSync(path.join(out, 'instruments.json'), JSON.stringify(demo, null, 1));
const silent = Object.entries(demo).filter(([, v]) => v.peak < 0.01).map(([k]) => k);
console.log(`instruments: ${Object.keys(demo).length}, silent: ${silent.length ? silent.join(',') : 'none'}`);

// M6.2 — songs: note data + orchestrated previews
const dbg = await p.evaluate(() => TQ.audioDebug());
fs.writeFileSync(path.join(out, 'audio_debug.json'), JSON.stringify({ ...dbg, mixLog: undefined }, null, 1));
const notes = {};
for (const name of dbg.songs) notes[name] = await p.evaluate((n) => TQ.songData(n), name);
fs.writeFileSync(path.join(out, 'song_notes.json'), JSON.stringify(notes));
for (const name of dbg.songs) {
    const r = await p.evaluate(async (n) => TQ.renderSong(n, 8, { pcm: true }), name);
    const pcm = Buffer.from(r.pcm16, 'base64');
    fs.writeFileSync(path.join(out, `song-${name}.wav`), wav(pcm, r.rate));
    console.log(`song ${name}: peak ${r.peak} rms ${r.rms} slices ${r.slices.join(' ')}`);
}

// M6.3 — every SFX cue renders
const sfx = {};
for (const t of dbg.sfx) sfx[t] = await p.evaluate(async (t) => TQ.renderSfx(t), t);
fs.writeFileSync(path.join(out, 'sfx.json'), JSON.stringify(sfx, null, 1));
const silentSfx = Object.entries(sfx).filter(([, v]) => v.peak === 0).map(([k]) => k);
const quiet = Object.entries(sfx).filter(([, v]) => v.peak > 0 && v.peak < 0.01).map(([k]) => k);
console.log(`sfx: ${Object.keys(sfx).length}, silent: ${silentSfx.length ? silentSfx.join(',') : 'none'}, quiet: ${quiet.length ? quiet.join(',') : 'none'}`);

console.log('ERRORS', JSON.stringify(errors));
await b.close();
if (silent.length || silentSfx.length || errors.length) process.exitCode = 1;

function wav(pcm, rate) {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
    h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}
