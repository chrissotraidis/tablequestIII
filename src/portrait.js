/**
 * SANDY'S PORTRAIT — painted likeness (5.1), animated with aligned frames (5.2).
 *
 * Every frame except "dead" is a pixel-aligned edit of the neutral painting, so
 * crossfades never ghost a second head. Expressions (neutral, grin, hurt, low,
 * dead) ease into each other; on top of the neutral face a real painted blink
 * and left/right glances crossfade in on their own timers. Live motion adds
 * breathing, a flinch toward the hit and a sway. The fake skin-toned eyelids of
 * 5.1 are gone: they sat below the painted eyes and smeared the face.
 * Contract matches FaceAnim: update(dt, signals) then draw(ctx) at 192x192.
 */
import neutralUrl from './assets/portrait/sandy-neutral.webp';
import grinUrl from './assets/portrait/sandy-grin.webp';
import hurtUrl from './assets/portrait/sandy-hurt.webp';
import lowUrl from './assets/portrait/sandy-low.webp';
import deadUrl from './assets/portrait/sandy-dead.webp';
import blinkUrl from './assets/portrait/sandy-blink.webp';
import lookLUrl from './assets/portrait/sandy-lookl.webp';
import lookRUrl from './assets/portrait/sandy-lookr.webp';
import { FaceAnim, SIZE } from './face.js';

const FRAMES = { neutral: neutralUrl, grin: grinUrl, hurt: hurtUrl, low: lowUrl, dead: deadUrl, blink: blinkUrl, lookl: lookLUrl, lookr: lookRUrl };
const images = {};
for (const [k, url] of Object.entries(FRAMES)) { const im = new Image(); im.decoding = 'async'; im.src = url; images[k] = im; }
const ready = (k) => images[k].complete && images[k].naturalWidth > 0;
const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
const smooth = (x) => x * x * (3 - 2 * x);
let vignette = null;

export class PortraitAnim {
    constructor() {
        this.anim = new FaceAnim();
        this.w = { neutral: 1, grin: 0, hurt: 0, low: 0, dead: 0 };
        this.gaze = 0; this.gazeTarget = 0; this.gazeNext = 2.5; this.gazeHold = 0;
        this.blink = 0; this.hp = 100; this.splat = null; this.splatAge = 99; this.t = 0;
        this.sway = 0;
    }
    update(dt, f) {
        this.anim.update(dt, f);
        this.t += dt;
        const hp = f.dead ? 0 : f.hp;
        const target = { neutral: 0, grin: 0, hurt: 0, low: 0, dead: 0 };
        if (f.dead) target.dead = 1;
        else if (f.hurtAge < 0.5) target.hurt = 1;
        else if (f.grinAge < 1.1) target.grin = 1;
        else if (hp <= 33) target.low = 1;
        else target.neutral = 1;
        // quick into a reaction, slower back out, so faces melt rather than pop
        for (const k of Object.keys(this.w)) this.w[k] = ease(this.w[k], target[k], dt, target[k] ? 0.07 : 0.22);
        // idle glances: look aside for a moment every few seconds, and toward a hit
        this.gazeNext -= dt;
        if (f.hurtAge < 0.1 && f.hurtDir) { this.gazeTarget = f.hurtDir < 0 ? -1 : 1; this.gazeHold = 0.9; this.gazeNext = 2 + Math.random() * 3; }
        else if (this.gazeNext <= 0) {
            if (this.gazeTarget === 0) { this.gazeTarget = Math.random() < 0.5 ? -1 : 1; this.gazeHold = 0.6 + Math.random() * 0.9; }
            this.gazeNext = 3 + Math.random() * 4;
        }
        if (this.gazeHold > 0) { this.gazeHold -= dt; if (this.gazeHold <= 0) this.gazeTarget = 0; }
        this.gaze = ease(this.gaze, this.gazeTarget, dt, 0.09);
        // blink closure straight from FaceAnim's blink schedule (120 ms down, 180 ms up)
        const b = this.anim.blink;
        const closed = b.phase === 1 ? Math.min(1, b.t / 0.12) : b.phase === 2 ? Math.max(0, 1 - b.t / 0.18) : 0;
        this.blink = smooth(Math.max(0, Math.min(1, closed)));
        this.hp = hp; this.low = hp <= 33 && !f.dead;
        if (f.splat && f.hurtAge < 0.1) { this.splat = f.splat; this.splatAge = 0; } else this.splatAge += dt;
        this.sway = Math.sin(this.t * 0.7) * 0.6 + Math.sin(this.t * 0.31) * 0.4;
    }
    draw(ctx) {
        const p = this.anim.p, S = SIZE;
        ctx.save();
        ctx.fillStyle = '#1d1f24'; ctx.fillRect(0, 0, S, S);
        ctx.imageSmoothingQuality = 'high';
        // head motion: flinch yaw/roll from the animation, breathing, a slow sway
        const zoom = 1.05 + p.breath * 0.005;
        ctx.translate(S / 2 + p.headYaw * 10 + this.sway * 0.8, S / 2 + p.headPitch * 8 - p.breath * 1.1);
        ctx.rotate(p.headRoll * 0.35 + this.sway * 0.004);
        ctx.scale(zoom, zoom);
        ctx.translate(-S / 2, -S / 2);
        let drawn = 0;
        const layer = (k, a) => { if (a < 0.01 || !ready(k)) return; ctx.globalAlpha = drawn ? Math.min(1, a) : 1; ctx.drawImage(images[k], 0, 0, S, S); drawn++; };
        layer('neutral', this.w.neutral);
        // glances and the blink are variations of the neutral face, so they ride on its weight
        const n = this.w.neutral;
        if (this.gaze < -0.01) layer('lookl', -this.gaze * n);
        if (this.gaze > 0.01) layer('lookr', this.gaze * n);
        layer('blink', this.blink * (n + this.w.low * 0.6));
        layer('low', this.w.low); layer('grin', this.w.grin); layer('hurt', this.w.hurt); layer('dead', this.w.dead);
        if (!drawn) layer('neutral', 1);
        ctx.globalAlpha = 1;
        // the last paint that hit her, on the cheek, fading over a few seconds
        if (this.splat && this.splatAge < 6) {
            ctx.globalAlpha = Math.max(0, 1 - this.splatAge / 6) * 0.8; ctx.fillStyle = this.splat;
            ctx.beginPath(); ctx.ellipse(132, 122, 8, 5.5, 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(141, 114, 2.6, 2.1, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(128, 133, 1.8, 4.5, 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        // grade: vignette, low-health red pulse, hurt flash
        if (!vignette) { vignette = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72); vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.5)'); }
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, S, S);
        if (this.low) { ctx.fillStyle = 'rgba(200,20,20,' + (0.1 + 0.08 * Math.sin(this.t * 4)).toFixed(3) + ')'; ctx.fillRect(0, 0, S, S); }
        if (p.hurtFlash > 0.05) { ctx.fillStyle = 'rgba(255,60,40,' + Math.min(0.3, p.hurtFlash * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, S, S); }
    }
}
