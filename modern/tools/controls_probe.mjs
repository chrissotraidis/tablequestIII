/**
 * Controls probe (Round 2 R5): yaw per unit of mouse delta at two frame rates
 * (frame-rate independence of the look smoothing), and distance covered per
 * second walking and sprinting (PLAYER speeds unchanged).
 *   node modern/tools/controls_probe.mjs [url]
 */
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
const r = await p.evaluate(() => {
    TQ.skipBoot(); TQ.startGameAt(0); TQ.godmode(true); TQ.setTestMode(true);
    const g = TQ.game, inp = TQ.input;
    const out = {};
    const yawFor = (dt, frames, dx) => {
        const r0 = g.player.rot; g.smDX = 0; g.smDY = 0;
        for (let i = 0; i < frames; i++) { inp.mouseDX = dx; g.updatePlayer(dt); inp.mouseDX = 0; }
        for (let i = 0; i < 20; i++) g.updatePlayer(dt); // let the smoothing settle
        return g.player.rot - r0;
    };
    for (const smooth of [0, 0.35, 1]) {
        g.lookSmooth = smooth;
        out[`yaw_smooth${smooth}_60fps`] = +yawFor(1 / 60, 60, 4).toFixed(4);   // 240 counts over one second
        out[`yaw_smooth${smooth}_20fps`] = +yawFor(1 / 20, 20, 12).toFixed(4);  // same 240 counts
    }
    g.lookSmooth = 0.35;
    // ADS sensitivity scale
    g.aim = 1; out.yaw_ads_60fps = +yawFor(1 / 60, 60, 4).toFixed(4); g.aim = 0;
    // walking and sprinting distance per second (world units)
    const dist = (sprint) => {
        TQ.teleport(15, 9); g.player.rot = -Math.PI / 2; g.vel.set(0, 0);
        inp.forward = true; inp.sprint = sprint;
        let x0 = g.player.x, y0 = g.player.y;
        for (let i = 0; i < 30; i++) g.updatePlayer(1 / 60); // accelerate (0.5 s)
        x0 = g.player.x; y0 = g.player.y;
        for (let i = 0; i < 30; i++) g.updatePlayer(1 / 60); // measure 0.5 s inside the open lobby
        inp.forward = false; inp.sprint = false;
        return +(Math.hypot(g.player.x - x0, g.player.y - y0) * 2).toFixed(3);
    };
    out.walk_units_per_s = dist(false); out.sprint_units_per_s = dist(true);
    out.settings = { lookSmooth: g.lookSmooth, adsSens: g.adsSens, adsToggle: g.adsToggle, sprintToggle: g.sprintToggle, bobAmount: g.bobAmount };
    return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
