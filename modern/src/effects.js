/**
 * EFFECTS — paint particles, wall splats, hit flashes.
 */
import * as THREE from 'three';

let splatTexture = null;
function getSplatTexture() {
    if (splatTexture) return splatTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    // central blob
    ctx.beginPath();
    ctx.arc(64, 64, 30, 0, 7);
    ctx.fill();
    // droplets
    for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 22 + Math.random() * 34;
        const r = 3 + Math.random() * 9;
        ctx.beginPath();
        ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7);
        ctx.fill();
    }
    splatTexture = new THREE.CanvasTexture(c);
    return splatTexture;
}

export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.bursts = [];
        this.splats = [];
    }

    /** spray of paint particles */
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

    /** paint splat decal on a wall/floor */
    splat(pos, normal, color, size = 0.32) {
        const mat = new THREE.MeshBasicMaterial({
            map: getSplatTexture(),
            color,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        m.position.copy(pos).addScaledVector(normal, 0.015);
        m.lookAt(pos.clone().add(normal));
        m.rotateZ(Math.random() * Math.PI * 2);
        this.scene.add(m);
        this.splats.push({ mesh: m, life: 14 });
        if (this.splats.length > 50) {
            const old = this.splats.shift();
            this.scene.remove(old.mesh);
            old.mesh.material.dispose();
            old.mesh.geometry.dispose();
        }
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

        for (let i = this.splats.length - 1; i >= 0; i--) {
            const s = this.splats[i];
            s.life -= dt;
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                s.mesh.material.dispose();
                s.mesh.geometry.dispose();
                this.splats.splice(i, 1);
            } else if (s.life < 3) {
                s.mesh.material.opacity = 0.92 * (s.life / 3);
            }
        }
    }

    clear() {
        for (const b of this.bursts) {
            this.scene.remove(b.points);
            b.points.geometry.dispose();
            b.points.material.dispose();
        }
        for (const s of this.splats) {
            this.scene.remove(s.mesh);
            s.mesh.material.dispose();
            s.mesh.geometry.dispose();
        }
        this.bursts = [];
        this.splats = [];
    }
}
