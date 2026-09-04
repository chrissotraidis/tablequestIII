/**
 * Weapon / hands sheet (Round 2 R3, R4): every tool from the play camera at
 * hip, aiming down sights, and mid-fire; mesh counts per viewmodel.
 *   node tools/weapon_shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/R3';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', name); };
await p.evaluate(() => { TQ.skipBoot(); TQ.startGameAt(0); TQ.giveAll(); TQ.godmode(true); TQ.teleport(15, 9); TQ.player.rot = -1.57; TQ.game.pitch = 0.0; TQ.hud.holdCard = false; });
await p.evaluate(() => { const g = TQ.game, w = g.world, p2 = g.player; for (let k = 0; k < 8; k++) { const rot = -1.57 + k * Math.PI / 4; let clear = true; for (let d = 1; d <= 3; d++) if (w.isSolidCell(Math.floor(p2.x + Math.cos(rot) * d), Math.floor(p2.y + Math.sin(rot) * d))) clear = false; if (clear) { p2.rot = rot; break; } } }); // face a clear direction so wall-clip avoidance stays out of the shots
await p.waitForTimeout(1800);
const counts = await p.evaluate(() => { const o = {}; for (const [k, vm] of Object.entries(TQ.game.viewmodels)) { let n = 0; vm.traverse(x => { if (x.isMesh) n++; }); o[k] = n; } return o; });
console.log('meshes per viewmodel', JSON.stringify(counts));
const keys = ['paintbrush', 'tableLeg', 'nailgun', 'roller', 'sprayer'];
for (let i = 0; i < keys.length; i++) {
    await p.evaluate((i) => { TQ.game.switchWeapon(i + 1); TQ.game.updateViewmodel(true); TQ.game.aim = 0; }, i);
    await p.waitForTimeout(900);
    await shot(`${keys[i]}-hip`);
    if (keys[i] !== 'tableLeg') {
        await p.mouse.move(640, 400); await p.mouse.down({ button: 'right' }); await p.waitForTimeout(1400);
        await shot(`${keys[i]}-ads`);
        await p.mouse.up({ button: 'right' }); await p.waitForTimeout(900);
    }
    await p.evaluate((k) => { const g = TQ.game; g.player.ammo = 99; g.player.cooldown = 0; g.fireWeapon(g.weaponDefs[k]); }, keys[i]);
    await p.waitForTimeout(120);
    await shot(`${keys[i]}-fire`);
    await p.waitForTimeout(700);
}
console.log('ERRORS', JSON.stringify(errors));
await b.close();
