/**
 * Boss certification (GOAL_LOOP M4.4 / M7.1): the classic autopilot fights the
 * Head Designer with the Floor-6 arsenal. Winnable at "die once, retry, win"
 * difficulty means: at most one death, then a win on the retry.
 *   node tools/bossfight.mjs [url]
 */
import { launchBrowser } from './browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const b = await launchBrowser();
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
const result = await p.evaluate(() => new Promise(async (res) => {
    TQ.skipBoot(); await TQ.startGameAt(5); TQ.setTestMode(true);
    const g = TQ.game;
    let deaths = 0, rounds = 0, phase2At = null, t0 = g.time;
    while (rounds < 40) {
        rounds++;
        if (TQ.state === 'gameover') {
            deaths++;
            if (deaths > 1) break;
            TQ.setState('play'); // retry path: the harness restores via the classic retry snapshot
            g.player.health = Math.max(g.player.health, 75); g.player.ammo = Math.max(g.player.ammo, 20); g.player.alive = true;
            g.loadLevel(5, { keepStats: true, silent: true }); TQ.setState('play');
        }
        if (TQ.state === 'loading') TQ.deploy();
        if (!g.boss || !g.boss.alive) break;
        if (g.boss.phase2 && phase2At === null) phase2At = +(g.time - t0).toFixed(1);
        // approach so the fight engages, then fight in 8 s slices
        await TQ.botGoto(g.boss.x, g.boss.y, 6);
        await TQ.botFight(8);
        if (!g.player.alive) { await TQ.botSleep(1.2); }
    }
    res({ won: !!(g.boss && !g.boss.alive), deaths, rounds, phase2At, state: TQ.state, hp: g.player.health, ammo: g.player.ammo, gameTime: +(g.time - t0).toFixed(1), score: g.player.score });
}));
console.log(JSON.stringify(result));
await b.close();
