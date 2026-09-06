/**
 * MODERN smoke harness (GOAL_LOOP.md §3.3-4).
 *
 * Drives a build headlessly with Playwright and the installed browser GPU:
 *   boot -> title -> menu -> story crawl -> Floor 1, then warps to every
 *   floor via the TQ harness and checks table/staff counts, console errors,
 *   and frame time. Writes screenshots to docs/evidence/smoke/<label>/.
 *
 * Usage:
 *   node tools/smoke.mjs                       # dev server on :5174 (modern)
 *   node tools/smoke.mjs --url http://127.0.0.1:5173 --label classic
 *   node tools/smoke.mjs --file dist/modern/index.html --label dist
 *   node tools/smoke.mjs --out /tmp/shots     # custom screenshot dir
 */
import { launchBrowser } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
    a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));

const label = args.label || 'modern';
const url = args.file ? pathToFileURL(resolve(args.file)).href : (args.url || 'http://127.0.0.1:5174/');
const outDir = resolve(args.out || resolve(here, '../docs/smoke', label));
mkdirSync(outDir, { recursive: true });

// classic + modern must report these (GOAL_LOOP §3.3-4)
const EXPECTED = [
    { floor: 1, tables: '0/2', staff: 6 },
    { floor: 2, tables: '0/3', staff: 9 },
    { floor: 3, tables: '0/3', staff: 8 },
    { floor: 4, tables: '0/4', staff: 11 },
    { floor: 5, tables: '0/4', staff: 15 },
    { floor: 6, tables: '0/0', staff: 1 },
];

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png`, timeout: 90000 });
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

console.log(`[smoke:${label}] ${url}`);
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await shot('01-boot-memory');
check(await page.evaluate(() => TQ.state) === 'boot-memory', 'initial state is boot-memory');

await page.locator('#boot-memory').click(); await page.waitForTimeout(600);
await shot('02-boot-title');
check(await page.evaluate(() => TQ.state) === 'boot-title', 'left click advances to boot-title');

await page.locator('#boot-title').click(); await page.waitForTimeout(900);
await shot('03-menu');
check(await page.evaluate(() => TQ.state) === 'menu', 'left click advances to menu');

// menu sub-screens
await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
await shot('04-floor-select');
check(await page.evaluate(() => document.querySelectorAll('#level-list .level-item').length) === 6, 'floor select lists 6 floors');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.getByRole('option', { name: 'Scoreboard' }).click(); await page.waitForTimeout(400);
await shot('05-scoreboard');
check(await page.locator('#menu-scoreboard').isVisible(), 'main menu opens the global scoreboard');
await page.locator('#btn-scoreboard-back').click(); await page.waitForTimeout(200);
await page.getByRole('option', { name: 'How to Play' }).click(); await page.waitForTimeout(400);
await shot('05-instructions');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// story crawl
await page.getByRole('option', { name: 'New Game' }).click(); await page.waitForTimeout(6000);
await shot('06-story');
check(await page.evaluate(() => TQ.state) === 'intro', 'New Game shows the story crawl');
const storyText = await page.evaluate(() => document.querySelector('.intro-container')?.textContent.replace(/\s+/g, ' ').trim());
check(storyText && storyText.includes('They left her alive') && storyText.includes("She's taking them back"),
    'story text intact');

await page.locator('#intro-screen').click({ position: { x: 32, y: 32 } }); await page.waitForTimeout(1500);
// MODERN M3.6: a per-floor loading card sits between the briefing and play
check(await page.evaluate(() => TQ.state) === 'loading', 'clicking the crawl shows the loading card');
await shot('07a-loading-card');
await page.locator('#screen-loading').click({ position: { x: 32, y: 32 } }); await page.waitForTimeout(2500);
await shot('07-floor1-spawn');
check(await page.evaluate(() => TQ.state) === 'play', 'clicking deploy enters play');

// walk forward, capture, then check pause
await page.mouse.click(640, 400);
await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
await page.waitForTimeout(300);
await shot('08-floor1-walk');
await page.keyboard.press('Tab'); await page.waitForTimeout(200);
await shot('09-floor1-minimap');
await page.keyboard.press('Tab');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await shot('10-pause');
check(await page.evaluate(() => TQ.state) === 'pause', 'Esc pauses');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// every floor via harness
const frameTimes = [];
for (const exp of EXPECTED) {
    await page.evaluate(async (f) => { await TQ.startGameAt(f - 1); TQ.godmode(true); }, exp.floor);
    await page.waitForTimeout(1200);
    const snap = await page.evaluate(() => TQ.snapshot());
    check(snap.state === 'play', `floor ${exp.floor} enters play`);
    check(snap.tables === exp.tables, `floor ${exp.floor} tables ${snap.tables} == ${exp.tables}`);
    check(snap.enemies === exp.staff, `floor ${exp.floor} staff ${snap.enemies} == ${exp.staff}`);
    await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
    await page.waitForTimeout(300);
    // frame time sample (rAF deltas over ~1s)
    const ft = await page.evaluate(() => new Promise((res) => {
        const ts = []; let last = performance.now(); let n = 0;
        const tick = (t) => { ts.push(t - last); last = t; if (++n < 45) requestAnimationFrame(tick); else res(ts); };
        requestAnimationFrame(tick);
    }));
    const avg = ft.slice(5).reduce((a, b) => a + b, 0) / (ft.length - 5);
    frameTimes.push({ floor: exp.floor, avgMs: +avg.toFixed(1) });
    await shot(`floor-${exp.floor}`);
}

// weapons + pickups present in defs
const weapons = await page.evaluate(() => Object.keys(TQ.game.weaponDefs));
check(['paintbrush', 'tableLeg', 'sprayer', 'nailgun', 'roller'].every((w) => weapons.includes(w)), 'five weapons defined');

await browser.close();

const report = { label, url, failures, errors, frameTimes, screenshots: outDir };
console.log(JSON.stringify(report, null, 2));
if (failures.length || errors.length) {
    console.error(`[smoke:${label}] FAILED (${failures.length} checks, ${errors.length} console errors)`);
    process.exit(1);
}
console.log(`[smoke:${label}] OK`);
