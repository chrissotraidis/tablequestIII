/**
 * Per-floor render stats for the §3.2-4 budget (draw calls < 400, frame time).
 *   node modern/tools/perf.mjs [url]
 * Draw calls include the shadow pass. Frame time is SwiftShader (software)
 * and only meaningful relative to the M0 baseline in PROGRESS.md.
 */
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => TQ.skipBoot());
const rows = [];
for (const f of [0, 1, 2, 3, 4, 5]) {
    await p.evaluate((f) => { TQ.startGameAt(f); TQ.godmode(true); }, f);
    await p.waitForTimeout(1000);
    await p.keyboard.down('w'); await p.waitForTimeout(800); await p.keyboard.up('w');
    const r = await p.evaluate(() => new Promise((res) => {
        const ts = []; let last = performance.now(); let n = 0;
        const tick = (t) => { ts.push(t - last); last = t; if (++n < 30) requestAnimationFrame(tick); else res({ ts }); };
        requestAnimationFrame(tick);
    }).then(({ ts }) => {
        const avg = ts.slice(4).reduce((a, c) => a + c, 0) / (ts.length - 4);
        const i = TQ.renderer.info;
        let lights = 0; TQ.scene.traverse(o => { if (o.isLight) lights++; });
        return { floor: TQ.game.levelIndex + 1, calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, lights, avgMs: +avg.toFixed(1) };
    }));
    rows.push(r);
}
console.table(rows);
console.log(JSON.stringify(rows));
await b.close();
