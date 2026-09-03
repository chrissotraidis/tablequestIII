/**
 * HUD — DOM stats, pixel-art Sandy face, minimap, toasts.
 */
import { CELL } from './config.js';

const $ = (id) => document.getElementById(id);

let toastTimer = null;
let hitTimer = null;

// dirty-check cache: only touch the DOM when a value actually changes
const lastVals = {};
function setText(id, val) {
    if (lastVals[id] === val) return;
    lastVals[id] = val;
    $(id).textContent = val;
}

// minimap wall layer cache — walls/props are static per level, so they render
// once to an offscreen canvas instead of ~1200 fillRects every frame
let mmCanvas = null;
let mmKey = '';

export const hud = {
    show() { $('hud').classList.remove('hidden'); $('crosshair').classList.remove('hidden'); $('objective').classList.remove('hidden'); },
    hide() {
        $('hud').classList.add('hidden');
        $('crosshair').classList.add('hidden');
        $('objective').classList.add('hidden');
        $('minimap').classList.add('hidden');
        $('boss-bar-wrap').classList.add('hidden');
        $('lowhp-overlay').classList.add('hidden');
        $('lock-hint').classList.add('hidden');
    },

    hitMarker() {
        const el = $('hit-marker');
        el.style.opacity = 1;
        if (hitTimer) clearTimeout(hitTimer);
        hitTimer = setTimeout(() => { el.style.opacity = 0; }, 90);
    },

    setLockHint(show) {
        $('lock-hint').classList.toggle('hidden', !show);
    },

    update(player, game) {
        setText('hud-health', Math.max(0, Math.ceil(player.health)));
        const hbw = Math.max(0, Math.round(player.health)) + '%';
        if (lastVals._hbw !== hbw) {
            lastVals._hbw = hbw;
            $('healthbar').style.width = hbw;
        }
        setText('hud-ammo', player.ammo);
        const pbw = Math.max(0, Math.round((player.ammo / 99) * 100)) + '%';
        if (lastVals._pbw !== pbw) {
            lastVals._pbw = pbw;
            $('paintbar').style.width = pbw;
        }
        setText('hud-score', player.score.toLocaleString());
        setText('hud-floor', game.levelIndex + 1);

        const done = player.tables >= game.requiredTables;
        setText('hud-tables', `${player.tables}/${game.requiredTables}`);
        if (lastVals._tdone !== done) {
            lastVals._tdone = done;
            const t = $('hud-tables');
            t.style.color = done ? '#7dff7d' : '';
            t.style.textShadow = done ? '0 0 7px #0f0' : '';
        }

        // mini table icons light up as tables are reclaimed
        const tSig = `${player.tables}/${game.requiredTables}`;
        if (lastVals._ticons !== tSig) {
            lastVals._ticons = tSig;
            const holder = $('hud-tables-icons');
            if (game.requiredTables > 0 && game.requiredTables <= 6) {
                let html = '';
                for (let i = 0; i < game.requiredTables; i++)
                    html += `<span class="t-icon${i < player.tables ? ' got' : ''}"></span>`;
                holder.innerHTML = html;
            } else holder.innerHTML = '';
        }

        setText('hud-enemies', game.enemiesAlive);

        // low-health pulse
        const lowhp = !(player.health > 25 || player.health <= 0);
        if (lastVals._lowhp !== lowhp) {
            lastVals._lowhp = lowhp;
            $('lowhp-overlay').classList.toggle('hidden', !lowhp);
        }

        // pegboard tool rack: five slots, owned tools labelled, active lit
        const rackSig = `${player.weapons.join(',')}|${player.currentWeapon}`;
        if (lastVals._rack !== rackSig) {
            lastVals._rack = rackSig;
            let html = '';
            for (let i = 0; i < 5; i++) {
                const wKey = player.weapons[i];
                const def = wKey && game.weaponDefs[wKey];
                const cls = 'rack-slot'
                    + (i === player.currentWeapon ? ' active' : '')
                    + (def ? '' : ' empty');
                html += `<div class="${cls}"><span class="num">${i + 1}</span>` +
                    `<span class="wname">${def ? (def.short || def.name) : '—'}</span></div>`;
            }
            $('weapon-rack').innerHTML = html;
        }

        if (game.level.boss) {
            const boss = game.boss;
            const bossUp = !!(boss && boss.alive);
            if (lastVals._boss !== bossUp) {
                lastVals._boss = bossUp;
                $('boss-bar-wrap').classList.toggle('hidden', !bossUp);
            }
            if (bossUp) {
                const bw = Math.max(0, Math.round((boss.health / boss.maxHealth) * 100)) + '%';
                if (lastVals._bw !== bw) {
                    lastVals._bw = bw;
                    $('boss-bar').style.width = bw;
                }
            }
            setText('objective', '◆ DEFEAT THE HEAD DESIGNER ◆');
        } else {
            // MODERN fix: warping off the boss floor without passing the menu
            // used to leave the boss bar up (classic cached the visible state)
            if (lastVals._boss !== false) {
                lastVals._boss = false;
                $('boss-bar-wrap').classList.add('hidden');
            }
            setText('objective', done
                ? '◆ TABLES SECURED — GET TO THE ELEVATOR ◆'
                : `◆ ${game.level.name.toUpperCase()} — COLLECT ${game.requiredTables} TABLES ◆`);
        }
    },

    toast(msg, ms = 2200) {
        const el = $('toast');
        el.textContent = msg;
        el.style.opacity = 1;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.style.opacity = 0; }, ms);
    },

    damageFlash(strength = 0.6) {
        const el = $('damage-overlay');
        el.style.opacity = strength;
        setTimeout(() => { el.style.opacity = 0; }, 120);
    },

    pickupFlash() {
        const el = $('pickup-overlay');
        el.style.opacity = 1;
        setTimeout(() => { el.style.opacity = 0; }, 180);
    },

    drawFace(player, time) {
        const c = $('face-canvas');
        const ctx = c.getContext('2d');
        const hp = player.health;
        ctx.clearRect(0, 0, 32, 32);

        // background panel
        ctx.fillStyle = '#2e2e33';
        ctx.fillRect(0, 0, 32, 32);

        const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

        // hair
        px(7, 6, 18, 14, '#d9a34a');
        px(5, 10, 4, 12, '#d9a34a');
        px(23, 10, 4, 12, '#d9a34a');
        // face
        const skin = hp > 33 ? '#eebb93' : '#dba383';
        px(9, 10, 14, 13, skin);
        // beret
        px(6, 3, 20, 6, '#b22230');
        px(14, 1, 4, 3, '#8a1422');
        // eyes (blink every ~4s)
        const blink = Math.floor(time / 0.18) % 22 === 0;
        const dmgRecent = player.lastHurtTime && time - player.lastHurtTime < 0.5;
        if (blink && !dmgRecent) {
            px(11, 15, 4, 1, '#5a3a1a');
            px(18, 15, 4, 1, '#5a3a1a');
        } else if (dmgRecent || hp <= 0) {
            // X eyes when hurt badly
            px(11, 14, 4, 3, hp <= 0 ? '#999' : '#fff');
            px(18, 14, 4, 3, hp <= 0 ? '#999' : '#fff');
            px(12, 15, 2, 1, '#a02');
            px(19, 15, 2, 1, '#a02');
        } else {
            px(11, 13, 4, 4, '#fff');
            px(18, 13, 4, 4, '#fff');
            const look = Math.floor(time / 2.6) % 3 - 1; // glance around
            px(12 + look, 14, 2, 2, '#2a4a8a');
            px(19 + look, 14, 2, 2, '#2a4a8a');
        }
        // eyebrows angle with health
        if (hp < 66) {
            px(11, 11, 4, 1, '#a8742a');
            px(18, 11, 4, 1, '#a8742a');
        }
        // mouth
        if (hp > 66) {
            px(13, 19, 6, 1, '#7a3a2a');
            px(12, 18, 1, 1, '#7a3a2a');
            px(19, 18, 1, 1, '#7a3a2a');
        } else if (hp > 33) {
            px(13, 19, 6, 1, '#7a3a2a');
        } else {
            px(13, 19, 6, 2, '#5a1a12');
            px(14, 18, 4, 1, '#7a3a2a');
        }
        // paint smudge on cheek
        px(9, 17, 2, 2, '#3a6acc');
    },

    drawMinimap(game, player) {
        const c = $('minimap');
        if (c.classList.contains('hidden')) return;
        const ctx = c.getContext('2d');
        const world = game.world;
        const sx = c.width / world.w, sy = c.height / world.h;

        // static blueprint layer (walls/doors/props) cached per level + gate state
        const key = `${game.levelIndex}:${world.gatesUnlocked}:${c.width}:${world.propsVersion || 0}`;
        if (mmKey !== key) {
            mmKey = key;
            mmCanvas = mmCanvas || document.createElement('canvas');
            mmCanvas.width = c.width; mmCanvas.height = c.height;
            const mctx = mmCanvas.getContext('2d');
            // blueprint paper with faint grid
            mctx.fillStyle = 'rgba(10, 26, 48, 0.92)';
            mctx.fillRect(0, 0, c.width, c.height);
            mctx.strokeStyle = 'rgba(120, 160, 210, 0.08)';
            mctx.lineWidth = 1;
            for (let gx = 0; gx < c.width; gx += 16) {
                mctx.beginPath(); mctx.moveTo(gx, 0); mctx.lineTo(gx, c.height); mctx.stroke();
            }
            for (let gy = 0; gy < c.height; gy += 16) {
                mctx.beginPath(); mctx.moveTo(0, gy); mctx.lineTo(c.width, gy); mctx.stroke();
            }
            for (let y = 0; y < world.h; y++)
                for (let x = 0; x < world.w; x++) {
                    const t = world.cellRaw(x, y);
                    if (t === CELL.EMPTY) {
                        if (!world.propCells.has(world.key(x, y))) continue;
                        mctx.fillStyle = '#46658c'; // furniture, penciled in
                    }
                    else if (t === CELL.DOOR) mctx.fillStyle = '#c9a227';
                    else if (t === CELL.GATE) mctx.fillStyle = world.gatesUnlocked ? '#2a8a4a' : '#cc4433';
                    else if (t === CELL.ELEVATOR) mctx.fillStyle = '#3ae07a';
                    else mctx.fillStyle = '#a8c8e8'; // drafted walls
                    mctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
                }
        }
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(mmCanvas, 0, 0);
        // entities
        for (const e of game.pickups) {
            if (!e.active) continue;
            if (e.kind === 'table') {
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(e.x * sx - 2, e.y * sy - 2, 4, 4);
            }
        }
        for (const e of game.enemies) {
            if (!e.alive) continue;
            ctx.fillStyle = e.variant === 'boss' ? '#ff3322' : '#ff7788';
            ctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3);
        }
        // player arrow
        ctx.save();
        ctx.translate(player.x * sx, player.y * sy);
        ctx.rotate(player.rot);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(5, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    },

    toggleMinimap() {
        $('minimap').classList.toggle('hidden');
    },
};
