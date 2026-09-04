/**
 * SANDY'S PORTRAIT — MODERN v4 (Round 4, H2): a living face.
 *
 * Painted likeness of the cover, driven entirely by continuous parameters
 * that tween toward targets with their own response times (no hard switches):
 * lids per eye, gaze, brows (height and angle per side), mouth (open, width,
 * corners, teeth), jaw clench, head yaw/pitch/roll, hair sway, blush, pallor,
 * sweat, tremor. Life comes from a blink scheduler with lid travel, gaze
 * saccades with micro-drift, breathing, head micro-movement, and hair
 * follow-through. Reactions are curves layered on the idle: hit, low health,
 * grin, aim, sprint, fire, rage.
 *
 *   const face = new FaceAnim();  face.update(dt, signals);  face.draw(ctx)
 *   drawFace(ctx, f, time) keeps the old contract for sheets (stateless).
 */

export const SIZE = 192;
export const FACE_DEFAULTS = {
    hp: 100, hurtAge: 99, hurtDir: 0, splat: null,
    dead: false, grinAge: 99, aim: 0, sprint: false, moving: false, fireAge: 99, heavy: false,
    rage: false, tint: null, pickupKind: null,
};

const mix = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ell = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); };

/** exponential approach with a time constant (seconds) */
const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));

export class FaceAnim {
    constructor() {
        this.t = 0;
        // parameters (current values)
        this.p = {
            lidL: 1, lidR: 1, gazeX: 0, gazeY: 0, browL: 0, browR: 0, browAngL: 0, browAngR: 0,
            mouthOpen: 0, mouthW: 1, corners: 0, teeth: 0.7, jaw: 0, headYaw: 0, headPitch: 0, headRoll: 0,
            hair: 0, blush: 0.18, pallor: 0, sweat: 0, tremor: 0, squint: 0, breath: 0, hurtFlash: 0, dead: 0,
        };
        // life state
        this.blink = { next: 2 + Math.random() * 2, phase: 0, t: 0, double: false };
        this.gaze = { tx: 0, ty: 0, next: 1.5 + Math.random() * 2 };
        this.headTarget = { yaw: 0, pitch: 0, roll: 0, next: 2 + Math.random() * 3 };
        this.hairVel = 0; this.lastYaw = 0;
        this.tint = '#5a6a80'; this.splat = null; this.hurtDir = 0;
    }

    /** signals: the FACE_DEFAULTS-shaped object built by hud.js each frame */
    update(dt, f) {
        dt = clamp(dt, 0, 0.1);
        this.t += dt;
        const p = this.p, t = this.t;
        const hp = f.dead ? 0 : Math.max(0, f.hp);
        const low = hp <= 33, mid = hp <= 66;
        const hurt = f.hurtAge < 0.6 && !f.dead;
        const grin = f.grinAge < 0.9 && !hurt && !f.dead;
        const fire = f.fireAge < 0.16 && f.heavy && !f.dead;
        const sprinting = f.sprint && f.moving && !f.dead;
        this.tint = f.tint || '#5a6a80'; this.splat = f.splat;
        if (hurt) this.hurtDir = f.hurtDir;

        // ---- blinks: schedule, lid travel 120 ms down / 180 ms up, occasional double blink
        const b = this.blink;
        if (b.phase === 0) { b.next -= dt; if (b.next <= 0 && !hurt && !f.dead) { b.phase = 1; b.t = 0; b.double = Math.random() < 0.18; } }
        else { b.t += dt; if (b.phase === 1 && b.t >= 0.12) { b.phase = 2; b.t = 0; } else if (b.phase === 2 && b.t >= 0.18) { if (b.double) { b.double = false; b.phase = 1; b.t = 0; } else { b.phase = 0; b.next = (sprinting ? 1.2 : 2.6) + Math.random() * 3; } } }
        const blinkLid = b.phase === 1 ? 1 - b.t / 0.12 : b.phase === 2 ? b.t / 0.18 : 1;
        // ---- gaze: saccades between fixation points + micro drift; locked forward when aiming/moving
        const gz = this.gaze; gz.next -= dt;
        if (gz.next <= 0) { gz.tx = (Math.random() - 0.5) * 2; gz.ty = (Math.random() - 0.5) * 0.8; gz.next = 1.2 + Math.random() * 2.8; }
        const gazeTargetX = (f.moving || f.aim > 0.3) ? 0 : gz.tx, gazeTargetY = (f.moving || f.aim > 0.3) ? 0 : gz.ty;
        p.gazeX = ease(p.gazeX, gazeTargetX + Math.sin(t * 7.3) * 0.04, dt, 0.045); // saccade-fast
        p.gazeY = ease(p.gazeY, gazeTargetY + Math.cos(t * 5.1) * 0.03, dt, 0.045);
        // ---- head micro-movement and reactions
        const ht = this.headTarget; ht.next -= dt;
        if (ht.next <= 0) { ht.yaw = (Math.random() - 0.5) * 0.12; ht.pitch = (Math.random() - 0.5) * 0.06; ht.roll = (Math.random() - 0.5) * 0.05; ht.next = 2 + Math.random() * 3; }
        let yawT = ht.yaw + gazeTargetX * 0.04, pitchT = ht.pitch, rollT = ht.roll;
        if (hurt) { const k = Math.max(0, 1 - f.hurtAge / 0.6); yawT += -this.hurtDir * 0.45 * k; rollT += -this.hurtDir * 0.18 * k; pitchT += 0.12 * k; }
        if (f.aim > 0.3) { rollT += 0.06 * f.aim; pitchT -= 0.03 * f.aim; }
        if (sprinting) { pitchT += Math.sin(t * 9) * 0.03; rollT += Math.sin(t * 4.5) * 0.02; }
        if (f.dead) { pitchT = 0.35; rollT = 0.25; }
        const headTau = hurt ? 0.05 : 0.35;
        p.headYaw = ease(p.headYaw, yawT, dt, headTau); p.headPitch = ease(p.headPitch, pitchT, dt, headTau); p.headRoll = ease(p.headRoll, rollT, dt, headTau);
        // hair follow-through: a damped spring driven by head yaw velocity
        const yawVel = (p.headYaw - this.lastYaw) / Math.max(dt, 1e-3); this.lastYaw = p.headYaw;
        this.hairVel += (-p.hair * 60 - this.hairVel * 8 - yawVel * 3) * dt; p.hair = clamp(p.hair + this.hairVel * dt, -1, 1);
        // ---- breathing
        p.breath = Math.sin(t * (sprinting ? 5.5 : 1.6)) * (sprinting ? 1 : 0.5);
        // ---- lids (blink × squeeze × squint × drowsy when low)
        const squeeze = hurt ? Math.max(0, 1 - f.hurtAge / 0.45) : 0;
        const lidT = f.dead ? 0.05 : clamp(blinkLid * (1 - squeeze) * (1 - 0.45 * f.aim) * (low ? 0.85 : 1), 0, 1);
        p.lidL = ease(p.lidL, lidT * (grin ? 0.8 : 1), dt, 0.04); p.lidR = ease(p.lidR, lidT * (grin ? 0.85 : 1), dt, 0.04);
        p.squint = ease(p.squint, f.aim, dt, 0.15);
        // ---- brows: height (surprise/worry) and angle (anger); reactions as pulses
        let bh = 0, baL = 0, baR = 0;
        if (f.rage) { bh = 0.5; baL = -0.35; baR = -0.35; }
        if (fire) { bh = -0.35; baL = 0.45; baR = 0.45; }
        if (mid && !f.rage) { baL += 0.2; baR += 0.2; bh -= 0.1; }
        if (hurt) { const k = Math.max(0, 1 - f.hurtAge / 0.5); bh += 0.35 * k; baL += 0.3 * k; baR += 0.3 * k; }
        if (grin) { bh += 0.3; }
        p.browL = ease(p.browL, bh, dt, 0.12); p.browR = ease(p.browR, bh + (grin ? 0.1 : 0), dt, 0.14);
        p.browAngL = ease(p.browAngL, baL, dt, 0.12); p.browAngR = ease(p.browAngR, baR, dt, 0.12);
        // ---- mouth
        let open = 0, width = 1, corners = 0, teeth = 0.7, jaw = 0;
        if (f.dead) { open = 0.15; width = 0.9; corners = -0.4; teeth = 0; }
        else if (grin) { const k = clamp(f.grinAge / 0.12, 0, 1); open = 0.35 * k; width = 1 + 0.3 * k; corners = 0.9 * k; teeth = 1; }
        else if (hurt) { const k = Math.max(0, 1 - f.hurtAge / 0.5); open = 0.7 * k; width = 0.85; corners = -0.5 * k; teeth = 0.3; jaw = 0.6 * k; }
        else if (sprinting) { open = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 5.5)); width = 0.95; corners = -0.1; teeth = 0.4; }
        else if (fire || (!mid && !low)) { open = 0.28; width = 1.12; corners = fire ? -0.25 : 0.05; teeth = 1; jaw = fire ? 0.8 : 0.55; } // the cover's grit
        else if (low) { open = 0.1; width = 0.9; corners = -0.45; teeth = 0.2; }
        else { open = 0.05; width = 1; corners = -0.15; teeth = 0.3; }
        p.mouthOpen = ease(p.mouthOpen, open, dt, hurt ? 0.04 : 0.1); p.mouthW = ease(p.mouthW, width, dt, 0.15);
        p.corners = ease(p.corners, corners, dt, 0.18); p.teeth = ease(p.teeth, teeth, dt, 0.1); p.jaw = ease(p.jaw, jaw, dt, 0.08);
        // ---- colour states
        p.blush = ease(p.blush, sprinting ? 0.45 : grin ? 0.3 : 0.18, dt, 0.8);
        p.pallor = ease(p.pallor, f.dead ? 0.6 : low ? 0.5 : mid ? 0.2 : 0, dt, 1.2);
        p.sweat = ease(p.sweat, low && !f.dead ? 1 : sprinting ? 0.5 : 0, dt, 1.5);
        p.tremor = ease(p.tremor, low && !f.dead ? 1 : 0, dt, 0.8);
        p.hurtFlash = ease(p.hurtFlash, hurt ? Math.max(0, 1 - f.hurtAge / 0.5) : 0, dt, 0.06);
        p.dead = ease(p.dead, f.dead ? 1 : 0, dt, 0.3);
        this.low = low;
    }

    draw(ctx) { paint(ctx, this.p, this.t, this.tint, this.splat, this.low); }
}

/** stateless renderer for sheets: derive parameters from a FACE_DEFAULTS object at `time` */
export function drawFace(ctx, f, time) {
    const a = new FaceAnim(); a.t = time;
    for (let i = 0; i < 40; i++) a.update(0.05, f);   // settle the tweens on the given state
    a.t = time; paint(ctx, a.p, time, f.tint || '#5a6a80', f.splat, (f.dead ? 0 : f.hp) <= 33);
}

function paint(ctx, p, t, tint, splat, low) {
    const S = SIZE, cx = 96;
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const SKIN = mix('#f1c9a3', '#ddd0c4', p.pallor), SKIN_SH = mix('#c98d64', '#a89486', p.pallor), SKIN_HI = mix('#fbe0c4', '#ece4dc', p.pallor);
    const HAIR = '#6e3f22', HAIR_HI = '#a86a3a', HAIR_LO = '#4a2814', BERET = '#b8262a', BERET_LO = '#7d1418', BERET_HI = '#d9454a';
    // background + tint glow
    ctx.fillStyle = '#23242a'; ctx.fillRect(0, 0, S, S);
    const bg = ctx.createRadialGradient(cx, 90, 10, cx, 90, 130); bg.addColorStop(0, tint); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35; ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1;
    // shoulders breathe
    ctx.save(); ctx.translate(0, -p.breath * 1.2);
    ctx.fillStyle = '#e9dcc3'; ell(ctx, cx, 215, 92, 60); ctx.fill();
    ctx.fillStyle = '#b48a5c'; ctx.beginPath(); ctx.moveTo(4, 192); ctx.quadraticCurveTo(30, 156, 70, 160); ctx.lineTo(56, 192); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(188, 192); ctx.quadraticCurveTo(162, 156, 122, 160); ctx.lineTo(136, 192); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a6540'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(62, 192); ctx.lineTo(74, 166); ctx.moveTo(130, 192); ctx.lineTo(118, 166); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = SKIN_SH; ctx.fillRect(80, 140, 32, 30);
    // head transform: yaw shifts features sideways, pitch vertically, roll rotates
    const yaw = p.headYaw, pitch = p.headPitch, roll = p.headRoll, trem = p.tremor * Math.sin(t * 31) * 0.8;
    ctx.translate(cx + yaw * 14 + trem, 100 + pitch * 22 + p.breath * 0.8); ctx.rotate(roll + trem * 0.01); ctx.translate(-cx, -100);
    const fx = yaw * 10; // feature parallax
    // hair mass (with follow-through sway)
    const sway = p.hair * 6 - yaw * 8;
    const hairGrad = ctx.createLinearGradient(0, 60, 0, 190); hairGrad.addColorStop(0, HAIR_HI); hairGrad.addColorStop(0.55, HAIR); hairGrad.addColorStop(1, HAIR_LO);
    ctx.fillStyle = hairGrad; ctx.beginPath(); ctx.moveTo(48, 70);
    for (let i = 0; i <= 8; i++) { const tt = i / 8; const y = 70 + tt * 110; const x = 46 - Math.sin(tt * 9 + 1) * 6 - tt * 10 + sway * tt; ctx.quadraticCurveTo(x - 6, y + 6, x, y + 12); }
    ctx.quadraticCurveTo(70 + sway, 190, 96 + sway, 184); ctx.quadraticCurveTo(122 + sway, 190, 154 + sway, 182);
    for (let i = 8; i >= 0; i--) { const tt = i / 8; const y = 70 + tt * 110; const x = 146 + Math.sin(tt * 9 + 2) * 6 + tt * 10 + sway * tt; ctx.quadraticCurveTo(x + 6, y + 6, x, y - 2); }
    ctx.quadraticCurveTo(120, 40, 96, 44); ctx.quadraticCurveTo(70, 40, 48, 70); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(180,120,70,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const x0 = 50 + i * 3, y0 = 90 + i * 8; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 - 10 + sway * 0.5, y0 + 22, x0 + 8, y0 + 38, x0 - 4 + sway, y0 + 62); ctx.stroke(); const x1 = 142 - i * 3; ctx.beginPath(); ctx.moveTo(x1, y0); ctx.bezierCurveTo(x1 + 10 + sway * 0.5, y0 + 22, x1 - 8, y0 + 38, x1 + 4 + sway, y0 + 62); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,200,140,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, 80); ctx.quadraticCurveTo(50, 120, 58 + sway, 160); ctx.stroke(); // highlight sweep
    if (low) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2.5; for (const [x, y, dx] of [[52, 78, -14], [142, 74, 14], [70, 60, -8], [124, 58, 10]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dx, y - 12, x + dx * 1.6, y - 4); ctx.stroke(); } }
    // face with soft shading, cheek and nose highlights, AO under the jaw
    const skinGrad = ctx.createRadialGradient(88 + fx, 96, 10, cx + fx * 0.5, 108, 56);
    skinGrad.addColorStop(0, SKIN_HI); skinGrad.addColorStop(0.6, SKIN); skinGrad.addColorStop(1, SKIN_SH);
    ctx.fillStyle = skinGrad; ell(ctx, cx, 108, 43, 50 + p.jaw * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ell(ctx, cx, 150, 34, 8); ctx.fill(); // jaw AO
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ell(ctx, 80 + fx, 92, 14, 9); ctx.fill(); ell(ctx, 96 + fx * 0.6, 112, 5, 12); ctx.fill(); // cheek + nose highlights
    // ears + earrings
    ctx.fillStyle = SKIN_SH; ell(ctx, 53 + yaw * 6, 112, 6, 9); ctx.fill(); ell(ctx, 139 + yaw * 6, 112, 6, 9); ctx.fill();
    ctx.strokeStyle = '#d9b24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(53 + yaw * 6 + p.hair * 2, 128, 6, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(139 + yaw * 6 + p.hair * 2, 128, 6, 0, Math.PI * 2); ctx.stroke();
    // blush / bruise / laugh lines / paint
    ctx.globalAlpha = p.blush; ctx.fillStyle = '#e06a55'; ell(ctx, 70 + fx, 122, 12, 8); ctx.fill(); ell(ctx, 122 + fx, 122, 12, 8); ctx.fill(); ctx.globalAlpha = 1;
    if (low) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#6a3a8a'; ell(ctx, 124 + fx, 100, 12, 9, 0.4); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = 'rgba(150,90,60,0.45)'; ctx.lineWidth = 1.5;
    const ll = 1 + p.corners * 0.6;
    ctx.beginPath(); ctx.moveTo(84 + fx, 118); ctx.quadraticCurveTo(78 + fx - ll * 2, 130, 82 + fx, 142); ctx.moveTo(108 + fx, 118); ctx.quadraticCurveTo(114 + fx + ll * 2, 130, 110 + fx, 142); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(86, 150 + p.jaw * 2); ctx.quadraticCurveTo(96, 156 + p.jaw * 2, 106, 150 + p.jaw * 2); ctx.stroke();
    ctx.fillStyle = splat || '#3a6acc'; ell(ctx, 68 + fx, 134, 5, 3.5, -0.4); ctx.fill(); ell(ctx, 74 + fx, 137, 2.2, 1.8); ctx.fill();
    if (p.hurtFlash > 0.05 && splat) { ctx.globalAlpha = Math.min(1, p.hurtFlash * 2); ctx.fillStyle = splat; ell(ctx, 126 + fx, 138, 6, 4, 0.5); ctx.fill(); ell(ctx, 133 + fx, 133, 2.5, 2); ctx.fill(); ctx.globalAlpha = 1; }
    // nose (breathing nostrils)
    ctx.strokeStyle = 'rgba(160,100,70,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(93 + fx, 104); ctx.quadraticCurveTo(88 + fx, 122, 92 + fx, 126); ctx.stroke();
    const nf = 1 + Math.max(0, p.breath) * 0.15;
    ctx.fillStyle = 'rgba(150,90,60,0.5)'; ell(ctx, 90 + fx, 126, 3 * nf, 2); ctx.fill(); ell(ctx, 102 + fx, 126, 3 * nf, 2); ctx.fill();
    // eyes: lids with travel, moisture highlight, lash line, gaze
    const eye = (x, s, lid) => {
        const ex = x + fx * 1.2, open = clamp(lid, 0, 1);
        if (p.dead > 0.5) { ctx.strokeStyle = '#8a1a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex - 7, 92); ctx.lineTo(ex + 7, 106); ctx.moveTo(ex + 7, 92); ctx.lineTo(ex - 7, 106); ctx.stroke(); return; }
        const ry = 6 * open;
        if (open > 0.08) {
            ctx.save(); ell(ctx, ex, 99, 10, ry); ctx.clip();
            ctx.fillStyle = low ? '#f6e4e0' : '#fbf8f2'; ctx.fillRect(ex - 11, 99 - 7, 22, 14);
            if (low) { ctx.strokeStyle = 'rgba(200,60,60,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ex - 8, 98); ctx.lineTo(ex - 3, 100); ctx.moveTo(ex + 8, 97); ctx.lineTo(ex + 4, 100); ctx.stroke(); }
            const gx = ex + p.gazeX * 3.2, gy = 99.5 + p.gazeY * 2 - p.squint * 0.5;
            ctx.fillStyle = '#5a3418'; ell(ctx, gx, gy, 4.6, 4.6); ctx.fill();
            ctx.fillStyle = '#1a0e08'; ell(ctx, gx, gy, 2.4, 2.4); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ell(ctx, gx - 1.6, gy - 1.9, 1.3, 1.1); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, gx + 1.8, gy + 1.6, 0.9, 0.7); ctx.fill(); // moisture
            ctx.fillStyle = 'rgba(120,70,50,0.25)'; ctx.fillRect(ex - 11, 99 - 7, 22, 2.5); // upper lid shadow
            ctx.restore();
        }
        ctx.strokeStyle = '#4a2a18'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ex - 10, 99 - ry * 0.4); ctx.quadraticCurveTo(ex, 99 - ry * 1.5 - 1, ex + 10, 99 - ry * 0.5); ctx.stroke(); // lash line follows the lid
        ctx.strokeStyle = SKIN_SH; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - 9, 99 + ry * 0.9); ctx.quadraticCurveTo(ex, 99 + ry * 1.2 + 1, ex + 9, 99 + ry * 0.9); ctx.stroke(); // lower lid
        ctx.strokeStyle = 'rgba(120,70,50,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ex + s * 11, 96); ctx.lineTo(ex + s * 15, 93 - p.corners * 2); ctx.moveTo(ex + s * 11, 101); ctx.lineTo(ex + s * 15, 103 + p.corners * 2); ctx.stroke();
    };
    eye(78, -1, p.lidL); eye(114, 1, p.lidR);
    // brows: height and angle per side
    ctx.strokeStyle = '#4a2a14'; ctx.lineWidth = 3.5;
    const brow = (x, s, h, ang) => { const y = 84 - h * 6; ctx.beginPath(); ctx.moveTo(x + fx - s * 12, y - ang * 4 * -s * 0 + (s < 0 ? -ang * 4 : ang * 4) * -1); ctx.quadraticCurveTo(x + fx, y - 4 + ang * 3, x + fx + s * 12, y + (s < 0 ? ang * 4 : -ang * 4) * -1); ctx.stroke(); };
    brow(78, -1, p.browL, p.browAngL); brow(114, 1, p.browR, p.browAngR);
    // mouth: lips, teeth, jaw
    const mw = 15 * p.mouthW, mo = 10 * p.mouthOpen, my = 140 + p.jaw * 2.5, mx = 96 + fx;
    ctx.fillStyle = '#5a1a12'; ctx.beginPath(); ctx.moveTo(mx - mw, my - p.corners * 3); ctx.quadraticCurveTo(mx, my - 2 - mo * 0.35, mx + mw, my - p.corners * 3); ctx.quadraticCurveTo(mx, my + 2 + mo, mx - mw, my - p.corners * 3); ctx.fill();
    if (p.teeth > 0.2 && mo > 1) { ctx.fillStyle = `rgba(239,230,216,${Math.min(1, p.teeth)})`; ctx.beginPath(); ctx.moveTo(mx - mw + 2, my - p.corners * 3 + 0.5); ctx.quadraticCurveTo(mx, my - 1 - mo * 0.3, mx + mw - 2, my - p.corners * 3 + 0.5); ctx.quadraticCurveTo(mx, my + Math.min(4, mo * 0.5), mx - mw + 2, my - p.corners * 3 + 0.5); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,80,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = -2; i <= 2; i++) { const x = mx + i * 4.4; ctx.moveTo(x, my - 1); ctx.lineTo(x, my + Math.min(3, mo * 0.4)); } ctx.stroke(); }
    ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx - mw, my - p.corners * 3); ctx.quadraticCurveTo(mx, my - 2 - mo * 0.35, mx + mw, my - p.corners * 3); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx - mw * 0.6, my + 3 + mo); ctx.quadraticCurveTo(mx, my + 5 + mo, mx + mw * 0.6, my + 3 + mo); ctx.stroke(); // lower lip highlight
    // sweat drops run
    if (p.sweat > 0.05) { ctx.globalAlpha = p.sweat; ctx.fillStyle = '#cfe8ff'; const d = (t * 8) % 14; ell(ctx, 136 + fx, 84 + d, 2.5, 4); ctx.fill(); ell(ctx, 58 + fx, 92 + ((d + 7) % 14), 2, 3.2); ctx.fill(); ctx.globalAlpha = 1; }
    // fringe + beret
    ctx.strokeStyle = HAIR; ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) { const x = 58 + i * 9 + sway * 0.4; ctx.beginPath(); ctx.moveTo(x, 60); ctx.quadraticCurveTo(x - 3 + (i % 2) * 6, 74, x + (i % 3) * 2 - 2 + p.hair * 2, 82 + (i % 2) * 4); ctx.stroke(); }
    ctx.strokeStyle = HAIR_HI; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const x = 66 + i * 14 + sway * 0.4; ctx.beginPath(); ctx.moveTo(x, 62); ctx.quadraticCurveTo(x + 1, 72, x - 1, 80); ctx.stroke(); }
    const beretGrad = ctx.createRadialGradient(80, 44, 6, 96, 52, 62); beretGrad.addColorStop(0, BERET_HI); beretGrad.addColorStop(0.7, BERET); beretGrad.addColorStop(1, BERET_LO);
    ctx.fillStyle = beretGrad; ell(ctx, 92 + sway * 0.2, 50, 58, 26, -0.16 + p.hair * 0.03); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(ctx, 96, 68, 46, 6, -0.1); ctx.fill(); // AO under the beret
    ctx.fillStyle = BERET_LO; ell(ctx, 96, 66, 46, 8, -0.1); ctx.fill(); ctx.fillStyle = BERET; ell(ctx, 96, 64, 44, 6, -0.1); ctx.fill();
    ctx.strokeStyle = BERET_LO; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(60, 42); ctx.quadraticCurveTo(80, 36, 104, 40); ctx.stroke();
    ctx.fillStyle = BERET_LO; ell(ctx, 86, 26, 3, 5, 0.3); ctx.fill();
    ctx.restore();
    // overlays
    if (p.hurtFlash > 0.02) { ctx.globalAlpha = 0.35 * p.hurtFlash; ctx.fillStyle = '#c02818'; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1; }
    if (p.dead > 0.02) { ctx.globalAlpha = 0.3 * p.dead; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1; }
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
