/**
 * Quick floor capture for goal evidence.
 *   node modern/tools/capture.mjs <url> <outDir> <floor...>   [TEXSHEET=1] [WALK=ms]
 * Warps to each floor via TQ (godmode), walks forward, screenshots.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [,, url, out, ...floors] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1000);
await page.evaluate(() => TQ.skipBoot());
// PRE='TQ.setPostFX(false)' — arbitrary setup JS evaluated after boot
if (process.env.PRE) await page.evaluate((js) => eval(js), process.env.PRE);
const walk = Number(process.env.WALK || 1500);
// evidence defaults to JPEG so goal screenshots stay ~100 KB (FORMAT=png to override)
const fmt = process.env.FORMAT === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 82 };
const ext = fmt.type === 'png' ? 'png' : 'jpg';
for (const f of floors.map(Number)) {
    await page.evaluate((f) => { TQ.startGameAt(f - 1); TQ.godmode(true); }, f);
    await page.waitForTimeout(1500);
    await page.keyboard.down('w'); await page.waitForTimeout(walk); await page.keyboard.up('w'); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/floor-${f}.${ext}`, timeout: 90000, ...fmt });
}
// POSES='[{"f":2,"x":6,"y":2.5,"rot":0.6,"pitch":0.45,"name":"desk"}]' — teleport + aim before shooting
if (process.env.POSES) {
    for (const pose of JSON.parse(process.env.POSES)) {
        await page.evaluate((po) => {
            TQ.startGameAt(po.f - 1); TQ.godmode(true);
            TQ.teleport(po.x, po.y); TQ.player.rot = po.rot ?? 0; TQ.game.pitch = po.pitch ?? 0;
        }, pose);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${out}/${pose.name || `pose-${pose.f}`}.${ext}`, timeout: 90000, ...fmt });
    }
}
if (process.env.TEXSHEET) {
    await page.evaluate(() => TQ.textureSheet());
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/texsheet.${ext}`, fullPage: true, timeout: 90000, ...fmt });
}
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
