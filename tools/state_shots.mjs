/**
 * End-of-floor screens (Round 13 R2): floor transition card, game over, victory + credits.
 *   node tools/state_shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/R1/states';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', name); };
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
// 1. transition card: clear Floor 1 and ride the elevator
const st = await p.evaluate(async () => { const st0 = window.setTimeout; window.setTimeout = (fn, ms, ...a) => st0(fn, ms >= 2000 ? 15000 : ms, ...a); TQ.skipBoot(); TQ.startGameAt(0); TQ.godmode(true); TQ.collectAllTables(); TQ.killAll(); TQ.warpElevator(); await TQ.settle(2); window.setTimeout = st0; return TQ.state; }); // the card normally lasts 2.4 s wall time; stretched so the screenshot can catch it
console.log('state', st); await shot('transition');
await p.waitForFunction(() => TQ.state === 'loading' || TQ.state === 'play', null, { polling: 200, timeout: 30000 }); await p.evaluate(() => TQ.settle(1));
await shot('transition-next-loading');
// 2. game over: take a fatal hit on Floor 1
await p.evaluate(() => { TQ.setState('menu'); TQ.startGameAt(0); TQ.godmode(false); const g = TQ.game; g.player.health = 5; g.hurtPlayer(50, g.player.x + 1, g.player.y); });
await p.waitForFunction(() => TQ.state === 'gameover', null, { polling: 200, timeout: 30000 }); await p.evaluate(() => TQ.settle(2));
await shot('gameover');
// 3. victory: kill the Head Designer
await p.evaluate(() => { TQ.setState('menu'); TQ.startGameAt(5); TQ.godmode(true); TQ.killAll(); });
await p.waitForFunction(() => TQ.state === 'victory', null, { polling: 200, timeout: 60000 }); await p.evaluate(() => TQ.settle(2));
await shot('victory');
await p.waitForTimeout(6000); await shot('victory-credits');
console.log('ERRORS', JSON.stringify(errors));
await b.close();
