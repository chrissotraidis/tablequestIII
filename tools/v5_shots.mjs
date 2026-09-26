/**
 * Table Quest 5 fixed-shot sheet and performance baseline (docs/v5/GOAL_LOOP.md V0).
 *   node tools/v5_shots.mjs <url> <outDir>
 * Captures the same camera positions every run (two per floor plus Arena) at
 * 1440x900 on this Mac's GPU, and records frame-time p50/p95/p99, hitches over
 * 50 ms and draw calls per shot into <outDir>/metrics.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:4180/';
const out = process.argv[3] || 'docs/v5/shots/current';
mkdirSync(out, { recursive: true });
// [floorIndex, x, y, rot, pitch, weaponSlot, name]
const SHOTS = [
    [0, 15, 9, -1.57, 0, 1, 'f1-reception'], [0, 4.5, 3.5, 0, -0.12, 3, 'f1-corridor'],
    [1, 3.5, 2.5, 0.6, 0, 3, 'f2-openplan'], [1, 20.5, 12.5, 3.14, 0.1, 2, 'f2-desks'],
    [2, 2.5, 2.5, 0, 0, 2, 'f3-archives'], [2, 12.5, 8.5, 1.57, -0.05, 4, 'f3-stacks'],
    [3, 2.5, 2.5, 0.4, 0, 4, 'f4-showroom'], [3, 16.5, 12.5, 3.14, 0, 1, 'f4-floor'],
    [4, 2.5, 2.5, 0, 0, 5, 'f5-factory'], [4, 20.5, 14.5, -1.57, 0.08, 3, 'f5-line'],
    [5, 3.5, 3.5, 0.5, 0, 4, 'f6-penthouse'], [5, 16, 11.5, 3.14, 0, 1, 'f6-hall'],
];
const b = await launchBrowser();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => TQ.skipBoot()); await p.waitForTimeout(500);
const metrics = {};
const measure = () => p.evaluate(() => new Promise((res) => {
    const ts = []; let last = performance.now();
    const tick = (t) => { ts.push(t - last); last = t; if (ts.length < 150) requestAnimationFrame(tick); else res(ts.slice(10)); };
    requestAnimationFrame(tick);
}).then((ts) => { const s = [...ts].sort((a, b) => a - b), q = (x) => +s[Math.floor((s.length - 1) * x)].toFixed(2);
    return { p50: q(.5), p95: q(.95), p99: q(.99), hitches: ts.filter((t) => t > 50).length, calls: TQ.renderer.info.render.calls, tris: TQ.renderer.info.render.triangles, textures: TQ.renderer.info.memory.textures, geometries: TQ.renderer.info.memory.geometries }; }));
let loaded = -1;
for (const [floor, x, y, rot, pitch, slot, name] of SHOTS) {
    if (floor !== loaded) {
        const t0 = Date.now();
        await p.evaluate(async (f) => { TQ.setState('menu'); await TQ.startGameAt(f); TQ.giveAll(); TQ.godmode(true); TQ.hud.holdCard = false; TQ.game.updateEnemies = () => {}; }, floor);
        metrics[`floor${floor + 1}-load`] = Date.now() - t0; loaded = floor;
    }
    await p.evaluate(({ x, y, rot, pitch, slot }) => { const g = TQ.game; TQ.teleport(x, y); g.player.rot = rot; g.pitch = pitch; g.switchWeapon(slot); g.updateViewmodel(true); g.vmAnim.swapPhase = 'idle'; g.vmAnim.swapT = 0; g.vmAnim.pending = null; g.aim = 0; return TQ.settle(4); }, { x, y, rot, pitch, slot });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88 });
    metrics[name] = await measure();
}
// Arena: lobby and an in-match view from the fixed first spawn.
await p.goto(url.replace(/\/?$/, '/') + 'arena/?test', { waitUntil: 'load' }); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/arena-lobby.jpg`, type: 'jpeg', quality: 88 });
await p.locator('#name').fill('Shots'); await p.locator('#connect').click(); await p.waitForTimeout(1200);
await p.locator('[data-value="1"]').first().click().catch(() => p.selectOption('#bot-count', '1').catch(() => {}));
await p.locator('#bot-toggle').click(); await p.waitForTimeout(400);
await p.locator('#start').click({ timeout: 1500 }).catch(() => p.locator('#ready').click());
await p.locator('#hud').waitFor({ state: 'visible', timeout: 15000 }); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/arena-match.jpg`, type: 'jpeg', quality: 88 });
metrics['arena-match'] = await p.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const tick = (t) => { ts.push(t - last); last = t; if (ts.length < 150) requestAnimationFrame(tick); else res(ts.slice(10)); }; requestAnimationFrame(tick); }).then((ts) => { const s = [...ts].sort((a, b) => a - b), q = (x) => +s[Math.floor((s.length - 1) * x)].toFixed(2); return { p50: q(.5), p95: q(.95), p99: q(.99), hitches: ts.filter((t) => t > 50).length }; }));
await p.locator('#hud-menu').click().catch(() => {});
writeFileSync(`${out}/metrics.json`, JSON.stringify({ url, capturedAt: new Date().toISOString(), errors, metrics }, null, 2));
console.log(JSON.stringify({ shots: SHOTS.length + 2, errors: errors.length, worstP95: Math.max(...Object.values(metrics).filter((m) => m.p95).map((m) => m.p95)) }));
await b.close();
