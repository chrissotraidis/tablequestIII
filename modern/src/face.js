/**
 * SANDY'S PORTRAIT — MODERN (Round 2, R2.2)
 *
 * The classic 32×32 pixel face, redrawn at 64×64 with the states an older FPS
 * status bar would show: idle (breathe, blink, glance), hit (flinch toward the
 * damage, eyes shut, paint on the cheek), low health (pale, sweat, grimace),
 * critical (bruised, bloodshot, hair mussed), dead (X eyes), pickup grin,
 * aiming squint, sprinting huff, firing grit, boss-rage worry, and a tint from
 * the floor's lighting rig. Pure canvas 2D, pixel-perfect (no smoothing).
 *
 *   drawFace(ctx, f, time)   f: see FACE_DEFAULTS
 *   FACE_STATES              named presets for the contact sheet
 */

export const FACE_DEFAULTS = {
    hp: 100, hurtAge: 99, hurtDir: 0, splat: null,   // hurtDir: -1 left, 0 front, 1 right; splat: css colour
    dead: false, grinAge: 99, aim: 0, sprint: false, moving: false, fireAge: 99, heavy: false,
    rage: false, tint: null, pickupKind: null,
};

const px = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
const mix = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};

export function drawFace(ctx, f, time) {
    ctx.imageSmoothingEnabled = false;
    const hp = f.dead ? 0 : Math.max(0, f.hp);
    const low = hp <= 33, mid = hp <= 66;
    const hurt = f.hurtAge < 0.5 && !f.dead;
    const grin = f.grinAge < 0.8 && !hurt && !f.dead;
    const fire = f.fireAge < 0.14 && f.heavy && !f.dead;
    const sweat = low && !f.dead;
    const pale = f.dead ? 0.7 : low ? 0.55 : mid ? 0.25 : 0;
    // ---- palette (paler as health drops; bruised when critical)
    const SKIN = mix(mix('#eebb93', '#d9c6b8', pale), '#c9a88f', low ? 0.3 : 0);
    const SKIN_SH = mix(mix('#d9a27a', '#c2ab9c', pale), '#a98a75', low ? 0.3 : 0);
    const HAIR = '#d9a34a', HAIR_SH = '#b6842f', BERET = '#b22230', BERET_SH = '#8a1422';
    const EYE_W = f.dead ? '#bbb' : low ? '#f4dede' : '#fff', IRIS = '#2a4a8a', BROW = '#a8742a', MOUTH = '#7a3a2a';

    // ---- background: dark panel with the floor's tint as a rim light
    px(ctx, 0, 0, 64, 64, '#26262b');
    const tint = f.tint || '#5a6a80';
    ctx.fillStyle = tint; ctx.globalAlpha = 0.22; ctx.fillRect(0, 0, 64, 64); ctx.globalAlpha = 1;

    // ---- head motion: breathe, flinch toward damage, huff when sprinting
    const breathe = Math.sin(time * 1.8) * (f.sprint && f.moving ? 1.6 : 0.6);
    const flinchX = hurt ? Math.round(-f.hurtDir * 4 * (1 - f.hurtAge / 0.5)) : 0;
    const flinchY = hurt ? Math.round(2 * (1 - f.hurtAge / 0.5)) : 0;
    const bob = f.sprint && f.moving ? Math.round(Math.sin(time * 9) * 1.5) : 0;
    const ox = flinchX, oy = Math.round(breathe) + flinchY + bob;
    ctx.save(); ctx.translate(ox, oy);

    // neck + shirt collar
    px(ctx, 24, 48, 16, 16, SKIN_SH);
    px(ctx, 12, 56, 40, 8, '#6d5a3a'); px(ctx, 28, 56, 8, 8, '#e8dcc0');
    // hair (mussed when critical: stray strands)
    px(ctx, 12, 12, 40, 30, HAIR); px(ctx, 8, 20, 8, 26, HAIR); px(ctx, 48, 20, 8, 26, HAIR);
    px(ctx, 8, 36, 8, 10, HAIR_SH); px(ctx, 48, 36, 8, 10, HAIR_SH);
    if (low) { px(ctx, 6, 14, 3, 2, HAIR); px(ctx, 55, 12, 3, 2, HAIR); px(ctx, 20, 8, 2, 4, HAIR_SH); px(ctx, 44, 7, 2, 5, HAIR_SH); }
    // face
    px(ctx, 18, 20, 28, 28, SKIN);
    px(ctx, 18, 42, 28, 6, SKIN_SH); // jaw shade
    px(ctx, 16, 26, 2, 10, SKIN_SH); px(ctx, 46, 26, 2, 10, SKIN_SH); // ears
    // beret (tilts with the flinch)
    px(ctx, 10, 6, 44, 12, BERET); px(ctx, 12, 16, 40, 3, BERET_SH); px(ctx, 28, 2, 8, 5, BERET_SH); px(ctx, 30, 1, 4, 2, BERET);
    // bruise when critical
    if (low) { ctx.globalAlpha = 0.35; px(ctx, 36, 24, 8, 7, '#5a3a8a'); ctx.globalAlpha = 1; }
    // paint splat on the cheek (last hit colour; classic blue by default)
    const splat = f.splat || '#3a6acc';
    px(ctx, 19, 34, 4, 4, splat); px(ctx, 18, 36, 2, 2, splat); px(ctx, 22, 33, 2, 2, splat);
    if (hurt && f.splat) { px(ctx, 40, 38, 3, 3, f.splat); px(ctx, 43, 36, 2, 2, f.splat); }

    // ---- eyes
    const blink = Math.floor(time / 0.18) % 22 === 0 && !hurt && !f.dead && !grin;
    const squint = f.aim > 0.4 && !hurt && !f.dead;
    const look = f.moving ? 0 : Math.floor(time / 2.6) % 3 - 1;
    const eye = (x) => {
        if (f.dead) { // X eyes
            px(ctx, x, 27, 8, 8, EYE_W);
            for (let i = 0; i < 6; i++) { px(ctx, x + 1 + i, 28 + i, 1, 1, '#a02'); px(ctx, x + 6 - i, 28 + i, 1, 1, '#a02'); }
            return;
        }
        if (hurt) { // shut tight, a tear of paint
            px(ctx, x, 30, 8, 2, BROW); px(ctx, x + 1, 32, 6, 1, SKIN_SH);
            return;
        }
        if (blink) { px(ctx, x, 30, 8, 2, BROW); return; }
        if (squint) { px(ctx, x, 29, 8, 4, EYE_W); px(ctx, x + 3 + look, 30, 3, 2, IRIS); px(ctx, x, 28, 8, 1, BROW); return; }
        px(ctx, x, 26, 8, 8, EYE_W);
        if (low) { px(ctx, x + 1, 27, 1, 1, '#d55'); px(ctx, x + 6, 32, 1, 1, '#d55'); }
        px(ctx, x + 3 + look, 28, 3, 4, IRIS); px(ctx, x + 4 + look, 29, 1, 1, '#0a1a3a');
        px(ctx, x + 3 + look, 28, 1, 1, '#fff');
    };
    eye(22); eye(36);
    // brows: angle with health, worry under the boss's rage, knit when firing
    const browY = fire ? 22 : 24;
    if (f.rage && !hurt) { px(ctx, 22, 23, 8, 2, BROW); px(ctx, 22, 22, 2, 1, BROW); px(ctx, 36, 23, 8, 2, BROW); px(ctx, 42, 22, 2, 1, BROW); }
    else if (mid || fire) { px(ctx, 22, browY, 8, 2, BROW); px(ctx, 28, browY - 1, 2, 1, BROW); px(ctx, 36, browY, 8, 2, BROW); px(ctx, 36, browY - 1, 2, 1, BROW); }
    else { px(ctx, 23, 23, 6, 1, BROW); px(ctx, 37, 23, 6, 1, BROW); }
    // nose
    px(ctx, 31, 34, 2, 6, SKIN_SH); px(ctx, 30, 39, 4, 1, SKIN_SH);
    // ---- mouth
    if (f.dead) { px(ctx, 27, 43, 10, 2, '#5a1a12'); }
    else if (grin) { px(ctx, 25, 42, 14, 3, '#5a1a12'); px(ctx, 26, 42, 12, 2, '#fff'); px(ctx, 25, 41, 1, 1, MOUTH); px(ctx, 38, 41, 1, 1, MOUTH); }
    else if (fire) { px(ctx, 26, 42, 12, 3, '#5a1a12'); px(ctx, 27, 42, 10, 2, '#e8e0d0'); for (let i = 0; i < 5; i++) px(ctx, 28 + i * 2, 42, 1, 2, '#c8b8a8'); }
    else if (hurt) { px(ctx, 28, 42, 8, 4, '#5a1a12'); px(ctx, 29, 43, 6, 2, '#3a0a0a'); }
    else if (f.sprint && f.moving) { const o = Math.floor(time * 6) % 2; px(ctx, 28, 42, 8, 2 + o, '#5a1a12'); px(ctx, 29, 43, 6, 1, '#3a0a0a'); }
    else if (low) { px(ctx, 26, 43, 12, 2, '#5a1a12'); px(ctx, 28, 42, 8, 1, MOUTH); px(ctx, 26, 44, 2, 1, MOUTH); px(ctx, 36, 44, 2, 1, MOUTH); }
    else if (mid) { px(ctx, 27, 43, 10, 1, MOUTH); }
    else { px(ctx, 27, 43, 10, 1, MOUTH); px(ctx, 26, 42, 1, 1, MOUTH); px(ctx, 37, 42, 1, 1, MOUTH); }
    // sweat drops when low
    if (sweat) { const d = Math.floor(time * 2) % 3; px(ctx, 46, 22 + d, 2, 3, '#bfe2ff'); px(ctx, 16, 25 + ((d + 1) % 3), 2, 2, '#bfe2ff'); }
    // sprint: flushed cheeks
    if (f.sprint && f.moving && !f.dead) { ctx.globalAlpha = 0.28; px(ctx, 20, 36, 6, 4, '#e0503a'); px(ctx, 38, 36, 6, 4, '#e0503a'); ctx.globalAlpha = 1; }
    ctx.restore();

    // ---- damage vignette on the portrait itself
    if (hurt) { ctx.globalAlpha = 0.35 * (1 - f.hurtAge / 0.5); px(ctx, 0, 0, 64, 64, '#c02818'); ctx.globalAlpha = 1; }
    if (f.dead) { ctx.globalAlpha = 0.25; px(ctx, 0, 0, 64, 64, '#000'); ctx.globalAlpha = 1; }
    // rim light from the floor
    ctx.globalAlpha = 0.5; px(ctx, 0, 0, 64, 1, tint); px(ctx, 63, 0, 1, 64, tint); ctx.globalAlpha = 1;
}

/** named states for the contact sheet (TQ.faceSheet) */
export const FACE_STATES = {
    idle: {},
    glance: { time: 2.7 },
    blink: { time: 3.96 },
    hit_left: { hp: 80, hurtAge: 0.1, hurtDir: -1, splat: '#e03a2a' },
    hit_right: { hp: 60, hurtAge: 0.15, hurtDir: 1, splat: '#3ac06a' },
    mid: { hp: 55 },
    low: { hp: 25 },
    critical: { hp: 10 },
    dead: { hp: 0, dead: true },
    grin: { grinAge: 0.2 },
    aiming: { aim: 1 },
    sprinting: { sprint: true, moving: true, time: 1.3 },
    firing_heavy: { fireAge: 0.05, heavy: true },
    boss_rage: { rage: true, hp: 70, tint: '#ff4a3a' },
    archives_tint: { tint: '#3a6aa0' },
    factory_tint: { tint: '#ff9a3a' },
};
