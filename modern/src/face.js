/**
 * SANDY'S PORTRAIT — MODERN v3 (Round 3, G2)
 *
 * A painted-style portrait drawn with anti-aliased canvas shapes at 192×192,
 * modelled on the cover art: red beret slouched to her right, shoulder-length
 * wavy auburn hair with a fringe, round face with laugh lines, brown eyes,
 * gritted determination, hoop earrings, cream shirt under a tan work vest.
 * States (same contract as round 2): idle breathe/blink/glance, hit flinch
 * with the paint's colour on the cheek, mid/low/critical, dead, grin, aiming
 * squint, sprint huff, firing grit, boss-rage worry, floor tint.
 *
 *   drawFace(ctx, f, time)    ctx of a 192×192 canvas; f: FACE_DEFAULTS fields
 */

export const FACE_DEFAULTS = {
    hp: 100, hurtAge: 99, hurtDir: 0, splat: null,
    dead: false, grinAge: 99, aim: 0, sprint: false, moving: false, fireAge: 99, heavy: false,
    rage: false, tint: null, pickupKind: null,
};
export const SIZE = 192;

const mix = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};
const ell = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };

export function drawFace(ctx, f, time) {
    const S = SIZE, cx = 96;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const hp = f.dead ? 0 : Math.max(0, f.hp);
    const low = hp <= 33, mid = hp <= 66;
    const hurt = f.hurtAge < 0.5 && !f.dead;
    const grin = f.grinAge < 0.8 && !hurt && !f.dead;
    const fire = f.fireAge < 0.14 && f.heavy && !f.dead;
    const pale = f.dead ? 0.6 : low ? 0.5 : mid ? 0.22 : 0;
    const SKIN = mix('#f1c9a3', '#ddd0c4', pale), SKIN_SH = mix('#c98d64', '#a89486', pale), SKIN_HI = mix('#fbe0c4', '#ece4dc', pale);
    const HAIR = '#6e3f22', HAIR_HI = '#a86a3a', HAIR_LO = '#4a2814';
    const BERET = '#b8262a', BERET_LO = '#7d1418', BERET_HI = '#d9454a';
    const tint = f.tint || '#5a6a80';

    // ---- background: dark panel with the floor's tint as a glow behind her
    ctx.fillStyle = '#23242a'; ctx.fillRect(0, 0, S, S);
    const bg = ctx.createRadialGradient(cx, 90, 10, cx, 90, 130);
    bg.addColorStop(0, tint); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35; ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1;

    // ---- head motion
    const breathe = Math.sin(time * 1.8) * (f.sprint && f.moving ? 2.2 : 0.9);
    const flinchX = hurt ? -f.hurtDir * 9 * (1 - f.hurtAge / 0.5) : 0;
    const flinchY = hurt ? 4 * (1 - f.hurtAge / 0.5) : 0;
    const bob = f.sprint && f.moving ? Math.sin(time * 9) * 2.5 : 0;
    const tiltZ = hurt ? -f.hurtDir * 0.08 * (1 - f.hurtAge / 0.5) : Math.sin(time * 0.6) * 0.012;
    ctx.translate(cx + flinchX, 100 + breathe + flinchY + bob); ctx.rotate(tiltZ); ctx.translate(-cx, -100);

    // ---- shoulders: cream shirt, tan vest
    ctx.fillStyle = '#e9dcc3'; ell(ctx, cx, 215, 92, 60); ctx.fill();
    ctx.fillStyle = '#b48a5c'; ctx.beginPath(); ctx.moveTo(4, 192); ctx.quadraticCurveTo(30, 156, 70, 160); ctx.lineTo(56, 192); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(188, 192); ctx.quadraticCurveTo(162, 156, 122, 160); ctx.lineTo(136, 192); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a6540'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(62, 192); ctx.lineTo(74, 166); ctx.moveTo(130, 192); ctx.lineTo(118, 166); ctx.stroke();
    // neck
    ctx.fillStyle = SKIN_SH; ctx.fillRect(80, 140, 32, 30);
    // hair mass behind the head (wavy edges)
    const hairGrad = ctx.createLinearGradient(0, 60, 0, 190); hairGrad.addColorStop(0, HAIR_HI); hairGrad.addColorStop(0.55, HAIR); hairGrad.addColorStop(1, HAIR_LO);
    ctx.fillStyle = hairGrad;
    ctx.beginPath(); ctx.moveTo(48, 70);
    for (let i = 0; i <= 8; i++) { const t = i / 8; const y = 70 + t * 110; const x = 46 - Math.sin(t * 9 + 1) * 6 - t * 10; ctx.quadraticCurveTo(x - 6, y + 6, x, y + 12); }
    ctx.quadraticCurveTo(70, 190, 96, 184); ctx.quadraticCurveTo(122, 190, 154, 182);
    for (let i = 8; i >= 0; i--) { const t = i / 8; const y = 70 + t * 110; const x = 146 + Math.sin(t * 9 + 2) * 6 + t * 10; ctx.quadraticCurveTo(x + 6, y + 6, x, y - 2); }
    ctx.quadraticCurveTo(120, 40, 96, 44); ctx.quadraticCurveTo(70, 40, 48, 70); ctx.closePath(); ctx.fill();
    // wave strands
    ctx.strokeStyle = 'rgba(180,120,70,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const x0 = 50 + i * 3, y0 = 90 + i * 8; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 - 10, y0 + 22, x0 + 8, y0 + 38, x0 - 4, y0 + 62); ctx.stroke(); const x1 = 142 - i * 3; ctx.beginPath(); ctx.moveTo(x1, y0); ctx.bezierCurveTo(x1 + 10, y0 + 22, x1 - 8, y0 + 38, x1 + 4, y0 + 62); ctx.stroke(); }
    if (low) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2.5; for (const [x, y, dx] of [[52, 78, -14], [142, 74, 14], [70, 60, -8], [124, 58, 10]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dx, y - 12, x + dx * 1.6, y - 4); ctx.stroke(); } }

    // ---- face
    const skinGrad = ctx.createRadialGradient(88, 96, 10, cx, 108, 56);
    skinGrad.addColorStop(0, SKIN_HI); skinGrad.addColorStop(0.6, SKIN); skinGrad.addColorStop(1, SKIN_SH);
    ctx.fillStyle = skinGrad; ell(ctx, cx, 108, 43, 50); ctx.fill();
    // ears + hoop earrings
    ctx.fillStyle = SKIN_SH; ell(ctx, 53, 112, 6, 9); ctx.fill(); ell(ctx, 139, 112, 6, 9); ctx.fill();
    ctx.strokeStyle = '#d9b24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(53, 128, 6, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(139, 128, 6, 0, Math.PI * 2); ctx.stroke();
    // cheeks (rosy; flushed when sprinting; bruise when critical)
    ctx.globalAlpha = f.sprint && f.moving ? 0.35 : 0.18; ctx.fillStyle = '#e06a55'; ell(ctx, 70, 122, 12, 8); ctx.fill(); ell(ctx, 122, 122, 12, 8); ctx.fill(); ctx.globalAlpha = 1;
    if (low) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#6a3a8a'; ell(ctx, 124, 100, 12, 9, 0.4); ctx.fill(); ctx.globalAlpha = 1; }
    // laugh lines, chin crease
    ctx.strokeStyle = 'rgba(150,90,60,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(84, 118); ctx.quadraticCurveTo(78, 130, 82, 142); ctx.moveTo(108, 118); ctx.quadraticCurveTo(114, 130, 110, 142); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(86, 150); ctx.quadraticCurveTo(96, 156, 106, 150); ctx.stroke();
    // paint smudge on the cheek (classic blue) + the last hit's colour
    ctx.fillStyle = f.splat || '#3a6acc'; ell(ctx, 68, 134, 5, 3.5, -0.4); ctx.fill(); ell(ctx, 74, 137, 2.2, 1.8); ctx.fill();
    if (hurt && f.splat) { ctx.fillStyle = f.splat; ell(ctx, 126, 138, 6, 4, 0.5); ctx.fill(); ell(ctx, 133, 133, 2.5, 2); ctx.fill(); }

    // ---- nose
    ctx.strokeStyle = 'rgba(160,100,70,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(93, 104); ctx.quadraticCurveTo(88, 122, 92, 126); ctx.stroke();
    ctx.fillStyle = 'rgba(150,90,60,0.5)'; ell(ctx, 90, 126, 3, 2); ctx.fill(); ell(ctx, 102, 126, 3, 2); ctx.fill();

    // ---- eyes
    const blink = Math.floor(time / 0.18) % 22 === 0 && !hurt && !f.dead && !grin;
    const squint = f.aim > 0.4 && !hurt && !f.dead;
    const look = f.moving ? 0 : (Math.floor(time / 2.6) % 3 - 1) * 2;
    const eye = (x, s) => {
        if (f.dead) { ctx.strokeStyle = '#8a1a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 7, 92); ctx.lineTo(x + 7, 106); ctx.moveTo(x + 7, 92); ctx.lineTo(x - 7, 106); ctx.stroke(); return; }
        if (hurt || blink) { ctx.strokeStyle = SKIN_SH; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 9, 100); ctx.quadraticCurveTo(x, hurt ? 104 : 103, x + 9, 100); ctx.stroke(); if (hurt) { ctx.beginPath(); ctx.moveTo(x - 6, 96); ctx.lineTo(x - 9, 92); ctx.moveTo(x + 6, 96); ctx.lineTo(x + 9, 92); ctx.stroke(); } return; }
        const open = squint ? 0.5 : 1;
        ctx.fillStyle = low ? '#f6e4e0' : '#fbf8f2'; ell(ctx, x, 99, 10, 6 * open); ctx.fill();
        if (low) { ctx.strokeStyle = 'rgba(200,60,60,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 8, 98); ctx.lineTo(x - 3, 100); ctx.moveTo(x + 8, 97); ctx.lineTo(x + 4, 100); ctx.stroke(); }
        ctx.fillStyle = '#5a3418'; ell(ctx, x + look, 99.5, 4.6, 4.6 * open); ctx.fill();
        ctx.fillStyle = '#1a0e08'; ell(ctx, x + look, 99.5, 2.4, 2.4 * open); ctx.fill();
        ctx.fillStyle = '#fff'; ell(ctx, x + look - 1.6, 97.6, 1.3, 1.1 * open); ctx.fill();
        ctx.strokeStyle = '#4a2a18'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, 97); ctx.quadraticCurveTo(x, 90 + (1 - open) * 6, x + 10, 96); ctx.stroke(); // upper lid
        ctx.strokeStyle = 'rgba(120,70,50,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + s * 11, 96); ctx.lineTo(x + s * 15, 93); ctx.moveTo(x + s * 11, 101); ctx.lineTo(x + s * 15, 103); ctx.stroke(); // crow's feet
    };
    eye(78, -1); eye(114, 1);
    // brows: knit when firing or mid/low, worried under the rage, calm otherwise
    ctx.strokeStyle = '#4a2a14'; ctx.lineWidth = 3.5;
    const knit = (fire || mid) && !f.rage ? 4 : 0;
    ctx.beginPath();
    if (f.rage && !hurt) { ctx.moveTo(66, 86); ctx.quadraticCurveTo(80, 78, 90, 84); ctx.moveTo(126, 86); ctx.quadraticCurveTo(112, 78, 102, 84); }
    else { ctx.moveTo(66, 84 - knit * 0.3); ctx.quadraticCurveTo(78, 80, 90, 84 + knit); ctx.moveTo(126, 84 - knit * 0.3); ctx.quadraticCurveTo(114, 80, 102, 84 + knit); }
    ctx.stroke();

    // ---- mouth
    if (f.dead) { ctx.strokeStyle = '#5a1a12'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(84, 142); ctx.lineTo(108, 142); ctx.stroke(); }
    else if (grin) { ctx.fillStyle = '#5a1a12'; ctx.beginPath(); ctx.moveTo(76, 136); ctx.quadraticCurveTo(96, 156, 116, 136); ctx.quadraticCurveTo(96, 142, 76, 136); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(80, 137); ctx.quadraticCurveTo(96, 146, 112, 137); ctx.quadraticCurveTo(96, 140, 80, 137); ctx.fill(); }
    else if (fire || (!hurt && !mid && !(f.sprint && f.moving))) { // gritted teeth: the cover's expression
        ctx.fillStyle = '#5a1a12'; ctx.beginPath(); ctx.moveTo(80, 138); ctx.quadraticCurveTo(96, 134, 112, 138); ctx.quadraticCurveTo(96, 148, 80, 138); ctx.fill();
        ctx.fillStyle = '#efe6d8'; ctx.beginPath(); ctx.moveTo(82, 138); ctx.quadraticCurveTo(96, 135, 110, 138); ctx.quadraticCurveTo(96, 144, 82, 138); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,80,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 6; i++) { const x = 85 + i * 4.4; ctx.moveTo(x, 136.5); ctx.lineTo(x, 142.5); } ctx.stroke();
        ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(80, 138); ctx.quadraticCurveTo(96, 134, 112, 138); ctx.stroke();
    }
    else if (hurt) { ctx.fillStyle = '#5a1a12'; ell(ctx, 96, 141, 9, 6); ctx.fill(); ctx.fillStyle = '#2a0a0a'; ell(ctx, 96, 143, 6, 3.5); ctx.fill(); }
    else if (f.sprint && f.moving) { const o = 3 + Math.floor(time * 6) % 2 * 2; ctx.fillStyle = '#5a1a12'; ell(ctx, 96, 141, 8, o); ctx.fill(); }
    else { ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(82, 140); ctx.quadraticCurveTo(96, low ? 134 : 138, 110, 140); ctx.stroke(); }
    // sweat when low
    if (low && !f.dead) { const d = Math.floor(time * 2) % 3; ctx.fillStyle = '#cfe8ff'; ell(ctx, 136, 84 + d * 3, 2.5, 4); ctx.fill(); ell(ctx, 58, 92 + ((d + 1) % 3) * 3, 2, 3.2); ctx.fill(); }

    // ---- fringe over the forehead, then the beret
    ctx.strokeStyle = HAIR; ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) { const x = 58 + i * 9; ctx.beginPath(); ctx.moveTo(x, 60); ctx.quadraticCurveTo(x - 3 + (i % 2) * 6, 74, x + (i % 3) * 2 - 2, 82 + (i % 2) * 4); ctx.stroke(); }
    ctx.strokeStyle = HAIR_HI; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const x = 66 + i * 14; ctx.beginPath(); ctx.moveTo(x, 62); ctx.quadraticCurveTo(x + 1, 72, x - 1, 80); ctx.stroke(); }
    const beretGrad = ctx.createRadialGradient(80, 44, 6, 96, 52, 62); beretGrad.addColorStop(0, BERET_HI); beretGrad.addColorStop(0.7, BERET); beretGrad.addColorStop(1, BERET_LO);
    ctx.fillStyle = beretGrad; ell(ctx, 92, 50, 58, 26, -0.16); ctx.fill();
    ctx.fillStyle = BERET_LO; ell(ctx, 96, 66, 46, 8, -0.1); ctx.fill(); // band under the slouch
    ctx.fillStyle = BERET; ell(ctx, 96, 64, 44, 6, -0.1); ctx.fill();
    ctx.strokeStyle = BERET_LO; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(60, 42); ctx.quadraticCurveTo(80, 36, 104, 40); ctx.stroke(); // fold
    ctx.fillStyle = BERET_LO; ell(ctx, 86, 26, 3, 5, 0.3); ctx.fill(); // stem
    ctx.restore();

    // ---- overlays: damage flash, death darkening, tint rim
    if (hurt) { ctx.globalAlpha = 0.35 * (1 - f.hurtAge / 0.5); ctx.fillStyle = '#c02818'; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1; }
    if (f.dead) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1; }
    const vg = ctx.createRadialGradient(cx, 100, 60, cx, 100, 140); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 0.5; ctx.fillStyle = tint; ctx.fillRect(0, 0, S, 2); ctx.fillRect(S - 2, 0, 2, S); ctx.globalAlpha = 1;
}

export const FACE_STATES = {
    idle: {}, glance: { time: 2.7 }, blink: { time: 3.96 },
    hit_left: { hp: 80, hurtAge: 0.1, hurtDir: -1, splat: '#e03a2a' },
    hit_right: { hp: 60, hurtAge: 0.15, hurtDir: 1, splat: '#3ac06a' },
    mid: { hp: 55 }, low: { hp: 25 }, critical: { hp: 10 }, dead: { hp: 0, dead: true },
    grin: { grinAge: 0.2 }, aiming: { aim: 1 }, sprinting: { sprint: true, moving: true, time: 1.3 },
    firing_heavy: { fireAge: 0.05, heavy: true }, boss_rage: { rage: true, hp: 70, tint: '#ff4a3a' },
    archives_tint: { tint: '#3a6aa0' }, factory_tint: { tint: '#ff9a3a' },
};
