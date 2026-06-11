/**
 * HUD — DOM stats, pixel-art Sandy face, minimap, toasts.
 */
import { CELL } from './config.js';

const $ = (id) => document.getElementById(id);

let toastTimer = null;
let hitTimer = null;

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
        $('hud-health').textContent = Math.max(0, Math.ceil(player.health));
        $('healthbar').style.width = Math.max(0, player.health) + '%';
        $('hud-ammo').textContent = player.ammo;
        $('hud-score').textContent = player.score.toLocaleString();
        $('hud-floor').textContent = game.levelIndex + 1;

        const t = $('hud-tables');
        t.textContent = `${player.tables}/${game.requiredTables}`;
        const done = player.tables >= game.requiredTables;
        t.style.color = done ? '#0f0' : '#fff';
        t.style.textShadow = done ? '0 0 6px #0f0' : 'none';

        $('hud-enemies').textContent = game.enemiesAlive;

        // low-health pulse
        $('lowhp-overlay').classList.toggle('hidden', player.health > 25 || player.health <= 0);

        const wKey = player.weapons[player.currentWeapon];
        $('hud-weapon').textContent = game.weaponDefs[wKey].name;
        $('hud-weapon-slot').textContent = `[${player.currentWeapon + 1}]`;

        if (game.level.boss) {
            const boss = game.boss;
            if (boss && boss.alive) {
                $('boss-bar-wrap').classList.remove('hidden');
                $('boss-bar').style.width = Math.max(0, (boss.health / boss.maxHealth) * 100) + '%';
            } else {
                $('boss-bar-wrap').classList.add('hidden');
            }
            $('objective').textContent = '◆ DEFEAT THE HEAD DESIGNER ◆';
        } else {
            $('objective').textContent = done
                ? '◆ TABLES SECURED — GET TO THE ELEVATOR ◆'
                : `◆ ${game.level.name.toUpperCase()} — COLLECT ${game.requiredTables} TABLES ◆`;
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
        ctx.fillStyle = 'rgba(8,8,12,0.85)';
        ctx.fillRect(0, 0, c.width, c.height);
        for (let y = 0; y < world.h; y++)
            for (let x = 0; x < world.w; x++) {
                const t = world.cellRaw(x, y);
                if (t === CELL.EMPTY) continue;
                if (t === CELL.DOOR) ctx.fillStyle = '#7a5a2a';
                else if (t === CELL.GATE) ctx.fillStyle = world.gatesUnlocked ? '#1a4a2a' : '#aa3322';
                else if (t === CELL.ELEVATOR) ctx.fillStyle = '#2adf6a';
                else ctx.fillStyle = '#6a6a72';
                ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
            }
        // entities
        for (const e of game.pickups) {
            if (!e.active) continue;
            ctx.fillStyle = e.kind === 'table' ? '#ffd700' : '#3a8aff';
            if (e.kind === 'table') {
                ctx.fillRect(e.x * sx - 2, e.y * sy - 2, 4, 4);
            }
        }
        for (const e of game.enemies) {
            if (!e.alive) continue;
            ctx.fillStyle = e.variant === 'boss' ? '#ff2222' : '#cc66ff';
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
