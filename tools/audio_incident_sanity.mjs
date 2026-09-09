import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:4178/';
const out = process.argv[3] || '/tmp/tablequest-audio-validation';
mkdirSync(out, { recursive: true });
const browser = await launchBrowser(), checks = [], samples = [], errors = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); console.log('PASS', name); };
try {
    const pages = await Promise.all([browser.newPage({ viewport: { width: 1440, height: 900 } }), browser.newPage()]);
    for (const page of pages) {
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            const Native = AudioContext;
            window.AudioContext = class extends Native { constructor(...args) { super(...args); window.testAudioContext = this; } };
        });
        await page.goto(url); await page.waitForFunction(() => window.TQ);
        await page.evaluate(async () => { TQ.skipBoot(); await TQ.startGameAt(1); TQ.godmode(true); TQ.setState('pause'); });
    }
    const page = pages[0];
    const soakSeconds = Math.max(65, Number(process.env.TQ_SOAK_SECONDS) || 65);
    for (let i = 0; i < soakSeconds; i++) {
        if (i % 30 === 20) await page.evaluate(() => { TQ.setState('play'); TQ.player.ammo = 999; TQ.input.fireKeyHeld = true; });
        if (i % 30 === 25) await page.evaluate(() => { TQ.input.fireKeyHeld = false; TQ.setState('pause'); });
        await page.waitForTimeout(1000);
        samples.push(await Promise.all(pages.map(p => p.evaluate(() => TQ.audioHealth()))));
        if (i % 15 === 0) console.log('Two-tab Floor 2 sample', i, JSON.stringify(samples.at(-1).map(a => ({ outputDb: a.outputDb, playback: a.playback }))));
    }
    check(samples.every(row => row.every(a => a.state === 'running' && a.song === 'office' && a.schedulerErrors === 0)), 'two concurrent Level 2 note schedulers survive the soak (device underruns recorded separately)');
    check(samples.every(row => row.every(a => a.voices.nodes < 1500)), 'live voice nodes stay bounded during music and firing');
    console.log('Device playback totals before fault injection', JSON.stringify(samples.at(-1).map(a => a.playback)));
    check(await page.evaluate(() => TQ.logs().some(e => e.event === 'audio.health' && e.data.gameState === 'pause' && e.data.floor === 2)), 'paused game sends audio heartbeat with floor and game state');
    await pages[1].close();
    await page.evaluate(() => TQ.recoverAudio());
    await page.waitForTimeout(1500);
    // Inject device stats separately from the JS scheduler: reproduce the old blind spot.
    await page.evaluate(() => {
        Object.defineProperty(window.testAudioContext, 'playbackStats', { configurable: true, value: { underrunDuration: 0, underrunEvents: 0, totalDuration: 100, averageLatency: .02 } });
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.testAudioContext.playbackStats.underrunDuration = 2; window.testAudioContext.playbackStats.underrunEvents = 10; });
    await page.waitForFunction(() => TQ.logs().some(e => e.event === 'audio.playback-underrun' && e.data.deltaEvents >= 10 && e.data.playback.underrunEvents === 10));
    check(await page.evaluate(() => TQ.audioHealth().underruns === 0), 'device underrun is detected even when note scheduler reports zero');
    await page.evaluate(() => { window.testAudioContext.getOutputTimestamp = () => ({ contextTime: 1, performanceTime: 1 }); });
    await page.waitForFunction(() => TQ.logs().some(e => e.event === 'audio.output-stalled'));
    check(true, 'stale device-output clock is detected while context remains running');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#pause-items').getByText('Download Error Logs', { exact: true }).click();
    const download = await downloadPromise;
    const report = JSON.parse(readFileSync(await download.path(), 'utf8'));
    check(report.build && report.sessionId && report.telemetry && report.entries.some(e => e.event === 'audio.user-report' && e.data.floor === 2), 'pause action exports build, session, transport status and current audio incident');
    await page.screenshot({ path: `${out}/audio-pause.png` });
    const before = await page.evaluate(() => ({ level: TQ.game.levelIndex, score: TQ.player.score, generation: TQ.audioHealth().generation }));
    await page.locator('#pause-items').getByText('Recover Audio', { exact: true }).click();
    await page.waitForFunction(generation => TQ.audioHealth().generation > generation && TQ.logs().some(e => e.event === 'audio.recovery-check'), before.generation);
    check(await page.evaluate(before => TQ.state === 'pause' && TQ.game.levelIndex === before.level && TQ.player.score === before.score && TQ.audioHealth().state === 'running', before), 'audio recovery preserves Level 2, score and pause state');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('ArrowUp');
    check((await page.locator('#pause-items .selected').textContent()).trim() === 'Quit to Menu', 'pause menu keyboard wraps after adding log download');
    await page.waitForTimeout(16000);
    check(errors.length === 0, 'no runtime exceptions');
    writeFileSync(`${out}/audio-sanity.json`, JSON.stringify({ checks, samples, errors }, null, 2));
} finally { writeFileSync(`${out}/audio-sanity.json`, JSON.stringify({ checks, samples, errors }, null, 2)); await browser.close(); }
