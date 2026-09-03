/**
 * Front-end screenshots (Round 2 R1/R2): menu, sub-screens, crawl at several
 * moments, loading card, bench HUD at two sizes.
 *   node modern/tools/frontend_shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'modern/docs/R1';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log('shot', name); };
await p.evaluate(() => TQ.skipBoot()); await p.waitForTimeout(1500);
await shot('menu');
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(300); await shot('menu-floor-select-item');
await p.keyboard.press('Enter'); await p.waitForTimeout(1200); await shot('floor-select');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(800); await shot('options');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(200);
await p.keyboard.press('Enter'); // New Game → crawl
for (const t of [2.5, 9, 20, 33, 46, 55.2]) {
    const now = await p.evaluate(() => TQ.introT?.() ?? -1);
    await p.waitForTimeout(Math.max(0, (t - now) * 1000));
    await shot(`crawl-${String(t).replace('.', '_')}s`);
}
await p.waitForTimeout(2500);
console.log('state after crawl:', await p.evaluate(() => TQ.state));
await shot('loading-card');
console.log('ERRORS', JSON.stringify(errors));
await b.close();
