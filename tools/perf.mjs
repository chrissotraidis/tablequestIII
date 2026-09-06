/**
 * Per-floor render stats for the §3.2-4 budget (draw calls < 400, frame time).
 *   node tools/perf.mjs [url]
 * `calls` is the main pass; `callsWithShadow` adds the shadow-map pass
 * (the §3.2-4 budget of 400 applies to the whole frame). Uses the installed GPU
 * renderer by default; TQ_SOFTWARE_RENDERER=1 opts into SwiftShader.
 */
import { launchBrowser } from './browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const b = await launchBrowser();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => TQ.skipBoot());
// PRE='TQ.setPostFX(false)' — arbitrary setup JS evaluated after boot
if (process.env.PRE) await p.evaluate((js) => eval(js), process.env.PRE);
const rows = [];
for (const f of [0, 1, 2, 3, 4, 5]) {
    await p.evaluate(async (f) => { await TQ.startGameAt(f); TQ.godmode(true); }, f);
    await p.waitForTimeout(1000);
    await p.keyboard.down('w'); await p.waitForTimeout(800); await p.keyboard.up('w');
    const r = await p.evaluate(() => new Promise((res) => {
        const ts = []; let last = performance.now(); let n = 0;
        const tick = (t) => { ts.push(t - last); last = t; if (++n < 30) requestAnimationFrame(tick); else res({ ts }); };
        requestAnimationFrame(tick);
    }).then(({ ts }) => {
        const avg = ts.slice(4).reduce((a, c) => a + c, 0) / (ts.length - 4);
        const r = TQ.renderer, info = r.info, cam = TQ.game.camera;
        // main pass only (three resets its counters after the shadow pass)
        info.autoReset = true; r.render(TQ.scene, cam);
        const mainCalls = info.render.calls, tris = info.render.triangles;
        // whole frame incl. shadow pass: accumulate one explicit render
        info.autoReset = false; info.reset(); r.render(TQ.scene, cam);
        const totalCalls = info.render.calls;
        info.autoReset = true;
        let lights = 0; TQ.scene.traverse(o => { if (o.isLight) lights++; });
        return { floor: TQ.game.levelIndex + 1, calls: mainCalls, callsWithShadow: totalCalls, tris, geometries: info.memory.geometries, textures: info.memory.textures, lights, avgMs: +avg.toFixed(1) };
    }));
    rows.push(r);
}
console.table(rows);
console.log(JSON.stringify(rows));
await b.close();
