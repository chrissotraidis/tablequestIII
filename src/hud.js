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
import { FaceAnim, FACE_DEFAULTS } from './face.js';
const faceAnim = new FaceAnim(); let faceLast = 0;

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

// R2.2: signals the portrait listens to
const face = { hurtDir: 0, splat: null, pickupAt: -99, hurtAt: -99 };
const TOOL_ICON = { // 12×7 pixel tools, drawn 3× into the rack slot canvases
    paintbrush: ['....bbb.....', '....bbb.....', '.hhhhhhh....', 'wwwwwwwwwwr.', '.hhhhhhh....', '....bbb.....', '....bbb.....'],
    tableLeg:   ['............', 'ddwwwwwwwwd.', 'dwwwwwwwwwwd', 'dwwwwwwwwwwd', 'ddwwwwwwwwd.', '............', '............'],
    nailgun:    ['..oooooo....', '..oooooooo..', 'ssoooooooo..', '..oooooo....', '....dd......', '....dd......', '....ddd.....'],
    roller:     ['..mmmmmmmm..', '.mmmmmmmmmmy', '.mmmmmmmmmmy', '..mmmmmmmm..', '....dd......', '....dd......', '....ddd.....'],
    sprayer:    ['..rrrrr.....', '.rrrrrrr.ss.', '.rrrrrrrsss.', '..rrrrr.ss..', '....dd......', '....dd......', '....ddd.....'],
};
const ICON_COL = { b: '#8a5a2e', h: '#d8d5cc', w: '#8a5a2c', r: '#cc3322', o: '#e07820', s: '#8a929c', d: '#2b3038', m: '#4a525c', y: '#ffaa22' };
function drawToolIcon(c, key) {
    const rows = TOOL_ICON[key]; if (!rows) return;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, c.width, c.height);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { ctx.fillStyle = ICON_COL[ch]; ctx.fillRect(x, y, 1, 1); } }));
}

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
        face.hurtDir = Math.abs(Math.sin(angleRel)) < 0.3 ? 0 : Math.sin(angleRel) > 0 ? 1 : -1; // R2.2: the portrait flinches away from the hit
        face.hurtAt = performance.now();
        if (dirTimer) clearTimeout(dirTimer);
        dirTimer = setTimeout(() => el.classList.remove('on'), holdMs);
        poke();
    },

    /** crosshair fades as the sights come up (the ADS dot takes over) */
    setAim(t) {
        const v = (1 - t).toFixed(2);
        if (lastVals._aim === v) return;
        lastVals._aim = v;
        $('crosshair').style.setProperty('--ads', t.toFixed(2));
        if (t > 0.05) poke();
    },

    /** R4.3: dynamic crosshair — gap in px, style 'lines' | 'melee', hidden while sprinting */
    setCrosshair({ gap = 6, style = 'lines', hidden = false, aim = 0 }) {
        const el = $('crosshair');
        const gv = Math.round(gap);
        if (lastVals._chGap !== gv) { lastVals._chGap = gv; el.style.setProperty('--gap', gv + 'px'); }
        if (lastVals._chStyle !== style) { lastVals._chStyle = style; el.classList.toggle('melee', style === 'melee'); }
        if (lastVals._chHidden !== hidden) { lastVals._chHidden = hidden; el.classList.toggle('sprint', hidden); }
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
        setText('hud-floor-name', `FLOOR ${num} · ${name.toUpperCase()}`);
        poke();
    },

    updateFloorCard(time) {
        const el = $('floor-card');
        if (this.holdCard) { el.style.opacity = 1; return; } // harness: pin the card for captures
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
        if (lastVals._hpState !== hpState) { lastVals._hpState = hpState; hpEl.style.color = hpState === 'low' ? '#ff5a4a' : hpState === 'mid' ? '#ffb070' : ''; $('health-trough')?.classList.toggle('low', hpState === 'low'); }

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
            $('paint-trough')?.classList.toggle('low', ammoState === 'low');
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
                html += `<div class="${cls}"><canvas class="ricon" width="12" height="7" data-w="${k || ''}"></canvas><span class="wname">${def ? (def.short || def.name) : '—'}</span><span class="num">${i + 1}</span></div>`;
            }
            $('weapon-rack').innerHTML = html;
            $('weapon-rack').querySelectorAll('.ricon').forEach((c, i) => drawToolIcon(c, c.dataset.w || ['paintbrush', 'tableLeg', 'nailgun', 'roller', 'sprayer'][i]));
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
        setText('hud-floor-name', `FLOOR ${game.levelIndex + 1} · ${game.level.name.toUpperCase()}`);

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
        face.pickupAt = performance.now(); // R2.2: a grin on the portrait
        poke();
    },

    /** R2.2: the colour of the last paint that hit Sandy (portrait cheek splat) */
    setSplat(cssColor) { face.splat = cssColor; },

    /** R2.3: "ALREADY FULL" and friends, on the bench */
    benchHint(text, ms = 1200) {
        let el = $('bench-hint');
        if (!el) { el = document.createElement('div'); el.id = 'bench-hint'; el.className = 'bench-hint'; $('bench').appendChild(el); }
        el.textContent = text; el.classList.add('on');
        clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms);
    },

    /** Sandy's portrait on the bench (R2.2); also mirrored onto the pause panel when it is open */
    drawFace(player, time, game = null) {
        const c = $('face-canvas');
        if (!c || !player) return;
        const now = performance.now() / 1000;
        const f = { ...FACE_DEFAULTS, hp: player.health, dead: !player.alive || player.health <= 0 };
        f.hurtAge = player.lastHurtTime ? time - player.lastHurtTime : 99;
        f.hurtDir = face.hurtDir; f.splat = face.splat;
        f.grinAge = now - face.pickupAt / 1000;
        if (game) {
            f.aim = game.aim || 0; f.sprint = !!game.sprinting; f.moving = !!game.moving;
            f.fireAge = game.recoil > 0.85 ? 0.05 : 1;
            const wk = player.weapons[player.currentWeapon]; f.heavy = wk === 'roller' || wk === 'tableLeg' || wk === 'nailgun';
            f.rage = !!(game.boss && game.boss.alive && game.boss.phase2);
            f.tint = game.level ? '#' + (game.level.accent ?? 0x5a6a80).toString(16).padStart(6, '0') : null;
        }
        const dt = faceLast ? Math.min(0.1, now - faceLast) : 0.016; faceLast = now;
        faceAnim.update(dt, f); faceAnim.draw(c.getContext('2d'));
        const pc = $('pause-face');
        if (pc && pc.offsetParent) { const pctx = pc.getContext('2d'); pctx.imageSmoothingEnabled = true; pctx.drawImage(c, 0, 0); }
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

    /** MODERN M6.3: audio debug meter — room, bed, mix flags, master level, last cue */
    audioMeter(dbg, m) {
        const el = $('audio-meter');
        if (!el || el.classList.contains('hidden')) return;
        const bars = Math.max(0, Math.min(24, Math.round((m.db + 48) / 2)));
        const flags = [dbg.mix.combat && 'COMBAT', dbg.mix.lowHealth && 'LOW HP', dbg.mix.bossPhase2 && 'PHASE 2'].filter(Boolean).join(' · ') || 'calm';
        el.innerHTML = `<div class="am-row"><span>MASTER</span><span class="am-bar"><i style="width:${bars / 24 * 100}%"></i></span><span>${m.db > -90 ? m.db.toFixed(0) + ' dB' : '—'}</span></div>`
            + `<div class="am-row"><span>SONG</span><span>${dbg.song || '—'}${dbg.songBpm ? ' · ' + dbg.songBpm + ' BPM' : ''}</span></div>`
            + `<div class="am-row"><span>ROOM</span><span>${dbg.roomLabel || dbg.room}</span></div>`
            + `<div class="am-row"><span>BED</span><span>${dbg.ambience || 'none'}</span></div>`
            + `<div class="am-row"><span>MIX</span><span>${flags} · duck ${(dbg.mixLog.at(-1)?.duck ?? 1).toFixed(2)}</span></div>`
            + `<div class="am-row"><span>SFX</span><span>${m.sfx || '—'} · ${dbg.sfx.length} cues · ${dbg.instruments.length} voices</span></div>`;
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
