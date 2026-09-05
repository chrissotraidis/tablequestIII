/**
 * README screenshots from the built game (round 16): menu, versions, floors with the floating tools, bench HUD, crawl.
 *   node tools/readme_shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:4174/';
const out = process.argv[3] || 'docs/readme';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
const shot = async (name, q = 86) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: q }); console.log('shot', name); };
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => TQ.skipBoot()); await p.waitForTimeout(900); await p.evaluate(() => TQ.settle(2));
await shot('modern-menu');
await p.click('#menu-items .menu-item:nth-child(6)'); await p.waitForTimeout(400); await p.evaluate(() => TQ.settle(1));
await shot('modern-versions');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(800); await p.evaluate(() => TQ.settle(1));
await shot('modern-floor-select');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
// floors with the tools
const clearHeading = () => p.evaluate(() => { const g = TQ.game, w = g.world, p2 = g.player; for (let k = 0; k < 8; k++) { const rot = p2.rot + k * Math.PI / 4; let clear = true; for (let d = 1; d <= 4; d++) if (w.isSolidCell(Math.floor(p2.x + Math.cos(rot) * d), Math.floor(p2.y + Math.sin(rot) * d))) clear = false; if (clear) { p2.rot = rot; break; } } });
const floor = async (idx, weapon, name, pitch = 0) => {
    await p.evaluate((idx) => { TQ.setState('menu'); TQ.startGameAt(idx); TQ.giveAll(); TQ.godmode(true); TQ.hud.holdCard = false; if (idx === 0) { TQ.teleport(15, 9); TQ.player.rot = -1.57; } }, idx); // Floor 1: from the reception hall, not the spawn corridor
    await p.evaluate(() => TQ.settle(2)); await clearHeading();
    await p.evaluate(({ weapon, pitch }) => { const g = TQ.game; g.switchWeapon(weapon); g.updateViewmodel(true); g.vmAnim.swapPhase = 'idle'; g.vmAnim.swapT = 0; g.vmAnim.pending = null; g.pitch = pitch; g.aim = 0; return TQ.settle(3); }, { weapon, pitch });
    await shot(name);
};
await floor(0, 1, 'modern-lobby-brush');
await floor(1, 3, 'modern-office-nailer');
await floor(2, 2, 'modern-archives-leg');
await floor(3, 4, 'modern-showroom-launcher');
await floor(4, 5, 'modern-factory-sprayer');
await floor(5, 4, 'modern-penthouse');
// bench HUD, hurt
await p.evaluate(() => { TQ.setState('menu'); TQ.startGameAt(0); TQ.giveAll(); TQ.godmode(true); TQ.hud.holdCard = false; TQ.teleport(15, 9); TQ.player.rot = -1.57; const g = TQ.game; g.player.health = 24; g.hurtPlayer(0.01, g.player.x - 1, g.player.y); g.switchWeapon(3); g.updateViewmodel(true); g.vmAnim.swapPhase = 'idle'; });
await p.evaluate(() => TQ.settle(3));
await shot('modern-bench-hurt');
console.log('ERRORS', JSON.stringify(errors));
await b.close();
