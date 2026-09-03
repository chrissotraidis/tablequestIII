/**
 * HUD — MODERN (GOAL_LOOP M3.1)
 *
 * Same API the game code has always called (show/hide/update/toast/
 * hitMarker/damageFlash/pickupFlash/drawFace/drawMinimap/toggleMinimap/
 * setLockHint/setAim/damageDir) plus `floorCard`. The workbench bar is gone;
 * the 2005–2007 layout is:
 *   top centre   compass tape with objective bearings (+ boss bar beneath)
 *   top left     objective line, counters, notification feed
 *   bottom left  health bar + number, floor
 *   bottom right weapon name, paint count + bar, five slot pips
 *   world        one projected marker on the nearest objective, with distance
 * The whole HUD fades to 42 % after 4 s without an event and snaps back on
 * damage, fire, pickup, swap, or objective change.
 */
import * as THREE from 'three';
import { CELL } from './config.js';

const $ = (id) => document.getElementById(id);

let hitTimer = null;
let dirTimer = null;
let cardShownAt = null;
let cardPending = false;

// dirty-check cache: only touch the DOM when a value actually changes
const lastVals = {};
function setText(id, val) {
    if (lastVals[id] === val) return;
    lastVals[id] = val;
    $(id).textContent = val;
}

// minimap wall layer cache (Tab map, unchanged from classic; restyled in M3.2)
let mmCanvas = null;
let mmKey = '';

// idle fade
let lastEvent = 0;
let idle = false;
const IDLE_AFTER = 4; // seconds
function poke(time) { lastEvent = time ?? lastEvent; if (idle) { idle = false; $('hud').classList.remove('idle'); } }

const _v = new THREE.Vector3();

export const hud = {
    show() { $('hud').classList.remove('hidden'); $('crosshair').classList.remove('hidden'); poke(); },
    hide() {
        $('hud').classList.add('hidden');
        $('crosshair').classList.add('hidden');
        $('minimap').classList.add('hidden');
        $('boss-bar-wrap').classList.add('hidden');
        $('lowhp-overlay').classList.add('hidden');
        $('lock-hint').classList.add('hidden');
        $('damage-dir').classList.remove('on');
        $('obj-marker').classList.add('hidden');
        $('floor-card').style.opacity = 0; cardShownAt = null; cardPending = false;
        $('tacmap').classList.add('hidden');
    },

    /** four-tick marker; kill = red + pop, held a little longer */
    hitMarker(kill = false, holdMs = kill ? 220 : 110) {
        const el = $('hit-marker');
        el.classList.toggle('kill', !!kill);
        el.style.transition = 'none';
        el.style.opacity = 1;
        requestAnimationFrame(() => { el.style.transition = ''; });
        if (hitTimer) clearTimeout(hitTimer);
        hitTimer = setTimeout(() => { el.style.opacity = 0; el.classList.remove('kill'); }, holdMs);
        poke();
    },

    /** where a hit came from. angleRel = radians, 0 = ahead, +right */
    damageDir(angleRel, holdMs = 420) {
        const el = $('damage-dir');
        el.style.transform = `rotate(${(angleRel * 180 / Math.PI).toFixed(1)}deg)`;
        el.classList.add('on');
        if (dirTimer) clearTimeout(dirTimer);
        dirTimer = setTimeout(() => el.classList.remove('on'), holdMs);
        poke();
    },

    /** crosshair fades as the sights come up */
    setAim(t) {
        const v = (1 - t).toFixed(2);
        if (lastVals._aim === v) return;
        lastVals._aim = v;
        $('crosshair').style.opacity = (0.85 * (1 - t)).toFixed(2);
        if (t > 0.05) poke();
    },

    setLockHint(show) {
        $('lock-hint').classList.toggle('hidden', !show);
    },

    /** floor intro card: FLOOR n / NAME / subtitle. Alpha is driven from update()
     *  (fade in 0.3 s, hold, fade out 0.7 s) so it never depends on CSS transitions. */
    floorCard(num, name, subtitle) {
        $('fc-num').textContent = num;
        $('fc-name').textContent = name.toUpperCase();
        $('fc-sub').textContent = subtitle || '';
        cardShownAt = null; // armed: first update() stamps the game time
        cardPending = true;
        setText('hud-floor-name', name.toUpperCase());
        poke();
    },

    updateFloorCard(time) {
        const el = $('floor-card');
        if (cardPending) { cardPending = false; cardShownAt = time; }
        if (cardShownAt === null) return;
        const t = time - cardShownAt;
        const a = t < 0.3 ? t / 0.3 : t < 3.4 ? 1 : t < 4.1 ? 1 - (t - 3.4) / 0.7 : 0;
        const v = a.toFixed(2);
        if (lastVals._card !== v) { lastVals._card = v; el.style.opacity = v; }
        if (a <= 0) cardShownAt = null;
    },

    update(player, game) {
        const time = game.time || 0;
        if (lastVals._lastPlayer !== player) { lastVals._lastPlayer = player; lastEvent = time; }

        // ---- health
        const hp = Math.max(0, Math.ceil(player.health));
        if (lastVals.hp !== hp) { if (lastVals.hp !== undefined && hp < lastVals.hp) poke(time); lastVals.hp = hp; }
        setText('hud-health', hp);
        const hbw = Math.max(0, Math.round(player.health)) + '%';
        if (lastVals._hbw !== hbw) { lastVals._hbw = hbw; $('healthbar').style.width = hbw; }
        const hpEl = $('hud-health');
        const hpState = hp <= 25 ? 'low' : hp <= 50 ? 'mid' : 'ok';
        if (lastVals._hpState !== hpState) { lastVals._hpState = hpState; hpEl.style.color = hpState === 'low' ? '#ff5a4a' : hpState === 'mid' ? '#ffb070' : ''; }

        // ---- paint + weapon
        if (lastVals.ammo !== player.ammo) { if (lastVals.ammo !== undefined) poke(time); lastVals.ammo = player.ammo; }
        setText('hud-ammo', player.ammo);
        const pbw = Math.max(0, Math.round((player.ammo / 99) * 100)) + '%';
        if (lastVals._pbw !== pbw) { lastVals._pbw = pbw; $('paintbar').style.width = pbw; }
        const wKey = player.weapons[player.currentWeapon];
        const wDef = game.weaponDefs[wKey];
        setText('wpn-name', wDef ? wDef.name : '');
        const ammoEl = $('hud-ammo');
        const ammoState = wDef?.type === 'melee' ? 'melee' : player.ammo <= 8 ? 'low' : 'ok';
        if (lastVals._ammoState !== ammoState) {
            lastVals._ammoState = ammoState;
            ammoEl.style.color = ammoState === 'low' ? '#ff5a4a' : '';
            ammoEl.style.opacity = ammoState === 'melee' ? '0.35' : '1';
        }
        const rackSig = `${player.weapons.join(',')}|${player.currentWeapon}`;
        if (lastVals._rack !== rackSig) {
            if (lastVals._rack !== undefined) poke(time);
            lastVals._rack = rackSig;
            let html = '';
            for (let i = 0; i < 5; i++) {
                const k = player.weapons[i];
                const def = k && game.weaponDefs[k];
                const cls = 'rack-slot' + (i === player.currentWeapon ? ' active' : '') + (def ? '' : ' empty');
                html += `<div class="${cls}"><span class="num">${i + 1}</span><span class="wname">${def ? (def.short || def.name) : '—'}</span></div>`;
            }
            $('weapon-rack').innerHTML = html;
        }

        // ---- counters
        setText('hud-score', player.score.toLocaleString());
        setText('hud-floor', game.levelIndex + 1);
        setText('hud-enemies', game.enemiesAlive);
        const done = player.tables >= game.requiredTables;
        const tSig = `${player.tables}/${game.requiredTables}`;
        setText('hud-tables', tSig);
        if (lastVals._ticons !== tSig) {
            if (lastVals._ticons !== undefined) poke(time);
            lastVals._ticons = tSig;
            const holder = $('hud-tables-icons');
            if (game.requiredTables > 0 && game.requiredTables <= 6) {
                let html = '';
                for (let i = 0; i < game.requiredTables; i++) html += `<span class="t-icon${i < player.tables ? ' got' : ''}"></span>`;
                holder.innerHTML = html;
            } else holder.innerHTML = '';
            $('hud-tables').style.color = done ? '#7dff9a' : '';
        }

        // ---- objective line + boss bar
        if (game.level.boss) {
            const boss = game.boss;
            const bossUp = !!(boss && boss.alive);
            if (lastVals._boss !== bossUp) { lastVals._boss = bossUp; $('boss-bar-wrap').classList.toggle('hidden', !bossUp); }
            if (bossUp) {
                const bw = Math.max(0, Math.round((boss.health / boss.maxHealth) * 100)) + '%';
                if (lastVals._bw !== bw) { lastVals._bw = bw; $('boss-bar').style.width = bw; }
            }
            setText('objective-text', 'DEFEAT THE HEAD DESIGNER');
        } else {
            if (lastVals._boss !== false) { lastVals._boss = false; $('boss-bar-wrap').classList.add('hidden'); }
            setText('objective-text', done ? 'TABLES SECURED — REACH THE ELEVATOR' : `COLLECT ${game.requiredTables} TABLES`);
        }
        setText('hud-floor-name', game.level.name.toUpperCase());

        // ---- low health pulse (classic overlay)
        const lowhp = !(player.health > 25 || player.health <= 0);
        if (lastVals._lowhp !== lowhp) { lastVals._lowhp = lowhp; $('lowhp-overlay').classList.toggle('hidden', !lowhp); }

        // ---- floor card, compass, objective marker
        this.updateFloorCard(time);
        this.drawCompass(player, game);
        this.updateMarker(player, game);

        // ---- idle fade
        if (game.recoil > 0.9 || game.aim > 0.05) poke(time);
        const shouldIdle = time - lastEvent > IDLE_AFTER;
        if (shouldIdle !== idle) { idle = shouldIdle; $('hud').classList.toggle('idle', idle); }
    },

    /** objective targets: uncollected tables, or the elevator pad once unlocked, or the boss */
    objectives(game, player) {
        const out = [];
        if (game.level.boss) {
            if (game.boss?.alive) out.push({ x: game.boss.x, y: game.boss.y, kind: 'boss' });
            return out;
        }
        if (player.tables >= game.requiredTables) {
            const cells = game.world.elevatorCells;
            if (cells.length) {
                let cx = 0, cy = 0; for (const [x, y] of cells) { cx += x + 0.5; cy += y + 0.5; }
                out.push({ x: cx / cells.length, y: cy / cells.length, kind: 'elevator' });
            }
            return out;
        }
        for (const it of game.pickups) if (it.active && it.kind === 'table') out.push({ x: it.x, y: it.y, kind: 'table' });
        return out;
    },

    drawCompass(player, game) {
        const c = $('compass');
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;
        ctx.clearRect(0, 0, W, H);
        // heading: player.rot is world yaw (0 = +x). Show as a tape, 120° visible.
        const heading = player.rot;
        const span = Math.PI * 2 / 3, pxPerRad = W / span;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 10, W, 14);
        ctx.strokeStyle = 'rgba(242,240,232,0.55)';
        ctx.fillStyle = 'rgba(242,240,232,0.9)';
        ctx.font = 'bold 11px "Roboto Condensed", "Arial Narrow", Arial, sans-serif';
        ctx.textAlign = 'center';
        const labels = { 0: 'E', 90: 'S', 180: 'W', 270: 'N' }; // world +x east, +y south (screen down on the map)
        for (let deg = -180; deg < 540; deg += 15) {
            const a = deg * Math.PI / 180;
            let d = a - heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) > span / 2) continue;
            const x = W / 2 + d * pxPerRad;
            const norm = ((deg % 360) + 360) % 360;
            const major = norm % 90 === 0, mid = norm % 45 === 0;
            ctx.beginPath(); ctx.moveTo(x, major ? 8 : mid ? 12 : 15); ctx.lineTo(x, major ? 26 : mid ? 24 : 21); ctx.lineWidth = major ? 2 : 1; ctx.stroke();
            if (major) ctx.fillText(labels[norm], x, 33);
        }
        // objective bearings on the tape
        for (const o of this.objectives(game, player)) {
            let d = Math.atan2(o.y - player.y, o.x - player.x) - heading;
            while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
            const x = Math.max(6, Math.min(W - 6, W / 2 + d * pxPerRad));
            ctx.fillStyle = o.kind === 'elevator' ? '#58f08a' : o.kind === 'boss' ? '#ff4a3a' : '#ffd35a';
            ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x + 5, 8); ctx.lineTo(x, 14); ctx.lineTo(x - 5, 8); ctx.closePath(); ctx.fill();
        }
        // centre needle
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(W / 2, 4); ctx.lineTo(W / 2 + 4, 0); ctx.lineTo(W / 2 - 4, 0); ctx.closePath(); ctx.fill();
    },

    /** project the nearest objective into screen space */
    updateMarker(player, game) {
        const el = $('obj-marker');
        const objs = this.objectives(game, player);
        if (!objs.length || !game.camera) { el.classList.add('hidden'); return; }
        let best = null, bd = Infinity;
        for (const o of objs) { const d = Math.hypot(o.x - player.x, o.y - player.y); if (d < bd) { bd = d; best = o; } }
        if (bd < 1.2) { el.classList.add('hidden'); return; } // standing on it
        _v.set(best.x, best.kind === 'boss' ? 1.3 : 0.75, best.y).project(game.camera);
        if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { el.classList.add('hidden'); return; }
        const cw = window.innerWidth, ch = window.innerHeight;
        el.style.left = ((_v.x + 1) / 2 * cw).toFixed(0) + 'px';
        el.style.top = ((1 - _v.y) / 2 * ch).toFixed(0) + 'px';
        el.classList.toggle('elevator', best.kind === 'elevator');
        const dist = Math.round(bd * 2.5) + 'm'; // 1 cell ≈ 2.5 m at this scale
        if (lastVals._dist !== dist) { lastVals._dist = dist; el.querySelector('.om-dist').textContent = dist; }
        el.classList.remove('hidden');
    },

    /** notification feed (replaces the classic centre toast). color: gold|green|red|'' */
    toast(msg, ms = 2200, color = '') {
        const feed = $('feed');
        const item = document.createElement('div');
        item.className = 'feed-item' + (color ? ' ' + color : '');
        item.textContent = msg;
        feed.appendChild(item);
        requestAnimationFrame(() => item.classList.add('on'));
        while (feed.children.length > 5) feed.removeChild(feed.firstChild);
        setTimeout(() => { item.classList.remove('on'); setTimeout(() => item.remove(), 300); }, ms);
        poke();
    },

    damageFlash(strength = 0.6) {
        const el = $('damage-overlay');
        el.style.opacity = strength;
        setTimeout(() => { el.style.opacity = 0; }, 120);
        poke();
    },

    pickupFlash() {
        const el = $('pickup-overlay');
        el.style.opacity = 1;
        setTimeout(() => { el.style.opacity = 0; }, 180);
        poke();
    },

    /** Sandy's pixel portrait (now on the pause panel; skipped while hidden) */
    drawFace(player, time) {
        const c = $('face-canvas');
        if (!c || !c.offsetParent) return;
        const ctx = c.getContext('2d');
        const hp = player.health;
        ctx.clearRect(0, 0, 32, 32);
        ctx.fillStyle = '#2e2e33';
        ctx.fillRect(0, 0, 32, 32);
        const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
        px(7, 6, 18, 14, '#d9a34a');
        px(5, 10, 4, 12, '#d9a34a');
        px(23, 10, 4, 12, '#d9a34a');
        const skin = hp > 33 ? '#eebb93' : '#dba383';
        px(9, 10, 14, 13, skin);
        px(6, 3, 20, 6, '#b22230');
        px(14, 1, 4, 3, '#8a1422');
        const blink = Math.floor(time / 0.18) % 22 === 0;
        const dmgRecent = player.lastHurtTime && time - player.lastHurtTime < 0.5;
        if (blink && !dmgRecent) {
            px(11, 15, 4, 1, '#5a3a1a');
            px(18, 15, 4, 1, '#5a3a1a');
        } else if (dmgRecent || hp <= 0) {
            px(11, 14, 4, 3, hp <= 0 ? '#999' : '#fff');
            px(18, 14, 4, 3, hp <= 0 ? '#999' : '#fff');
            px(12, 15, 2, 1, '#a02');
            px(19, 15, 2, 1, '#a02');
        } else {
            px(11, 13, 4, 4, '#fff');
            px(18, 13, 4, 4, '#fff');
            const look = Math.floor(time / 2.6) % 3 - 1;
            px(12 + look, 14, 2, 2, '#2a4a8a');
            px(19 + look, 14, 2, 2, '#2a4a8a');
        }
        if (hp < 66) { px(11, 11, 4, 1, '#a8742a'); px(18, 11, 4, 1, '#a8742a'); }
        if (hp > 66) { px(13, 19, 6, 1, '#7a3a2a'); px(12, 18, 1, 1, '#7a3a2a'); px(19, 18, 1, 1, '#7a3a2a'); }
        else if (hp > 33) px(13, 19, 6, 1, '#7a3a2a');
        else { px(13, 19, 6, 2, '#5a1a12'); px(14, 18, 4, 1, '#7a3a2a'); }
        px(9, 17, 2, 2, '#3a6acc');
    },

    drawMinimap(game, player) {
        const c = $('minimap');
        if (c.classList.contains('hidden')) return;
        const world = game.world;
        this.sizeTacmap(world);
        setText('tac-title', `TACTICAL MAP — FLOOR ${game.levelIndex + 1} · ${game.level.name.toUpperCase()}`);
        setText('tac-sub', game.level.subtitle || '');
        const ctx = c.getContext('2d');
        const sx = c.width / world.w, sy = c.height / world.h;
        const key = `${game.levelIndex}:${world.gatesUnlocked}:${c.width}:${world.propsVersion || 0}`;
        if (mmKey !== key) {
            mmKey = key;
            mmCanvas = mmCanvas || document.createElement('canvas');
            mmCanvas.width = c.width; mmCanvas.height = c.height;
            const mctx = mmCanvas.getContext('2d');
            mctx.fillStyle = 'rgba(10, 26, 48, 0.92)';
            mctx.fillRect(0, 0, c.width, c.height);
            mctx.strokeStyle = 'rgba(120, 160, 210, 0.08)';
            mctx.lineWidth = 1;
            for (let gx = 0; gx < c.width; gx += 16) { mctx.beginPath(); mctx.moveTo(gx, 0); mctx.lineTo(gx, c.height); mctx.stroke(); }
            for (let gy = 0; gy < c.height; gy += 16) { mctx.beginPath(); mctx.moveTo(0, gy); mctx.lineTo(c.width, gy); mctx.stroke(); }
            for (let y = 0; y < world.h; y++)
                for (let x = 0; x < world.w; x++) {
                    const t = world.cellRaw(x, y);
                    if (t === CELL.EMPTY) {
                        if (!world.propCells.has(world.key(x, y))) continue;
                        mctx.fillStyle = '#46658c';
                    }
                    else if (t === CELL.DOOR) mctx.fillStyle = '#c9a227';
                    else if (t === CELL.GATE) mctx.fillStyle = world.gatesUnlocked ? '#2a8a4a' : '#cc4433';
                    else if (t === CELL.ELEVATOR) mctx.fillStyle = '#3ae07a';
                    else mctx.fillStyle = '#a8c8e8';
                    mctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
                }
        }
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(mmCanvas, 0, 0);
        const g = Math.max(3, sx * 0.35); // glyph size scales with the cell
        for (const e of game.pickups) {
            if (!e.active) continue;
            if (e.kind === 'table') {
                ctx.save(); ctx.translate(e.x * sx, e.y * sy); ctx.rotate(Math.PI / 4);
                ctx.fillStyle = '#ffd35a'; ctx.shadowColor = '#ffd35a'; ctx.shadowBlur = 8;
                ctx.fillRect(-g, -g, g * 2, g * 2); ctx.restore();
            } else if (e.kind.startsWith('weapon:')) {
                ctx.fillStyle = '#9ad0ff'; ctx.fillRect(e.x * sx - g * 0.7, e.y * sy - g * 0.7, g * 1.4, g * 1.4);
            }
        }
        for (const e of game.enemies) {
            if (!e.alive) continue;
            ctx.fillStyle = e.variant === 'boss' ? '#ff3322' : '#ff7788';
            ctx.beginPath(); ctx.arc(e.x * sx, e.y * sy, e.variant === 'boss' ? g * 1.3 : g * 0.7, 0, 7); ctx.fill();
        }
        ctx.save();
        ctx.translate(player.x * sx, player.y * sy);
        ctx.rotate(player.rot);
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(g * 2.2, 0); ctx.lineTo(-g * 1.4, -g * 1.3); ctx.lineTo(-g * 0.6, 0); ctx.lineTo(-g * 1.4, g * 1.3); ctx.closePath(); ctx.fill();
        ctx.restore();
    },

    /** MODERN M3.2: Tab shows the full-screen tactical map (blueprint kept) */
    toggleMinimap() {
        const wrap = $('tacmap');
        wrap.classList.toggle('hidden');
        $('minimap').classList.toggle('hidden', wrap.classList.contains('hidden'));
        mmKey = ''; // re-rasterise the static layer at the new size
        poke();
    },

    /** size the map canvas to the floor's aspect inside the viewport */
    sizeTacmap(world) {
        const c = $('minimap');
        const maxW = Math.min(window.innerWidth * 0.66, 1100), maxH = Math.min(window.innerHeight * 0.62, 700);
        const k = Math.min(maxW / world.w, maxH / world.h);
        const w = Math.round(world.w * k), h = Math.round(world.h * k);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; mmKey = ''; }
    },
};
