/**
 * M6.4 evidence: the dynamic-mix state log during a bot fight on Floor 6
 * (combat ducking, low-health muffle, objective swell, boss phase 2).
 *   node modern/tools/mixlog.mjs [url]
 */
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
const result = await p.evaluate(() => new Promise(async (res) => {
    TQ.skipBoot(); TQ.setTestMode(true); TQ.godmode(true);
    const events = [];
    // 1) Floor 1: an objective pickup swells the score
    TQ.startGameAt(0); if (TQ.state === 'loading') TQ.deploy();
    await TQ.botSleep(0.3);
    const g0 = TQ.game;
    events.push({ floor: 1, tablesBefore: g0.player.tables, collected: TQ.collectAllTables() });
    await TQ.botSleep(0.5);
    const floor1 = TQ.audioDebug();
    // 2) Floor 6: fight the Head Designer until phase 2, then dip to low health
    TQ.startGameAt(5); if (TQ.state === 'loading') TQ.deploy();
    await TQ.botSleep(0.3);
    const g = TQ.game;
    TQ.giveAll();
    TQ.teleport(g.boss.x - 2.5, g.boss.y); g.player.rot = 0; // in his face, looking at him
    let rounds = 0;
    while (rounds++ < 30 && g.boss.alive && !g.boss.phase2) {
        await TQ.botFight(4);
        if (Math.hypot(g.player.x - g.boss.x, g.player.y - g.boss.y) > 4) TQ.teleport(g.boss.x - 2.5, g.boss.y);
    }
    await TQ.botSleep(2.5); // let the fight settle so the duck releases
    g.player.health = 20; await TQ.botSleep(0.6); // low-health muffle
    g.player.health = 100; await TQ.botSleep(0.6);
    const after = TQ.audioDebug();
    res({ ctx: after.ctxState, floor1: { song: floor1.song, room: floor1.room, ambience: floor1.ambience, log: floor1.mixLog, events },
        floor6: { song: after.song, room: after.room, ambience: after.ambience, phase2: g.boss.phase2, bossAlive: g.boss.alive, bossHp: g.boss.health, rounds, mix: after.mix, log: after.mixLog } });
}));
console.log(JSON.stringify(result, null, 1));
await b.close();
