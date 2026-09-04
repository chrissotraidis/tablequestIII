/**
 * Decal/debris stress (GOAL_LOOP M1.6): 200 real brush shots into a wall +
 * 300 direct decals + 200 splinters, then frame time before/after and a
 * screenshot. node tools/stress.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/M1.6';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { TQ.skipBoot(); TQ.startGameAt(0); TQ.godmode(true); TQ.giveAll(); TQ.teleport(6.5, 2.5); TQ.player.rot = -1.57; TQ.game.pitch = -0.1; });
await p.waitForTimeout(1000);
const frame = () => p.evaluate(() => new Promise((res) => {
    const ts = []; let last = performance.now(); let n = 0;
    const tick = (t) => { ts.push(t - last); last = t; if (++n < 16) requestAnimationFrame(tick); else res(ts.slice(3).reduce((a, c) => a + c, 0) / (ts.length - 3)); };
    requestAnimationFrame(tick);
}));
const before = await frame();
// 200 real shots: force the cooldown each frame so the brush fires at frame rate
const fired = await p.evaluate(() => new Promise((res) => {
    let n = 0;
    const tick = () => {
        const g = TQ.game; g.player.ammo = 99; g.player.cooldown = 0;
        g.player.rot = -1.57 + (Math.random() - 0.5) * 0.9; g.pitch = (Math.random() - 0.5) * 0.5;
        g.fireWeapon(g.weaponDefs.paintbrush); n++;
        if (n < 200) requestAnimationFrame(tick); else res(n);
    };
    tick();
}));
await p.waitForTimeout(2500); // let shots land
const hits = await p.evaluate(() => {
    // direct decals along the top wall (y=0 face at z=1) + floor, and debris
    const g = TQ.game, three = g.effects.decals[0].mesh.position.constructor; // Vector3
    const Vec = (x, y, z) => new three(x, y, z);
    const Col = g.effects.decals[0].mesh.material.color.constructor;
    for (let i = 0; i < 300; i++) {
        const wall = i % 2 === 0;
        const pos = wall ? Vec(2 + Math.random() * 10, 0.2 + Math.random() * 1.5, 1.0) : Vec(2 + Math.random() * 10, 0.0, 1.5 + Math.random() * 4);
        const nrm = wall ? Vec(0, 0, 1) : Vec(0, 1, 0);
        g.effects.splat(pos, nrm, new Col().setHSL(Math.random(), 1, 0.55), 0.25 + Math.random() * 0.2);
    }
    for (let i = 0; i < 10; i++) g.effects.debris(Vec(4 + i * 0.8, 0.4, 3), new Col(0x9a7442), 20, 2.8);
    return g.effects.stats;
});
await p.waitForTimeout(1500);
const after = await frame();
const stats = await p.evaluate(() => TQ.effects?.stats ?? TQ.game.effects.stats);
const calls = await p.evaluate(() => { const r = TQ.renderer; r.info.autoReset = true; r.render(TQ.scene, TQ.game.camera); return r.info.render.calls; });
await p.screenshot({ path: `${out}/stress-decals.jpg`, type: 'jpeg', quality: 82, timeout: 90000 });
// persistence: wait 6 s of wall clock and confirm decals are still there
await p.waitForTimeout(6000);
const later = await p.evaluate(() => TQ.game.effects.stats);
console.log(JSON.stringify({ fired, before: +before.toFixed(1), after: +after.toFixed(1), stats, later, mainPassCalls: calls, errors }));
await b.close();
