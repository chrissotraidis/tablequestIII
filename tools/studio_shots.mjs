/**
 * Studio critique sheets (Round 4 H3.1): each tool framed large in five poses.
 *   node tools/studio_shots.mjs [url] [outDir] [keys...]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/H3/pass1';
const keys = process.argv.slice(4).length ? process.argv.slice(4) : ['paintbrush', 'tableLeg', 'nailgun', 'roller', 'sprayer'];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { TQ.skipBoot(); TQ.startGameAt(0); TQ.giveAll(); TQ.godmode(true); TQ.teleport(15, 9); TQ.player.rot = -1.57; TQ.game.pitch = 0; TQ.hud.hide(); document.getElementById('crosshair').classList.add('hidden'); });
await p.evaluate(() => { const g = TQ.game, w = g.world, p2 = g.player; for (let k = 0; k < 8; k++) { const rot = -1.57 + k * Math.PI / 4; let clear = true; for (let d = 1; d <= 3; d++) if (w.isSolidCell(Math.floor(p2.x + Math.cos(rot) * d), Math.floor(p2.y + Math.sin(rot) * d))) clear = false; if (clear) { p2.rot = rot; break; } } }); // face a clear direction so wall-clip avoidance stays out of the shots
await p.waitForTimeout(1200);
for (const k of keys) {
    for (const pose of (process.env.POSES ? process.env.POSES.split(',') : ['hip', 'ads', 'fire', 'sprint', 'inspect'])) {
        await p.evaluate(({ k, pose }) => TQ.vmStudio(k, pose), { k, pose });
        await p.waitForTimeout(pose === 'fire' ? 120 : 900);
        await p.screenshot({ path: `${out}/${k}-${pose}.jpg`, type: 'jpeg', quality: 86, clip: { x: 240, y: 120, width: 800, height: 600 } });
        console.log('shot', k, pose);
        if (pose === 'fire') await p.waitForTimeout(900);
    }
}
await p.evaluate(() => TQ.vmStudio(null, 'off'));
console.log('ERRORS', JSON.stringify(errors));
await b.close();
