import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser } from './browser.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const port = 4182;
const clientCount = Math.max(2, Math.min(8, Number(process.env.TQ_ARENA_CLIENTS || 2)));
const outDir = resolve(repo, 'docs/evidence/arena');
mkdirSync(outDir, { recursive: true });
const server = spawn(process.execPath, ['server/arena-server.mjs'], { cwd: repo, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (chunk) => { log += chunk; });
server.stderr.on('data', (chunk) => { log += chunk; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
    for (let i = 0; i < 100 && !log.includes('arena.started'); i++) await sleep(25);
    if (!log.includes('arena.started')) throw new Error(`Arena server did not start: ${log}`);
    const browser = await launchBrowser();
    const errors = [];
    const pages = [];
    for (let i = 0; i < clientCount; i++) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
        page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
        page.on('response', (response) => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
        await page.goto(`http://127.0.0.1:${port}/arena/`, { waitUntil: 'load' });
        await page.locator('#name').fill(`Browser ${i + 1}`);
        await page.locator('#connect').click();
        pages.push(page);
    }
    await pages[0].waitForFunction((expected) => document.querySelectorAll('.roster-row').length === expected, clientCount);
    const label = clientCount === 8 ? 'eight-player' : 'two-player';
    await pages[0].screenshot({ path: resolve(outDir, `01-${label}-lobby.png`) });
    for (const page of pages) await page.locator('#ready').click();
    await pages[0].waitForFunction(() => document.querySelector('#status')?.textContent.includes('LIVE'), null, { timeout: 8000 });
    await pages[0].waitForSelector('#hud:not(.hidden)', { timeout: 2000 });
    await pages[0].screenshot({ path: resolve(outDir, `02-${label}-office.png`) });
    const roster = await pages[0].locator('.roster-row').count();
    if (roster !== clientCount) throw new Error(`expected ${clientCount} roster rows, got ${roster}`);
    if (errors.length) throw new Error(errors.join('\n'));
    await browser.close();
    console.log(`Arena browser smoke: PASS (${clientCount} browser clients, lobby, ready countdown, Office render, active HUD)`);
} finally {
    server.kill('SIGTERM');
}
