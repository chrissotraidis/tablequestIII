/**
 * Viewmodel crops (Round 11 P1): the lower-right viewmodel region at 1.5× device scale for hip / ads / fire / swap
 * per tool, so verdicts are made on detail rather than on the full frame.
 *   node tools/vm_crops.mjs [url] [outDir] [keys...]     POSES=hip,ads,fire,swap
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/P1/crops';
const keys = process.argv.slice(4).length ? process.argv.slice(4) : ['paintbrush', 'tableLeg', 'nailgun', 'roller', 'sprayer'];
const poses = (process.env.POSES || 'hip,ads,fire').split(',');
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
await p.evaluate(() => { TQ.skipBoot(); TQ.startGameAt(0); TQ.giveAll(); TQ.godmode(true); TQ.teleport(15, 9); TQ.player.rot = -1.57; TQ.game.pitch = 0; TQ.hud.holdCard = false; });
await p.evaluate(() => { const g = TQ.game, w = g.world, p2 = g.player; for (let k = 0; k < 8; k++) { const rot = -1.57 + k * Math.PI / 4; let clear = true; for (let d = 1; d <= 3; d++) if (w.isSolidCell(Math.floor(p2.x + Math.cos(rot) * d), Math.floor(p2.y + Math.sin(rot) * d))) clear = false; if (clear) { p2.rot = rot; break; } } });
await p.evaluate(() => { for (const e of TQ.game.enemies) { e.alive = false; e.model.group.visible = false; e.shadow.visible = false; } });
await p.evaluate(() => TQ.settle(2));
await p.waitForFunction(() => TQ.game.handsReady, null, { timeout: 30000 });
const WEAPON_IDX = { paintbrush: 1, tableLeg: 2, nailgun: 3, roller: 4, sprayer: 5 };
const clip = { x: 560, y: 220, width: 720, height: 470 };
for (const k of keys) {
    await p.evaluate((i) => { const g = TQ.game; g.switchWeapon(i); g.updateViewmodel(true); g.vmAnim.swapPhase = 'idle'; g.vmAnim.swapT = 0; g.vmAnim.pending = null; g.aim = 0; g.recoil = 0; }, WEAPON_IDX[k]);
    for (const pose of poses) {
        if (pose === 'hip') await p.evaluate(() => { TQ.game.aim = 0; return TQ.settle(3); });
        if (pose === 'ads') { if (k === 'tableLeg') continue; await p.mouse.move(640, 400); await p.mouse.down({ button: 'right' }); await p.evaluate(() => { TQ.game.aim = 1; return TQ.settle(3); }); }
        if (pose === 'fire') await p.evaluate((k) => { const g = TQ.game; g.aim = 0; g.player.ammo = 99; g.player.cooldown = 0; g.fireWeapon(g.weaponDefs[k]); return TQ.settle(1); }, k);
        if (pose === 'swap') await p.evaluate(() => { const g = TQ.game; g.vmAnim.swapPhase = 'raise'; g.vmAnim.swapT = 0.3; return TQ.settle(1); });
        await p.screenshot({ path: `${out}/${k}-${pose}.jpg`, type: 'jpeg', quality: 88, clip });
        console.log('crop', k, pose);
        if (pose === 'ads') { await p.mouse.up({ button: 'right' }); await p.evaluate(() => { TQ.game.aim = 0; return TQ.settle(2); }); }
        if (pose === 'fire' || pose === 'swap') await p.evaluate(() => { const g = TQ.game; g.vmAnim.swapPhase = 'idle'; g.vmAnim.swapT = 0; return TQ.settle(4); });
    }
}
console.log('ERRORS', JSON.stringify(errors));
await b.close();
