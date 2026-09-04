/**
 * GUN FX — MODERN (GOAL_LOOP M2.3)
 *
 * Muzzle flashes: additive sprites parked at each weapon's muzzle (camera
 * space, so they ride the viewmodel). Three flash shapes for the nail gun,
 * a paint-flick shape for the brush, a puff for the roller, a mist cone for
 * the sprayer. Shown for a few frames with a random roll and scale, then
 * hidden — no allocation per shot.
 */
import * as THREE from 'three';

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function canvasTex(draw) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    return t;
}

function flashTexture(seed, spikes) {
    const rng = mulberry32(seed);
    return canvasTex((ctx) => {
        ctx.translate(64, 64);
        const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
        core.addColorStop(0, 'rgba(255,255,255,1)');
        core.addColorStop(0.5, 'rgba(255,230,160,0.9)');
        core.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,210,110,0.85)';
        for (let i = 0; i < spikes; i++) {
            const a = (i / spikes) * Math.PI * 2 + rng() * 0.5;
            const l = 30 + rng() * 32, w = 4 + rng() * 6;
            ctx.save(); ctx.rotate(a);
            ctx.beginPath(); ctx.moveTo(0, -w); ctx.lineTo(l, 0); ctx.lineTo(0, w); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    });
}

function flickTexture() {
    return canvasTex((ctx) => {
        ctx.translate(64, 64);
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
        const rng = mulberry32(0xF11C);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 9; i++) {
            const a = rng() * Math.PI * 2, d = 18 + rng() * 34, r = 3 + rng() * 6;
            ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, 7); ctx.fill();
        }
    });
}

function puffTexture() {
    return canvasTex((ctx) => {
        ctx.translate(64, 64);
        const rng = mulberry32(0x9F);
        for (let i = 0; i < 7; i++) {
            const x = (rng() - 0.5) * 40, y = (rng() - 0.5) * 40, r = 18 + rng() * 16;
            const g = ctx.createRadialGradient(x, y, 1, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        }
    });
}

function coneTexture() {
    return canvasTex((ctx) => {
        // mist cone pointing +X
        const g = ctx.createLinearGradient(20, 0, 128, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(20, 64); ctx.lineTo(128, 24); ctx.lineTo(128, 104); ctx.closePath(); ctx.fill();
    });
}

let textures = null;
function getTextures() {
    if (textures) return textures;
    textures = {
        flash: [flashTexture(0x1, 7), flashTexture(0x2, 9), flashTexture(0x3, 6)],
        flick: flickTexture(),
        puff: puffTexture(),
        cone: coneTexture(),
    };
    return textures;
}

/** Per-weapon flash recipe: which texture set, scale, colour, lifetime, light. */
const RECIPE = {
    paintbrush: { tex: 'flick', scale: 0.15, life: 0.07, tint: null, light: 2.4 },
    nailgun:    { tex: 'flash', scale: 0.22, life: 0.05, tint: 0xfff0c0, light: 6.5 },
    sprayer:    { tex: 'cone', scale: 0.3, life: 0.06, tint: null, light: 2.0, forward: true },
    roller:     { tex: 'puff', scale: 0.28, life: 0.12, tint: null, light: 3.5 },
};

export class MuzzleFlash {
    /** @param parent the vmRoot (camera-space arm root) */
    constructor(parent) {
        this.parent = parent;
        const t = getTextures();
        this.sprites = {};
        for (const key of Object.keys(RECIPE)) {
            const r = RECIPE[key];
            const map = r.tex === 'flash' ? t.flash[0] : t[r.tex];
            const mat = new THREE.SpriteMaterial({
                map, color: r.tint ?? 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
                depthWrite: false, depthTest: false, toneMapped: false,
            });
            const s = new THREE.Sprite(mat);
            s.visible = false;
            s.renderOrder = 20;
            s.layers.set(1); // rides the viewmodel camera
            s.scale.setScalar(r.scale);
            parent.add(s);
            this.sprites[key] = s;
        }
        this.active = null;
        this.life = 0;
    }

    /**
     * @param key     weapon key
     * @param vm      the visible viewmodel group (for muzzle position)
     * @param color   THREE.Color paint tint for paint weapons
     * @returns light intensity to spike
     */
    fire(key, vm, color) {
        const r = RECIPE[key];
        const s = this.sprites[key];
        if (!r || !s || !vm) return 0;
        if (this.active && this.active !== s) this.active.visible = false;
        const t = getTextures();
        if (r.tex === 'flash') s.material.map = t.flash[Math.floor(Math.random() * t.flash.length)];
        if (!r.tint && color) s.material.color.copy(color).lerp(new THREE.Color(1, 1, 1), 0.35);
        // muzzle in vmRoot space: weapon local muzzle through the weapon's transform
        const m = vm.userData.muzzle || new THREE.Vector3(0, 0, -0.3);
        s.position.copy(m).applyMatrix4(vm.matrix);
        if (r.forward) s.position.z -= 0.04;
        s.material.rotation = r.forward ? 0 : Math.random() * Math.PI * 2;
        const k = r.scale * (0.8 + Math.random() * 0.5);
        s.scale.set(k * (r.forward ? 1.6 : 1), k, 1);
        s.visible = true;
        s.material.opacity = 1;
        this.active = s;
        this.life = r.life;
        this.fresh = true; // guarantee one rendered frame even at long dt
        return r.light;
    }

    update(dt) {
        if (!this.active) return;
        if (this.fresh) { this.fresh = false; return; }
        this.life -= dt;
        if (this.life <= 0) { this.active.visible = false; this.active = null; return; }
        // decay: shrink and fade a little each frame
        this.active.scale.multiplyScalar(0.92);
        this.active.material.opacity = Math.max(0.25, this.active.material.opacity * 0.9);
        if (this.life > 0.03) this.active.material.opacity = 1;
    }
}
