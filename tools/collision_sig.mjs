/**
 * Collision signature per floor — proves the modern geometry pass never
 * changed what the player can walk through (GOAL_LOOP M1.4 / §2.2).
 *   node tools/collision_sig.mjs [url]
 * Prints, per floor: grid size, solid-cell count, tall-prop count, and an
 * FNV-1a hash of the full isSolidCell + blocksShots map. Run against classic
 * (:5173) and modern (:5174); the hashes must match.
 */
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
await p.evaluate(() => TQ.skipBoot());
const rows = [];
for (const f of [0, 1, 2, 3, 4, 5]) {
    await p.evaluate((f) => TQ.startGameAt(f), f);
    await p.waitForTimeout(300);
    rows.push(await p.evaluate(() => {
        const w = TQ.game.world;
        let s = '', solid = 0, tall = 0;
        for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
            const a = w.isSolidCell(x, y), c = w.blocksShots(x, y);
            if (a) solid++;
            s += (a ? '1' : '0') + (c ? '1' : '0');
        }
        tall = w.tallProps.size;
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        return { floor: TQ.game.levelIndex + 1, size: `${w.w}x${w.h}`, solid, props: w.props.size, tall, spawn: [w.spawn.x, w.spawn.y], hash: h.toString(16) };
    }));
}
console.log(JSON.stringify(rows));
await b.close();
