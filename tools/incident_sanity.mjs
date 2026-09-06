import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || '/tmp/tablequest-floor3-incident';
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [], samples = [], errors = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); console.log('PASS', name); };
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
        constructor(...args) { super(...args); window.testAudioContext = this; }
    };
});
try {
    await page.goto(url); await page.waitForFunction(() => window.TQ);
    await page.evaluate(async () => { TQ.skipBoot(); await TQ.startGameAt(2); TQ.godmode(true); TQ.setState('pause'); });
    check((await page.locator('#pause-floor').textContent()).includes('FLOOR 3'), 'pause names Floor 3');
    check((await page.locator('#hud-floor-name').textContent()).includes('FLOOR 3'), 'persistent objective names Floor 3');
    const decal = await page.evaluate(() => {
        const game = TQ.game, e = game.enemies.find(e => e.alive);
        e.model.group.position.set(e.x, 0, e.y);
        game.paintEnemy(e, e.x, .55, e.y + .3, { r: 1, g: 0, b: 0 });
        let d; e.model.group.traverse(o => { if (o.userData.paintDecal) d = o; });
        if (!d) return { found: false };
        const pos = d.geometry.attributes.position, body = d.parent.geometry;
        body.computeBoundingBox();
        const b = body.boundingBox, before = d.getWorldPosition(TQ.game.camera.position.clone());
        let contained = true;
        for (let i = 0; i < pos.count; i++) {
            if (pos.getX(i) < b.min.x - .001 || pos.getX(i) > b.max.x + .001 || pos.getY(i) < b.min.y - .001 || pos.getY(i) > b.max.y + .001 || pos.getZ(i) < b.min.z - .001 || pos.getZ(i) > b.max.z + .001) contained = false;
        }
        e.model.group.position.x += 2;
        e.model.torso.rotation.x = .4;
        e.model.group.updateWorldMatrix(true, true);
        const after = d.getWorldPosition(before.clone());
        const localIdentity = d.position.length() === 0 && d.rotation.x === 0;
        return { found: true, contained, vertices: pos.count, moves: after.distanceTo(before) > 1, localIdentity };
    });
    check(decal.found && decal.contained && decal.vertices > 0 && decal.moves && decal.localIdentity, 'enemy paint clipped to mesh and follows moving rig');
    const wall = await page.evaluate(() => {
        const g = TQ.game, world = g.world, impacts = [];
        let cell;
        for (let y = 1; y < world.h - 1 && !cell; y++) for (let x = 1; x < world.w - 1; x++) {
            if (!world.isStructureSolid(x, y) && !world.propAt(x, y) && world.isStructureSolid(x + 1, y)) { cell = { x, y }; break; }
        }
        if (!cell) return [];
        const original = g.effects.impact, remove = g.removeProjectileMesh;
        g.effects.impact = (pos, normal) => impacts.push({ x: pos.x, z: pos.z, normal: normal.x, face: cell.x + 1 });
        g.removeProjectileMesh = () => {};
        try {
            for (const speed of [8, 18, 30]) {
                g.projectiles.push({ x: cell.x + .88, y: cell.y + .5, z: .6, vx: speed, vy: 0, life: 1, owner: 'player', kind: 'paint', damage: 1, color: 0xff0000 });
                g.updateProjectiles(.025);
            }
        } finally { g.effects.impact = original; g.removeProjectileMesh = remove; }
        return impacts;
    });
    check(wall.length === 3 && wall.every(h => Math.abs(h.x - h.face) < .0001 && h.normal === -1), 'wall splat lies on hit face at three projectile speeds');
    await page.screenshot({ path: `${out}/floor3-pause.png` });
    // The soundtrack must survive real time, not just an eight-second offline preview.
    const song = await page.evaluate(() => TQ.songData('archives'));
    const seconds = Math.max(Number(process.env.TQ_SOAK_SECONDS) || 48, Math.ceil(song.length * 60 / song.bpm) + 8);
    console.log('Sampling Floor 3 music for', seconds, 'seconds');
    for (let i = 0; i < seconds; i++) {
        await page.waitForTimeout(1000);
        samples.push(await page.evaluate(() => TQ.audioHealth()));
        if (i > 48 && i % 15 === 0) await page.evaluate(() => { TQ.setState(TQ.state === 'play' ? 'pause' : 'play'); });
        if (i % 20 === 0) console.log('Music sample', i, samples.at(-1).musicDb, 'dB');
    }
    check(samples.every(s => s.state === 'running' && s.playing && s.musicDb > -75 && s.schedulerErrors === 0), 'music remains audible through a complete Floor 3 loop');
    await page.evaluate(() => TQ.setState('pause'));
    // Reproduce post-start context suspension, then recover on the next input.
    await page.evaluate(() => window.testAudioContext.suspend());
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => TQ.audioHealth().state === 'running');
    check(await page.evaluate(() => TQ.logs().some(e => e.event === 'audio.resumed')), 'post-start audio suspension recovers and logs');
    // One thrown voice must not permanently terminate the scheduler timer.
    await page.evaluate(() => {
        const ctx = window.testAudioContext, original = ctx.createOscillator.bind(ctx);
        ctx.createOscillator = () => { ctx.createOscillator = original; throw new Error('injected voice failure'); };
    });
    await page.waitForFunction(() => TQ.audioHealth().schedulerErrors > 0);
    await page.waitForTimeout(2000);
    check(await page.evaluate(() => { const a = TQ.audioHealth(); return a.queuedMs > 100 && a.schedulerAgeMs < 300 && a.musicDb > -75; }), 'scheduler continues after an injected voice error');
    const recovery = page.locator('#pause-items').getByText('Recover Audio', { exact: true });
    await recovery.click();
    await page.waitForTimeout(1800);
    check(await page.evaluate(() => TQ.state === 'pause' && TQ.game.levelIndex === 2 && TQ.audioHealth().musicDb > -75 && TQ.logs().some(e => e.event === 'audio.recovered')), 'Recover Audio restarts sound without resetting Floor 3');
    // Check keyboard wrap after adding the new menu action.
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowUp');
    check((await page.locator('#pause-items .selected').textContent()).trim() === 'Quit to Menu', 'pause keyboard wraps to final item');
    check(errors.length === 0, 'no runtime exceptions');
    writeFileSync(`${out}/incident-sanity.json`, JSON.stringify({ checks, decal, wall, samples, errors }, null, 2));
} finally { await browser.close(); }
