/**
 * SANDY'S PORTRAIT — 5.1 painted likeness.
 *
 * Five painted expressions (neutral, grin, hurt, low health, knocked out),
 * crossfaded by the same FaceAnim that drives the reactions, with live motion
 * on top: breathing, head flinch/roll on hits, a blink (lids drawn over the
 * painted eyes), a colour-matched splat on the cheek and a low-health pulse.
 * Contract matches FaceAnim: update(dt, signals) then draw(ctx) at 192×192.
 */
import neutralUrl from './assets/portrait/sandy-neutral.webp';
import grinUrl from './assets/portrait/sandy-grin.webp';
import hurtUrl from './assets/portrait/sandy-hurt.webp';
import lowUrl from './assets/portrait/sandy-low.webp';
import deadUrl from './assets/portrait/sandy-dead.webp';
import { FaceAnim, SIZE } from './face.js';

const FRAMES = { neutral: neutralUrl, grin: grinUrl, hurt: hurtUrl, low: lowUrl, dead: deadUrl };
const images = {};
for (const [k, url] of Object.entries(FRAMES)) { const im = new Image(); im.decoding = 'async'; im.src = url; images[k] = im; }
const ready = (k) => images[k].complete && images[k].naturalWidth > 0;
const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));

export class PortraitAnim {
    constructor() {
        this.anim = new FaceAnim();
        this.w = { neutral: 1, grin: 0, hurt: 0, low: 0, dead: 0 };
        this.pulse = 0; this.hp = 100; this.splat = null; this.splatAge = 99; this.t = 0;
    }
    update(dt, f) {
        this.anim.update(dt, f);
        this.t += dt;
        const hp = f.dead ? 0 : f.hp;
        const target = { neutral: 0, grin: 0, hurt: 0, low: 0, dead: 0 };
        if (f.dead) target.dead = 1;
        else if (f.hurtAge < 0.55) target.hurt = 1;
        else if (f.grinAge < 0.9) target.grin = 1;
        else if (hp <= 33) target.low = 1;
        else target.neutral = 1;
        for (const k of Object.keys(this.w)) this.w[k] = ease(this.w[k], target[k], dt, target[k] ? 0.06 : 0.14);
        this.hp = hp; this.low = hp <= 33 && !f.dead;
        if (f.splat && f.hurtAge < 0.1) { this.splat = f.splat; this.splatAge = 0; } else this.splatAge += dt;
        this.tint = f.tint;
    }
    draw(ctx) {
        const p = this.anim.p, S = SIZE;
        ctx.save();
        ctx.fillStyle = '#1d1f24'; ctx.fillRect(0, 0, S, S);
        // head motion from the animation: flinch yaw/roll, breathing, tremor
        const zoom = 1.04 + p.breath * 0.004;
        ctx.translate(S / 2 + p.headYaw * 16, S / 2 + p.headPitch * 14 - p.breath * 1.2);
        ctx.rotate(p.headRoll * 0.6);
        ctx.scale(zoom, zoom);
        ctx.translate(-S / 2, -S / 2);
        let drawn = 0;
        for (const k of ['neutral', 'low', 'grin', 'hurt', 'dead']) {
            const a = this.w[k]; if (a < 0.01 || !ready(k)) continue;
            ctx.globalAlpha = drawn ? a : 1; ctx.drawImage(images[k], 0, 0, S, S); drawn++;
        }
        ctx.globalAlpha = 1;
        // blink: skin-toned lids over the painted eyes while the animation's lids are closed
        const lid = 1 - Math.min(p.lidL, p.lidR);
        if (lid > 0.35 && this.w.dead < 0.5 && this.w.hurt < 0.5 && this.w.grin < 0.5) {
            ctx.fillStyle = 'rgba(176,118,84,' + Math.min(1, (lid - 0.35) * 2).toFixed(2) + ')';
            for (const [x, y] of [[74, 81], [110, 79]]) { ctx.beginPath(); ctx.ellipse(x, y, 11, 5.5 * Math.min(1, lid), 0, 0, Math.PI * 2); ctx.fill(); }
        }
        // the last paint that hit her, on the cheek, fading over a few seconds
        if (this.splat && this.splatAge < 6) {
            ctx.globalAlpha = Math.max(0, 1 - this.splatAge / 6) * 0.85; ctx.fillStyle = this.splat;
            ctx.beginPath(); ctx.ellipse(130, 118, 9, 6, 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(140, 110, 3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(126, 130, 2, 5, 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        // grade: floor tint, vignette, low-health red pulse, hurt flash
        const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
        if (this.low) { ctx.fillStyle = 'rgba(200,20,20,' + (0.12 + 0.1 * Math.sin(this.t * 5)).toFixed(3) + ')'; ctx.fillRect(0, 0, S, S); }
        if (p.hurtFlash > 0.05) { ctx.fillStyle = 'rgba(255,60,40,' + Math.min(0.35, p.hurtFlash * 0.4).toFixed(3) + ')'; ctx.fillRect(0, 0, S, S); }
    }
}
