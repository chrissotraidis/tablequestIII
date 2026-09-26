/**
 * EFFECTS — MODERN (GOAL_LOOP M1.6)
 *
 * Same API as classic (`burst`, `splat`, `update`, `clear`) plus `debris`.
 *
 *   splat  — paint decals are pooled InstancedMesh quads (three shape
 *            variants × DECAL_CAP each, per-instance colour) with a ring
 *            buffer, so hundreds persist for DECAL_LIFE seconds at a fixed
 *            cost of three draw calls. Placement is a surface-aligned quad
 *            with a small offset, which is what 2005-era engines did.
 *   debris — wood splinters are an InstancedMesh of small slabs with
 *            physics-lite: gravity, floor bounce, friction, settle, then a
 *            slow scale-out. Fixed cost: one draw call.
 *   burst  — classic point sprays, unchanged in behaviour.
 */
import * as THREE from 'three';

const DECAL_CAP = 160;        // per shape variant (3 variants → 480 decals)
const DECAL_LIFE = 90;        // seconds a splat stays (§4 M1.6: 60 s+)
const DECAL_FADE = 4;         // scale-out tail
const DEBRIS_CAP = 320;
const DEBRIS_LIFE = 24;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let splatTextures = null;
export function getSplatTextures() {
    if (splatTextures) return splatTextures;
    splatTextures = [0x51, 0x3A7, 0xC0DE].map((seed) => {
        const rng = mulberry32(seed);
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        // central blob with a slightly irregular edge
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const r = 52 + rng() * 14;
            const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        // droplets and runs
        for (let i = 0; i < 18; i++) {
            const a = rng() * Math.PI * 2;
            const d = 48 + rng() * 64;
            const r = 4 + rng() * 14;
            ctx.beginPath(); ctx.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, 0, 7); ctx.fill();
        }
        for (let i = 0; i < 4; i++) { // drips
            const x = 100 + rng() * 56, y0 = 150 + rng() * 20, l = 20 + rng() * 60;
            ctx.fillRect(x - 2, y0, 4 + rng() * 3, l);
            ctx.beginPath(); ctx.arc(x, y0 + l, 4 + rng() * 3, 0, 7); ctx.fill();
        }
        const t = new THREE.CanvasTexture(c);
        return t;
    });
    return splatTextures;
}

// soft round sprite for every point burst (classic drew hard squares)
let particleTex = null;
function getParticleTexture() {
    if (particleTex) return particleTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    particleTex = new THREE.CanvasTexture(c);
    return particleTex;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// 5.0: every burst shares one pooled point buffer (one draw call per blend
// mode, no per-hit geometry/material allocation). Per-particle colour, size
// and fade live in attributes; the shader draws soft round sprites.
const PARTICLE_CAP = 4096;
class ParticlePool {
    constructor(scene, additive) {
        this.pos = new Float32Array(PARTICLE_CAP * 3); this.col = new Float32Array(PARTICLE_CAP * 4); this.size = new Float32Array(PARTICLE_CAP);
        this.vel = new Float32Array(PARTICLE_CAP * 3); this.life = new Float32Array(PARTICLE_CAP); this.max = new Float32Array(PARTICLE_CAP);
        this.grav = new Float32Array(PARTICLE_CAP); this.drag = new Float32Array(PARTICLE_CAP); this.next = 0; this.live = 0;
        const geo = new THREE.BufferGeometry();
        this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
        this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
        this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', this.aPos); geo.setAttribute('pcolor', this.aCol); geo.setAttribute('psize', this.aSize);
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
        const mat = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            uniforms: { map: { value: getParticleTexture() }, scale: { value: 800 } },
            vertexShader: 'attribute vec4 pcolor; attribute float psize; varying vec4 vCol; uniform float scale; void main(){ vCol = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }',
            fragmentShader: ['uniform sampler2D map;', 'varying vec4 vCol;', 'void main(){', '  vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vCol.a; if (a < 0.02) discard;', '  gl_FragColor = vec4(vCol.rgb, a);', '  #include <tonemapping_fragment>', '  #include <colorspace_fragment>', '}'].join('\n'),
        });
        mat.toneMapped = !additive;
        this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 3;
        scene.add(this.points);
    }
    spawn(x, y, z, vx, vy, vz, color, size, life, gravity, drag) {
        const i = this.next; this.next = (this.next + 1) % PARTICLE_CAP;
        if (this.life[i] <= 0) this.live++;
        this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
        this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
        this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b; this.col[i * 4 + 3] = 1;
        this.size[i] = size; this.life[i] = this.max[i] = life; this.grav[i] = gravity; this.drag[i] = drag;
    }
    update(dt) {
        if (!this.live) return;
        let live = 0;
        for (let i = 0; i < PARTICLE_CAP; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt;
            if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
            live++;
            const k = this.drag[i] ? Math.max(0, 1 - this.drag[i] * dt) : 1, j = i * 3;
            this.vel[j + 1] -= this.grav[i] * dt;
            if (k !== 1) { this.vel[j] *= k; this.vel[j + 1] *= k; this.vel[j + 2] *= k; }
            this.pos[j] += this.vel[j] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
            const y = this.pos[j + 1] + this.vel[j + 1] * dt;
            if (y < 0.012) { this.pos[j + 1] = 0.012; this.vel[j + 1] *= -0.25; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; } else this.pos[j + 1] = y;
            this.col[i * 4 + 3] = Math.min(1, this.life[i] / this.max[i] * 1.6);
        }
        this.live = live;
        this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    }
    clear() { this.life.fill(0); this.col.fill(0); this.size.fill(0); this.live = 0; this.aCol.needsUpdate = this.aSize.needsUpdate = true; }
    dispose(scene) { scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
}
const _burstColor = new THREE.Color();
const _look = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _target = new THREE.Vector3();
const _e = new THREE.Euler(), _roll = new THREE.Quaternion(), _upZ = new THREE.Vector3(0, 0, 1);

/** Ring-buffered instanced quads facing a surface normal. */
class DecalPool {
    constructor(scene, texture, capacity) {
        this.capacity = capacity;
        // 5.0: lit wet paint — responds to the room's lights and reflections.
        const mat = new THREE.MeshStandardMaterial({
            map: texture, roughness: 0.22, metalness: 0.0, envMapIntensity: 1.2, transparent: true, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        });
        this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        // force the instanceColor attribute to exist from the start
        this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);
        this.items = new Array(capacity).fill(null); // { life, size, pos, quat }
        this.next = 0;
        this.live = 0;
    }

    add(pos, normal, color, size) {
        const i = this.next;
        this.next = (this.next + 1) % this.capacity;
        if (!this.items[i]) this.live++;
        _p.copy(pos).addScaledVector(normal, 0.012);
        _target.copy(_p).add(normal);
        _look.lookAt(_target, _p, Math.abs(normal.y) > 0.9 ? _upZ : _up);
        _q.setFromRotationMatrix(_look);
        // random roll around the normal
        _e.set(0, 0, Math.random() * Math.PI * 2);
        _q.multiply(_roll.setFromEuler(_e));
        // reuse the slot's record: no per-decal allocation once the ring is full
        const it = this.items[i] || (this.items[i] = { life: 0, size: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
        it.life = DECAL_LIFE; it.size = size; it.pos.copy(_p); it.quat.copy(_q);
        this.write(i, it, size);
        this.mesh.setColorAt(i, color);
        this.mesh.instanceColor.needsUpdate = true;
        this.mesh.count = Math.max(this.mesh.count, Math.min(this.capacity, i + 1));
    }

    write(i, it, scale) {
        _s.set(scale, scale, scale);
        _m.compose(it.pos, it.quat, _s);
        this.mesh.setMatrixAt(i, _m);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    update(dt) {
        for (let i = 0; i < this.mesh.count; i++) {
            const it = this.items[i];
            if (!it) continue;
            it.life -= dt;
            if (it.life <= 0) { this.items[i] = null; this.live--; this.write(i, it, 0); continue; }
            if (it.life < DECAL_FADE) this.write(i, it, it.size * (it.life / DECAL_FADE));
        }
    }

    clear() {
        for (let i = 0; i < this.capacity; i++) if (this.items[i]) { this.items[i] = null; }
        this.mesh.count = 0; this.next = 0; this.live = 0;
    }

    dispose(scene) {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

/** Instanced splinters with gravity, bounce, settle. */
class DebrisPool {
    constructor(scene, capacity) {
        this.capacity = capacity;
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
        this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.018, 0.028), mat, capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = true;
        this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);
        this.items = new Array(capacity).fill(null);
        this.next = 0;
        this.live = 0;
    }

    add(pos, vel, color, scale = 1) {
        const i = this.next;
        this.next = (this.next + 1) % this.capacity;
        if (!this.items[i]) this.live++;
        this.items[i] = {
            life: DEBRIS_LIFE, scale,
            pos: pos.clone(), vel: vel.clone(),
            rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
            ang: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
            bounces: 0, settled: false,
        };
        this.mesh.setColorAt(i, color);
        this.mesh.instanceColor.needsUpdate = true;
        this.mesh.count = Math.max(this.mesh.count, Math.min(this.capacity, i + 1));
    }

    update(dt) {
        let any = false;
        for (let i = 0; i < this.mesh.count; i++) {
            const it = this.items[i];
            if (!it) continue;
            it.life -= dt;
            if (it.life <= 0) {
                this.items[i] = null; this.live--;
                _s.set(0, 0, 0); _m.compose(it.pos, _q.identity(), _s); this.mesh.setMatrixAt(i, _m); any = true;
                continue;
            }
            if (!it.settled) {
                it.vel.y -= 9.5 * dt;
                it.pos.addScaledVector(it.vel, dt);
                it.rot.x += it.ang.x * dt; it.rot.y += it.ang.y * dt; it.rot.z += it.ang.z * dt;
                if (it.pos.y <= 0.012) {
                    it.pos.y = 0.012;
                    it.vel.y = -it.vel.y * 0.32;
                    it.vel.x *= 0.55; it.vel.z *= 0.55;
                    it.ang.multiplyScalar(0.45);
                    if (++it.bounces >= 3 || Math.abs(it.vel.y) < 0.35) {
                        it.settled = true; it.vel.set(0, 0, 0); it.ang.set(0, 0, 0);
                        it.rot.x = 0; it.rot.z = 0; // lie flat, keep yaw
                    }
                }
            } else if (it.life > 2) continue; // resting: nothing to rewrite
            const k = it.life < 2 ? it.scale * (it.life / 2) : it.scale;
            _s.set(k, k, k);
            _q.setFromEuler(it.rot);
            _m.compose(it.pos, _q, _s);
            this.mesh.setMatrixAt(i, _m);
            any = true;
        }
        if (any) this.mesh.instanceMatrix.needsUpdate = true;
    }

    clear() {
        for (let i = 0; i < this.capacity; i++) this.items[i] = null;
        this.mesh.count = 0; this.next = 0; this.live = 0;
    }

    dispose(scene) {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.bursts = [];
        this.particles = new ParticlePool(scene, false);
        this.sparks = new ParticlePool(scene, true);
        this.decals = getSplatTextures().map((t) => new DecalPool(scene, t, DECAL_CAP));
        this.debrisPool = new DebrisPool(scene, DEBRIS_CAP);
        this.decalPick = 0;
    }

    /**
     * spray of particles (classic API). opts (MODERN):
     *   size      point size (0.045)
     *   additive  additive blending, not tone mapped (sparks)
     *   gravity   units/s² (6)
     *   dir       THREE.Vector3 bias direction (e.g. surface normal), 0..1 weight via dirW
     *   dirW      how much of the speed goes along dir (0)
     *   drag      per-second velocity damping (0)
     */
    burst(pos, color, count = 14, speed = 2.2, life = 0.5, opts = {}) {
        const pool = opts.additive ? this.sparks : this.particles;
        const dir = opts.dir, dirW = opts.dirW || 0, size = (opts.size ?? 0.045) * 1.35, g = opts.gravity ?? 6, drag = opts.drag || 0;
        _burstColor.set(color);
        for (let i = 0; i < count; i++) {
            let vx = (Math.random() - 0.5) * speed, vy = Math.random() * speed * 0.8, vz = (Math.random() - 0.5) * speed;
            if (dir && dirW) { const k = speed * dirW * (0.5 + Math.random()); vx += dir.x * k; vy += dir.y * k; vz += dir.z * k; }
            pool.spawn(pos.x, pos.y, pos.z, vx, vy, vz, _burstColor, size * (0.7 + Math.random() * 0.6), life * (0.75 + Math.random() * 0.5), g, drag);
        }
    }

    /**
     * Surface-aware impact (MODERN M2.3). surface: 'metal'|'stone'|'concrete'|
     * 'wood'|'office'|'glass'|'carpet'|'marble'|'paint'. kind: 'paint'|'nail'.
     */
    impact(pos, normal, surface, color, kind = 'paint', {decalSize} = {}) {
        const n = normal;
        if (kind === 'nail') {
            // nails: a small dark hole + sparks on metal, chips on wood, dust elsewhere
            if(decalSize !== 0) this.splat(pos, n, new THREE.Color(0x1a1a1a), decalSize ?? 0.05);
            if (surface === 'metal' || surface === 'glass') {
                this.burst(pos, new THREE.Color(0xffe9a0), 14, 3.6, 0.28, { additive: true, size: 0.03, gravity: 9, dir: n, dirW: 0.8 });
            } else if (surface === 'wood' || surface === 'office') {
                this.burst(pos, new THREE.Color(0x9a7442), 8, 2.0, 0.4, { size: 0.035, dir: n, dirW: 0.6 });
            } else {
                this.burst(pos, new THREE.Color(0xb8b4a8), 10, 1.2, 0.5, { size: 0.06, gravity: 1.5, drag: 2, dir: n, dirW: 0.5 });
            }
            return;
        }
        // paint: the classic splat + spray, plus a surface reaction
        if(decalSize !== 0) this.splat(pos, n, color, decalSize ?? (0.26 + Math.random() * 0.18));
        this.burst(pos, color, 8, 1.4, 0.35, { dir: n, dirW: 0.4 });
        if (surface === 'metal' || surface === 'glass') {
            this.burst(pos, new THREE.Color(0xfff4d0), 5, 2.4, 0.22, { additive: true, size: 0.025, gravity: 8, dir: n, dirW: 0.7 });
        } else if (surface === 'stone' || surface === 'concrete' || surface === 'marble') {
            this.burst(pos, new THREE.Color(0xc8c4b8), 6, 0.9, 0.45, { size: 0.06, gravity: 1.2, drag: 2, dir: n, dirW: 0.5 });
        }
    }

    /** paint splat decal on a wall/floor (pooled, long-lived) */
    splat(pos, normal, color, size = 0.32) {
        const pool = this.decals[this.decalPick];
        this.decalPick = (this.decalPick + 1) % this.decals.length;
        pool.add(pos, normal, color, size);
    }

    /** wood splinters bursting from a broken or struck prop */
    debris(pos, baseColor, count = 12, speed = 2.6) {
        const c = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = speed * (0.4 + Math.random() * 0.8);
            const vel = new THREE.Vector3(Math.cos(a) * sp, 1.2 + Math.random() * speed * 0.9, Math.sin(a) * sp);
            c.copy(baseColor).multiplyScalar(0.75 + Math.random() * 0.5);
            const p = pos.clone();
            p.x += (Math.random() - 0.5) * 0.3; p.z += (Math.random() - 0.5) * 0.3; p.y += Math.random() * 0.3;
            this.debrisPool.add(p, vel, c, 0.7 + Math.random() * 0.8);
        }
    }

    /** live counts for the harness */
    get stats() {
        return {
            decals: this.decals.reduce((n, p) => n + p.live, 0),
            decalCapacity: this.decals.length * DECAL_CAP,
            debris: this.debrisPool.live,
            bursts: this.particles.live + this.sparks.live,
        };
    }

    update(dt) {
        this.particles.update(dt); this.sparks.update(dt);
        for (const p of this.decals) p.update(dt);
        this.debrisPool.update(dt);
    }

    clear() {
        this.particles.clear(); this.sparks.clear();
        for (const p of this.decals) p.clear();
        this.debrisPool.clear();
    }
}
