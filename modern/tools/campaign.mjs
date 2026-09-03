/**
 * Full autopilot campaign (GOAL_LOOP M7.1): the harness bot plays Floors 1–6
 * in the modern build — tables, supplies, elevators, the Head Designer — with
 * a grid pathfinder over the live world and the classic retry on death.
 *   node modern/tools/campaign.mjs [url] [outJson]     (TURBO=8 sim steps per frame)
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const outPath = process.argv[3] || 'modern/docs/M7.1/campaign.json';
const turbo = Number(process.env.TURBO || 8);
const firstFloor = Number(process.env.START || 0);
fs.mkdirSync(outPath.replace(/\/[^/]+$/, ''), { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
const t0 = Date.now();
const result = await p.evaluate(async ({ turbo, firstFloor }) => {
    TQ.skipBoot(); TQ.setTestMode(true); TQ.setTurbo(turbo);
    TQ.startGameAt(firstFloor); if (TQ.state === 'loading') TQ.deploy();
    const g = TQ.game;
    const wall = (ms) => new Promise(r => setTimeout(r, ms));
    const floors = [];
    let deaths = 0, guard = 0, cur = null;
    const dead = new Set(); // targets that did not consume on arrival (owned weapons, unreachable spots)
    const tkey = (i) => `${g.levelIndex}:${i.kind}:${i.x},${i.y}`;
    const want = (i) => i.active && !dead.has(tkey(i)) && !(i.kind.startsWith('weapon:') && g.player.weapons.includes(i.kind.slice(7)));
    const key = (x, y) => `${x},${y}`;
    const passable = (w, x, y) => {
        if (x < 0 || y < 0 || x >= w.w || y >= w.h) return false;
        if (w.propCells.has(key(x, y))) return false;
        if (w.doors.has(key(x, y))) return true;     // closed doors: the bot opens them when it bumps
        return !w.isSolidCell(x, y);
    };
    const path = (w, sx, sy, tx, ty) => { // BFS over cells, 4-neighbour; returns cell centres
        const W = w.w, prev = new Int32Array(W * w.h).fill(-1), seen = new Uint8Array(W * w.h);
        const q = [sy * W + sx]; seen[sy * W + sx] = 1;
        const goal = ty * W + tx;
        while (q.length) {
            const c = q.shift();
            if (c === goal) break;
            const cx = c % W, cy = (c - cx) / W;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
                if (nx < 0 || ny < 0 || nx >= W || ny >= w.h || seen[n]) continue;
                if (!passable(w, nx, ny) && n !== goal) continue;
                seen[n] = 1; prev[n] = c; q.push(n);
            }
        }
        if (!seen[goal]) return null;
        const out = [];
        for (let c = goal; c !== -1 && c !== sy * W + sx; c = prev[c]) out.push([c % W + 0.5, Math.floor(c / W) + 0.5]);
        out.reverse();
        // drop collinear middles so the bot takes longer straight legs
        const simp = [];
        for (let i = 0; i < out.length; i++) {
            const a = simp[simp.length - 1], b2 = out[i], c = out[i + 1];
            if (a && c && ((a[0] === b2[0] && b2[0] === c[0]) || (a[1] === b2[1] && b2[1] === c[1]))) continue;
            simp.push(b2);
        }
        return simp;
    };
    const foesNear = () => g.enemies.filter(e => e.alive && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 10 && g.world.lineOfSight(g.player.x, g.player.y, e.x, e.y));
    const goTo = async (tx, ty, label) => { // walk a path; fight whatever shows up on the way
        const w = g.world, p = g.player;
        const wp = path(w, Math.floor(p.x), Math.floor(p.y), Math.floor(tx), Math.floor(ty));
        if (!wp) return 'no-path';
        wp[wp.length - 1] = [tx, ty];
        for (const [x, y] of wp) {
            if (TQ.state !== 'play') return TQ.state;
            if (foesNear().length) { const r = await TQ.botFight(4); if (r !== 'clear' && r !== 'level-changed') return r; }
            const r = await TQ.botGoto(x, y, 5);
            if (r === 'dead' || r === 'level-changed') return r;
            if (r === 'timeout') { // nudge: try the waypoint once more after opening whatever is in the way
                const r2 = await TQ.botGoto(x, y, 4);
                if (r2 === 'dead' || r2 === 'level-changed') return r2;
                if (r2 === 'timeout') return 'stuck:' + label;
            }
        }
        return 'arrived';
    };
    const nearest = (items) => items.sort((a, b) => Math.hypot(a.x - g.player.x, a.y - g.player.y) - Math.hypot(b.x - g.player.x, b.y - g.player.y))[0];
    const startFloor = () => { cur = { floor: g.levelIndex + 1, name: g.level.name, t0: g.time, deathsBefore: deaths, staff: g.enemies.length, tablesNeeded: g.requiredTables, legs: [] }; };
    startFloor();
    while (TQ.state !== 'victory' && guard++ < 2500) {
        const st = TQ.state;
        if (st === 'gameover') { deaths++; cur.legs.push('death'); if (deaths > 12) break; for (const k of [...dead]) if (k.startsWith(g.levelIndex + ':')) dead.delete(k); TQ.retry(); await wall(200); continue; }
        if (st === 'loading') { TQ.deploy(); await wall(100); continue; }
        if (st === 'transition') { await wall(150); continue; }
        if (st !== 'play') { await wall(200); continue; }
        if (cur.floor !== g.levelIndex + 1) { // arrived on a new floor: close the previous record
            cur.time = +(g.time - cur.t0).toFixed(1); floors.push(cur); startFloor();
        }
        const p = g.player, w = g.world;
        let r, target = null;
        const pick = (pred) => { const c = g.pickups.filter(i => want(i) && pred(i)); return c.length ? nearest(c) : null; };
        if (p.health < 35 && (target = pick(i => i.kind === 'health'))) r = await goTo(target.x, target.y, 'health');
        else if (p.ammo < 6 && (target = pick(i => i.kind === 'ammo'))) r = await goTo(target.x, target.y, 'ammo');
        else if ((target = pick(i => i.kind.startsWith('weapon:')))) r = await goTo(target.x, target.y, target.kind);
        else if ((target = pick(i => i.kind === 'table'))) r = await goTo(target.x, target.y, 'table');
        else if (g.boss && g.boss.alive) { r = await goTo(g.boss.x, g.boss.y, 'boss'); if (TQ.state === 'play') r = await TQ.botFight(8); }
        else if (!w.elevatorCells.length) { await wall(300); continue; } // Penthouse after the boss: wait for the victory state
        else { const [ex, ey] = w.elevatorCells[0]; r = await goTo(ex + 0.5, ey + 0.5, 'elevator'); if (r === 'arrived') { await TQ.botSleep(0.4); } }
        cur.legs.push(r);
        if (target && r === 'arrived') { await TQ.botSleep(0.2); if (target.active) dead.add(tkey(target)); } // arrived but not consumed: never chase it again
        if (target && typeof r === 'string' && r.startsWith('stuck')) dead.add(tkey(target));
        if (typeof r === 'string' && r.startsWith('stuck')) { // unstick: random nearby walkable cell, then re-plan
            const cx = Math.floor(p.x) + (Math.random() < 0.5 ? -1 : 1), cy = Math.floor(p.y) + (Math.random() < 0.5 ? -1 : 1);
            if (passable(w, cx, cy)) await TQ.botGoto(cx + 0.5, cy + 0.5, 3);
        }
        if (r === 'no-path') await TQ.botSleep(0.3);
    }
    cur.time = +(g.time - cur.t0).toFixed(1); floors.push(cur);
    for (const f of floors) { f.deaths = (floors.indexOf(f) + 1 < floors.length ? floors[floors.indexOf(f) + 1].deathsBefore : deaths) - f.deathsBefore; delete f.deathsBefore; delete f.t0; f.legs = f.legs.slice(-40); }
    const p2 = g.player;
    return { won: TQ.state === 'victory', state: TQ.state, deaths, guard, gameTime: +g.time.toFixed(1), score: p2.score, floors,
        end: { floor: g.levelIndex + 1, pos: [+p2.x.toFixed(1), +p2.y.toFixed(1)], hp: p2.health, ammo: p2.ammo, tables: `${p2.tables}/${g.requiredTables}`, activeTables: g.pickups.filter(i => i.active && i.kind === 'table').map(i => [i.x, i.y]), staffAlive: g.enemies.filter(e => e.alive).length, dead: [...dead] } };
}, { turbo, firstFloor });
result.wallMinutes = +((Date.now() - t0) / 60000).toFixed(1);
result.errors = errors;
fs.writeFileSync(outPath, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ won: result.won, state: result.state, deaths: result.deaths, gameTime: result.gameTime, score: result.score, wallMinutes: result.wallMinutes, floors: result.floors.map(f => `${f.floor}:${f.time}s/${f.deaths}d`), errors }));
await b.close();
