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
function getSplatTextures() {
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

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _look = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _target = new THREE.Vector3();
const _e = new THREE.Euler();

/** Ring-buffered instanced quads facing a surface normal. */
class DecalPool {
    constructor(scene, texture, capacity) {
        this.capacity = capacity;
        const mat = new THREE.MeshBasicMaterial({
            map: texture, transparent: true, depthWrite: false,
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
        _look.lookAt(_target, _p, Math.abs(normal.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : _up);
        _q.setFromRotationMatrix(_look);
        // random roll around the normal
        _e.set(0, 0, Math.random() * Math.PI * 2);
        _q.multiply(new THREE.Quaternion().setFromEuler(_e));
        const it = this.items[i] = { life: DECAL_LIFE, size, pos: _p.clone(), quat: _q.clone() };
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
        this.decals = getSplatTextures().map((t) => new DecalPool(scene, t, DECAL_CAP));
        this.debrisPool = new DebrisPool(scene, DEBRIS_CAP);
        this.decalPick = 0;
    }

    /** spray of paint particles (classic) */
    burst(pos, color, count = 14, speed = 2.2, life = 0.5) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        for (let i = 0; i < count; i++) {
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;
            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                Math.random() * speed * 0.8,
                (Math.random() - 0.5) * speed
            ));
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color, size: 0.045, transparent: true, opacity: 1,
        });
        const points = new THREE.Points(geo, mat);
        this.scene.add(points);
        this.bursts.push({ points, velocities, life, maxLife: life });
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
            bursts: this.bursts.length,
        };
    }

    update(dt) {
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.life -= dt;
            if (b.life <= 0) {
                this.scene.remove(b.points);
                b.points.geometry.dispose();
                b.points.material.dispose();
                this.bursts.splice(i, 1);
                continue;
            }
            const pos = b.points.geometry.attributes.position;
            for (let j = 0; j < b.velocities.length; j++) {
                const v = b.velocities[j];
                v.y -= 6 * dt; // gravity
                pos.array[j * 3] += v.x * dt;
                pos.array[j * 3 + 1] = Math.max(0.02, pos.array[j * 3 + 1] + v.y * dt);
                pos.array[j * 3 + 2] += v.z * dt;
            }
            pos.needsUpdate = true;
            b.points.material.opacity = b.life / b.maxLife;
        }
        for (const p of this.decals) p.update(dt);
        this.debrisPool.update(dt);
    }

    clear() {
        for (const b of this.bursts) {
            this.scene.remove(b.points);
            b.points.geometry.dispose();
            b.points.material.dispose();
        }
        this.bursts = [];
        for (const p of this.decals) p.clear();
        this.debrisPool.clear();
    }
}
