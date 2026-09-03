/**
 * PROPS — MODERN (GOAL_LOOP M5.7)
 *
 * The 19 destructible props rebuilt at 2007-era fidelity, still procedural.
 * Every builder takes a state:
 *   'intact'   full prop
 *   'damaged'  under half health: dented, tilted, parts knocked loose
 *   'wreck'    what is left after destruction (non-blocking remains)
 * Registry values (tall / hp / height / radius) are the classic ones, so
 * collision, shot blocking, and smash resistance are unchanged.
 *
 * Props are batched per level by world.js (see rebuildPropBatch), so they
 * can afford more pieces than the classic ~6 boxes each.
 */
import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0, ...opts });
const metal = (color, rough = 0.4) => mat(color, { roughness: rough, metalness: 0.7 });
const glow = (color, emissive, k = 0.8) => mat(color, { emissive, emissiveIntensity: k, roughness: 0.4 });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
const at = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); if (ry) mesh.rotation.y = ry; return mesh; };
const tilt = (mesh, rx = 0, rz = 0) => { mesh.rotation.x += rx; mesh.rotation.z += rz; return mesh; };
const rnd = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** a small pile of broken planks/panels — shared wreck ingredient */
function rubble(g, color, n, seed, spread = 0.3, len = 0.3) {
    const r = rnd(seed), m = mat(color, { roughness: 0.9 });
    for (let i = 0; i < n; i++) {
        const p = box(len * (0.5 + r()), 0.03 + r() * 0.03, 0.06 + r() * 0.08, m);
        p.position.set((r() - 0.5) * spread, 0.02 + i * 0.012, (r() - 0.5) * spread);
        p.rotation.y = r() * Math.PI; p.rotation.z = (r() - 0.5) * 0.25; p.rotation.x = (r() - 0.5) * 0.15;
        g.add(p);
    }
}

// ---------------------------------------------------------------- builders

export function buildPlant(state = 'intact') {
    const g = new THREE.Group();
    const terracotta = mat(0xa0522d, { roughness: 0.85 }), soil = mat(0x2a1c10, { roughness: 1 }), leafMat = mat(0x2d7a35, { roughness: 0.6 }), leafDark = mat(0x1f5a28, { roughness: 0.6 });
    if (state === 'wreck') {
        for (let i = 0; i < 4; i++) { const shard = box(0.1, 0.05, 0.08, terracotta); shard.position.set((i - 1.5) * 0.09, 0.025, (i % 2) * 0.1 - 0.05); shard.rotation.y = i; shard.rotation.z = 0.3; g.add(shard); }
        g.add(at(cyl(0.16, 0.2, 0.05, soil, 12), 0.05, 0.025, 0.02));
        for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.35, 6), leafDark); leaf.position.set(-0.1 + i * 0.1, 0.03, 0.12 - i * 0.08); leaf.rotation.x = Math.PI / 2 + 0.2; leaf.rotation.z = i * 0.7; g.add(leaf); }
        return g;
    }
    const dmg = state === 'damaged';
    const pot = at(cyl(0.13, 0.1, 0.18, terracotta, 14), 0, 0.09, 0); if (dmg) tilt(pot, 0, 0.25); g.add(pot);
    g.add(at(cyl(0.135, 0.135, 0.03, mat(0xb5643b), 14), 0, 0.175, 0)); // rim
    g.add(at(cyl(0.115, 0.115, 0.02, soil, 12), 0, 0.185, 0));
    g.add(at(cyl(0.02, 0.028, 0.2, mat(0x5a3a1a), 8), 0, 0.29, 0)); // trunk
    const n = dmg ? 4 : 8;
    for (let i = 0; i < n; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 6), i % 2 ? leafMat : leafDark);
        const a = (i / n) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.06, dmg ? 0.3 : 0.38, Math.sin(a) * 0.06);
        leaf.rotation.z = Math.cos(a) * (dmg ? 0.95 : 0.55);
        leaf.rotation.x = -Math.sin(a) * (dmg ? 0.95 : 0.55);
        g.add(leaf);
    }
    if (!dmg) g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), leafMat), 0, 0.47, 0));
    return g;
}

export function buildCooler(state = 'intact') {
    const g = new THREE.Group();
    const body = mat(0xe8e4da, { roughness: 0.5 });
    if (state === 'wreck') {
        const b = box(0.26, 0.5, 0.26, body); b.position.set(0.1, 0.13, 0); b.rotation.z = Math.PI / 2; g.add(b);
        g.add(at(cyl(0.17, 0.2, 0.02, mat(0x3a6aa0, { roughness: 0.2, transparent: true, opacity: 0.6 }), 14), -0.2, 0.01, 0.05));
        return g;
    }
    const dmg = state === 'damaged';
    const b = box(0.26, 0.5, 0.26, body); b.position.y = 0.25; if (dmg) tilt(b, 0, 0.08); g.add(b);
    g.add(at(box(0.27, 0.03, 0.27, mat(0xb8b4aa)), 0, 0.505, 0));
    g.add(at(box(0.22, 0.12, 0.012, mat(0xc8c4ba)), 0, 0.14, 0.131)); // vent/drip panel
    g.add(at(box(0.05, 0.04, 0.04, mat(0x4488cc)), -0.05, 0.38, 0.15)); g.add(at(box(0.05, 0.04, 0.04, mat(0xcc4444)), 0.05, 0.38, 0.15)); // cold / hot taps
    g.add(at(box(0.16, 0.02, 0.08, mat(0x9a968c)), 0, 0.3, 0.16)); // drip tray
    if (!dmg) {
        g.add(at(cyl(0.09, 0.1, 0.22, mat(0x55aadd, { emissive: 0x113344, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), 12), 0, 0.61, 0));
        g.add(at(cyl(0.07, 0.07, 0.14, mat(0x3a8ac0, { transparent: true, opacity: 0.75 }), 12), 0, 0.58, 0)); // water level
        g.add(at(cyl(0.045, 0.04, 0.05, mat(0x3a7ab0), 10), 0, 0.745, 0)); // neck
    } else g.add(at(cyl(0.05, 0.05, 0.03, mat(0x3a7ab0), 10), 0, 0.52, 0));
    return g;
}

export function buildCabinet(state = 'intact') {
    const g = new THREE.Group();
    const steel = mat(0x8a8f96, { roughness: 0.45, metalness: 0.5 }), seam = mat(0x5a5f66), handleM = metal(0x3a3f46, 0.35);
    if (state === 'wreck') { rubble(g, 0x7a7f86, 6, 0xCAB, 0.4, 0.4); g.add(at(box(0.4, 0.04, 0.3, steel), 0.05, 0.05, 0, 0.4)); return g; }
    const dmg = state === 'damaged';
    const body = box(0.44, 0.86, 0.36, steel); body.position.y = 0.43; if (dmg) tilt(body, 0.04, 0.03); g.add(body);
    g.add(at(box(0.44, 0.03, 0.36, mat(0x6a6f76)), 0, 0.015, 0)); // kick
    for (let i = 0; i < 4; i++) {
        const y = 0.12 + i * 0.21;
        const open = dmg && i === 3;
        g.add(at(box(0.4, 0.012, 0.015, seam), 0, y + 0.1, 0.183));
        const drawerFront = box(0.4, 0.18, 0.02, mat(0x8a8f96));
        drawerFront.position.set(0, y, open ? 0.32 : 0.185); if (open) drawerFront.rotation.x = -0.15;
        g.add(drawerFront);
        g.add(at(box(0.1, 0.025, 0.025, handleM), 0, y + 0.02, open ? 0.34 : 0.2));
        g.add(at(box(0.06, 0.03, 0.006, mat(0xe8e4da)), -0.13, y + 0.04, open ? 0.33 : 0.197)); // label slot
        if (open) g.add(at(box(0.36, 0.14, 0.26, mat(0x6a6f76)), 0, y, 0.2)); // the open drawer's box
    }
    return g;
}

export function buildCrate(state = 'intact') {
    const g = new THREE.Group();
    const wood = mat(0x9a6f3a, { roughness: 0.85 }), edge = mat(0x6e4a20, { roughness: 0.9 });
    if (state === 'wreck') { rubble(g, 0x8a5f2e, 8, 0xC8A7E, 0.45, 0.5); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.52, 0.52, 0.52, wood), 0, 0.26, 0));
    for (const y of [0.04, 0.48]) g.add(at(box(0.56, 0.06, 0.56, edge), 0, y, 0));
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) g.add(at(box(0.06, 0.52, 0.06, edge), x, 0.26, z)); // corner posts
    for (const rz of [Math.PI / 4, -Math.PI / 4]) { const br = box(0.06, 0.62, 0.015, edge); br.position.set(0, 0.26, 0.275); br.rotation.z = rz; g.add(br); }
    g.add(at(box(0.22, 0.1, 0.005, mat(0x3a2a16)), 0, 0.3, 0.28)); // stencil block
    if (dmg) { const lid = box(0.5, 0.04, 0.5, wood); lid.position.set(0.18, 0.56, 0.1); lid.rotation.z = 0.4; lid.rotation.y = 0.3; g.add(lid); g.add(at(box(0.2, 0.3, 0.04, mat(0x2a1a0a)), 0.16, 0.3, 0.27)); }
    return g;
}

export function buildBarrel(state = 'intact') {
    const g = new THREE.Group();
    const drum = mat(0x4a5a66, { roughness: 0.5, metalness: 0.3 }), ring = metal(0x2c3640, 0.5);
    if (state === 'wreck') { const b = cyl(0.2, 0.2, 0.56, drum, 14); b.position.set(0.05, 0.2, 0); b.rotation.z = Math.PI / 2; b.rotation.y = 0.5; g.add(b); g.add(at(cyl(0.3, 0.34, 0.012, mat(0x2a6acc, { roughness: 0.15 }), 16), -0.15, 0.006, 0.1)); return g; }
    const dmg = state === 'damaged';
    const b = cyl(0.2, 0.2, 0.56, drum, 14); b.position.y = 0.28; if (dmg) { b.scale.set(0.92, 1, 1.05); tilt(b, 0.06, -0.08); } g.add(b);
    for (const y of [0.1, 0.3, 0.5]) g.add(at(cyl(0.21, 0.21, 0.03, ring, 14), 0, y, 0));
    g.add(at(cyl(0.17, 0.17, 0.02, metal(0x66767f, 0.45), 14), 0, 0.57, 0));
    g.add(at(cyl(0.03, 0.03, 0.03, metal(0x9aa0a8, 0.3), 8), 0.08, 0.59, 0.05)); // bung
    g.add(at(box(0.16, 0.12, 0.005, mat(0xc9a227, { roughness: 0.6 })), 0, 0.3, 0.205)); // label
    if (dmg) g.add(at(box(0.08, 0.2, 0.01, mat(0x2a6acc, { roughness: 0.2 })), 0.12, 0.15, 0.2)); // leaking paint streak
    return g;
}

export function buildShelf(state = 'intact') {
    const g = new THREE.Group();
    const frame = mat(0x6e5638, { roughness: 0.8 });
    const bins = [mat(0xb09a6a), mat(0x8a8276), mat(0x3a5a8a), mat(0x8a3a3a), mat(0xd8d2c0)];
    if (state === 'wreck') { rubble(g, 0x6e5638, 7, 0x5E1F, 0.5, 0.6); for (let i = 0; i < 4; i++) g.add(at(box(0.12, 0.12, 0.16, bins[i]), -0.2 + i * 0.14, 0.09, (i % 2) * 0.15 - 0.05, i)); return g; }
    const dmg = state === 'damaged';
    for (const x of [-0.32, 0.32]) g.add(at(box(0.05, 1.1, 0.3, frame), x, 0.55, 0));
    g.add(at(box(0.69, 1.1, 0.012, mat(0x5a4630)), 0, 0.55, -0.145)); // back panel
    for (let i = 0; i < 4; i++) {
        const y = 0.12 + i * 0.31;
        const board = box(0.69, 0.035, 0.3, frame); board.position.y = y; if (dmg && i === 2) { board.rotation.z = 0.18; board.position.y -= 0.05; } g.add(board);
        if (i < 3) {
            const n = 3 + (i % 2);
            for (let j = 0; j < n; j++) {
                const fallen = dmg && (i === 2 || (i === 1 && j === 0));
                const item = box(0.11 + (j % 3) * 0.025, fallen ? 0.06 : 0.16 + (j % 2) * 0.04, 0.2, bins[(i + j) % bins.length]);
                item.position.set(-0.24 + j * 0.16, fallen ? 0.03 : y + 0.1 + (j % 2) * 0.02, fallen ? 0.28 + j * 0.05 : 0);
                if (fallen) item.rotation.y = j * 0.8;
                g.add(item);
                if (!fallen) g.add(at(box(0.06, 0.03, 0.004, mat(0xf0ece0)), -0.24 + j * 0.16, y + 0.12, 0.101)); // spine label
            }
        }
    }
    return g;
}

export function buildDesk(state = 'intact') {
    const g = new THREE.Group();
    const deskMat = mat(0xb8a888, { roughness: 0.55 }), dark = mat(0x333a44, { roughness: 0.8 });
    if (state === 'wreck') { rubble(g, 0xa89878, 6, 0xDE5C, 0.5, 0.6); const crt = box(0.24, 0.2, 0.2, mat(0xd8d2c0)); crt.position.set(0.2, 0.1, 0.1); crt.rotation.z = 1.2; g.add(crt); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.8, 0.04, 0.5, deskMat), 0, 0.42, 0));
    g.add(at(box(0.8, 0.02, 0.5, mat(0x9a8a6a)), 0, 0.395, 0)); // edge band
    for (const x of [-0.37, 0.37]) g.add(at(box(0.04, 0.42, 0.46, deskMat), x, 0.21, 0));
    g.add(at(box(0.72, 0.06, 0.02, deskMat), 0, 0.36, -0.22)); // modesty rail
    for (let i = 0; i < 2; i++) { g.add(at(box(0.3, 0.12, 0.44, mat(0xa89878)), 0.2, 0.34 - i * 0.14, 0)); g.add(at(box(0.08, 0.02, 0.02, metal(0x555a60)), 0.2, 0.34 - i * 0.14, 0.23)); } // drawers
    // CRT monitor (knocked over when damaged)
    const crt = box(0.24, 0.2, 0.2, mat(0xd8d2c0)); const screen = box(0.17, 0.13, 0.01, glow(0x1a2a3a, 0x224466, 0.8));
    if (dmg) { crt.position.set(-0.05, 0.5, 0.05); crt.rotation.z = Math.PI / 2; crt.rotation.y = 0.4; screen.position.set(-0.05, 0.5, 0.06); screen.rotation.z = Math.PI / 2; screen.material = mat(0x0a0e12); }
    else { crt.position.set(-0.12, 0.55, -0.05); screen.position.set(-0.12, 0.555, 0.052); }
    g.add(crt, screen);
    g.add(at(box(0.26, 0.02, 0.1, mat(0xc8c2b0)), 0.12, 0.45, 0.08)); // keyboard
    g.add(at(box(0.05, 0.02, 0.08, mat(0xc8c2b0)), 0.3, 0.45, 0.1)); // mouse
    g.add(at(box(0.16, 0.01, 0.22, mat(0xf0ece0)), -0.28, 0.445, 0.1, 0.2)); // papers
    g.add(at(cyl(0.03, 0.026, 0.07, mat(0xe0e0e8), 10), 0.32, 0.475, -0.14)); // mug
    // office chair with a five-star base
    const chair = new THREE.Group(); chair.position.set(0, 0, 0.42);
    chair.add(at(box(0.26, 0.05, 0.26, dark), 0, 0.24, 0));
    chair.add(at(box(0.26, 0.3, 0.05, dark), 0, 0.4, 0.13));
    chair.add(at(cyl(0.022, 0.022, 0.2, metal(0x222222), 8), 0, 0.12, 0));
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const spoke = box(0.02, 0.02, 0.16, metal(0x222222)); spoke.position.set(Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08); spoke.rotation.y = -a + Math.PI / 2; chair.add(spoke); }
    if (dmg) { chair.rotation.z = Math.PI / 2 - 0.1; chair.position.set(0.15, 0.13, 0.5); }
    g.add(chair);
    return g;
}

export function buildBench(state = 'intact') {
    const g = new THREE.Group();
    const wood = mat(0x8a5a30, { roughness: 0.7 }), iron = metal(0x3a3a42, 0.5);
    if (state === 'wreck') { rubble(g, 0x7a4a24, 6, 0xBE9C, 0.6, 0.8); return g; }
    const dmg = state === 'damaged';
    for (let i = 0; i < 3; i++) g.add(at(box(0.85, 0.03, 0.09, wood), 0, 0.26, -0.11 + i * 0.11));
    for (let i = 0; i < 3; i++) if (!(dmg && i === 1)) { const s = box(0.85, 0.07, 0.03, wood); s.position.set(0, 0.36 + i * 0.09, -0.16 - i * 0.02); s.rotation.x = -0.12; g.add(s); }
    for (const x of [-0.36, 0.36]) { g.add(at(box(0.05, 0.26, 0.28, iron), x, 0.13, 0)); g.add(at(box(0.05, 0.3, 0.05, iron), x, 0.4, -0.15)); g.add(at(box(0.05, 0.04, 0.3, iron), x, 0.47, -0.02)); } // legs, back posts, armrests
    return g;
}

export function buildPallet(state = 'intact') {
    const g = new THREE.Group();
    const wood = mat(0x9a7a4a, { roughness: 0.9 });
    if (state === 'wreck') { rubble(g, 0x8a6a3a, 7, 0xA11, 0.6, 0.7); return g; }
    const dmg = state === 'damaged';
    for (let i = 0; i < 5; i++) g.add(at(box(0.7, 0.03, 0.1, wood), 0, 0.1, -0.28 + i * 0.14));
    for (const x of [-0.28, 0, 0.28]) g.add(at(box(0.1, 0.08, 0.66, wood), x, 0.05, 0));
    const card = mat(0xc8b088, { roughness: 0.9 }), card2 = mat(0xb89c70, { roughness: 0.9 }), tape = mat(0x8a6a3a);
    const b1 = box(0.5, 0.09, 0.55, card), b2 = box(0.44, 0.09, 0.48, card2);
    if (dmg) { b1.position.set(0.32, 0.05, 0.2); b1.rotation.z = 0.5; b1.rotation.y = 0.6; b2.position.set(-0.05, 0.17, 0); b2.rotation.y = -0.3; }
    else { b1.position.y = 0.17; b2.position.set(0.02, 0.26, -0.02); b2.rotation.y = 0.15; }
    g.add(b1, b2);
    g.add(at(box(0.5, 0.005, 0.05, tape), b1.position.x, b1.position.y + 0.048, b1.position.z));
    g.add(at(box(0.12, 0.06, 0.005, mat(0xe0dccc)), b2.position.x, b2.position.y, b2.position.z + 0.243)); // shipping label
    return g;
}

export function buildStatue(state = 'intact') {
    const g = new THREE.Group();
    const gold = mat(0xd4af37, { emissive: 0x5a4408, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 });
    const stone = mat(0x3a3a42, { roughness: 0.5 }), base = mat(0x2a2a30, { roughness: 0.6 });
    if (state === 'wreck') { g.add(at(box(0.34, 0.16, 0.34, base), 0, 0.08, 0)); rubble(g, 0x3a3a42, 4, 0x57A7, 0.4, 0.3); const t = box(0.3, 0.035, 0.2, gold); t.position.set(0.18, 0.05, 0.15); t.rotation.z = 0.5; g.add(t); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.34, 0.16, 0.34, base), 0, 0.08, 0));
    g.add(at(box(0.26, 0.4, 0.26, stone), 0, 0.36, 0));
    g.add(at(box(0.3, 0.03, 0.3, base), 0, 0.575, 0)); // cap
    g.add(at(box(0.12, 0.05, 0.006, mat(0xc9a227, { roughness: 0.3, metalness: 0.7 })), 0, 0.3, 0.134)); // plaque
    const table = new THREE.Group(); table.position.y = 0.59;
    table.add(at(box(0.3, 0.035, 0.2, gold), 0, 0.16, 0));
    table.add(at(box(0.2, 0.01, 0.14, mat(0x6a1f1a)), 0, 0.18, 0)); // velvet runner
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(at(cyl(0.014, 0.018, 0.17, gold, 8), sx * 0.12, 0.06, sz * 0.07));
    if (dmg) { table.rotation.z = 0.35; table.position.x = 0.06; }
    g.add(table);
    return g;
}

export function buildMachine(state = 'intact') {
    const g = new THREE.Group();
    const hull = mat(0x55606a, { roughness: 0.45, metalness: 0.4 }), dark = mat(0x2a3038);
    if (state === 'wreck') { const h = box(0.7, 0.85, 0.55, hull); h.position.set(0, 0.28, 0.1); h.rotation.x = Math.PI / 2 - 0.2; g.add(h); rubble(g, 0x3c454e, 4, 0x3AC, 0.5, 0.3); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.7, 0.85, 0.55, hull), 0, 0.425, 0));
    g.add(at(box(0.72, 0.06, 0.57, dark), 0, 0.03, 0)); // base
    g.add(at(box(0.3, 0.22, 0.02, dmg ? mat(0x0e1216) : dark), -0.12, 0.6, 0.285)); // control panel
    g.add(at(box(0.05, 0.05, 0.03, dmg ? mat(0x552211) : glow(0xff4422, 0xaa1100, 1)), 0.18, 0.66, 0.285));
    g.add(at(box(0.05, 0.05, 0.03, dmg ? glow(0xff4422, 0xaa1100, 1) : glow(0x44ff66, 0x00aa22, 1)), 0.26, 0.66, 0.285));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.012, 0.012, 0.01, metal(0x9aa0a8, 0.3), 8), -0.24 + i * 0.08, 0.53, 0.29)); // knobs
    g.add(at(cyl(0.06, 0.06, 0.5, metal(0x3c454e, 0.5), 10), 0.22, 1.05, -0.1)); // stack
    g.add(at(cyl(0.08, 0.08, 0.04, metal(0x2a3038, 0.5), 10), 0.22, 1.3, -0.1)); // stack collar
    g.add(at(box(0.4, 0.12, 0.02, mat(0x1e242a)), 0, 0.2, 0.285)); // vent
    for (let i = 0; i < 5; i++) g.add(at(box(0.4, 0.008, 0.005, metal(0x8a929c, 0.4)), 0, 0.16 + i * 0.02, 0.297)); // vent slats
    g.add(at(box(0.7, 0.06, 0.005, mat(0xc9a227)), 0, 0.85, 0.28)); // hazard band
    g.add(at(box(0.16, 0.05, 0.6, metal(0x6a747e, 0.5)), -0.33, 0.87, 0)); // conveyor rail stub
    if (dmg) { const door = box(0.28, 0.4, 0.02, hull); door.position.set(0.16, 0.3, 0.34); door.rotation.y = 0.7; g.add(door); }
    return g;
}

export function buildCounter(state = 'intact') {
    const g = new THREE.Group();
    const wood = mat(0x7a5a32, { roughness: 0.6 }), topM = mat(0x9a7442, { roughness: 0.4 });
    if (state === 'wreck') { rubble(g, 0x7a5a32, 6, 0xC0, 0.7, 0.8); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.9, 0.5, 0.42, wood), 0, 0.25, 0));
    for (let i = 0; i < 3; i++) g.add(at(box(0.24, 0.36, 0.01, mat(0x6a4a26)), -0.3 + i * 0.3, 0.28, 0.212)); // panel inlays
    const top = box(0.98, 0.05, 0.5, topM); top.position.y = 0.52; if (dmg) tilt(top, 0, 0.06); g.add(top);
    g.add(at(box(0.9, 0.08, 0.02, mat(0x3a2a16)), 0, 0.04, 0.21));
    const reg = box(0.16, 0.12, 0.14, metal(0x8a8276, 0.4)); reg.position.set(0.3, 0.6, 0); if (dmg) { reg.position.set(0.2, 0.58, 0.12); reg.rotation.z = 0.6; } g.add(reg);
    g.add(at(box(0.12, 0.02, 0.1, mat(0x3a3f46)), reg.position.x, reg.position.y + 0.065, reg.position.z + 0.01));
    g.add(at(cyl(0.035, 0.04, 0.04, metal(0xc9a227, 0.3), 12), -0.3, 0.565, 0.08)); // service bell
    g.add(at(box(0.16, 0.08, 0.12, mat(0xe8e4da)), -0.05, 0.585, -0.12, 0.3)); // brochures
    return g;
}

export function buildSofa(state = 'intact') {
    const g = new THREE.Group();
    const fabric = mat(0x7a3a30, { roughness: 0.95 }), fabric2 = mat(0x6a3028, { roughness: 0.95 }), baseM = mat(0x2c1c12, { roughness: 0.8 });
    if (state === 'wreck') { g.add(at(box(0.82, 0.1, 0.36, baseM), 0, 0.05, 0)); const c = box(0.4, 0.14, 0.38, fabric); c.position.set(-0.15, 0.17, 0.3); c.rotation.y = 0.5; g.add(c); rubble(g, 0x4a2a1a, 4, 0x50FA, 0.5, 0.4); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.82, 0.1, 0.36, baseM), 0, 0.07, 0));
    for (let i = 0; i < 3; i++) { const c = box(0.26, dmg && i === 1 ? 0.1 : 0.18, 0.4, i % 2 ? fabric2 : fabric); c.position.set(-0.28 + i * 0.28, dmg && i === 1 ? 0.17 : 0.21, 0); g.add(c); }
    const back = box(0.85, 0.32, 0.12, fabric); back.position.set(0, 0.4, -0.16); if (dmg) tilt(back, -0.25, 0); g.add(back);
    for (const x of [-0.39, 0.39]) g.add(at(box(0.1, 0.16, 0.4, fabric), x, 0.36, 0));
    for (const x of [-0.36, 0.36]) for (const z of [-0.14, 0.14]) g.add(at(cyl(0.02, 0.02, 0.04, baseM, 8), x, 0.02, z)); // feet
    const cushion = box(0.2, 0.14, 0.08, mat(0xc9a227)); cushion.position.set(-0.22, 0.36, -0.1); cushion.rotation.z = 0.2; if (dmg) { cushion.position.set(0.3, 0.03, 0.4); cushion.rotation.z = 1.4; } g.add(cushion);
    return g;
}

export function buildVending(state = 'intact') {
    const g = new THREE.Group();
    const red = mat(0xb02818, { roughness: 0.45 });
    if (state === 'wreck') { const h = box(0.55, 1.15, 0.45, red); h.position.set(0.1, 0.23, 0); h.rotation.z = Math.PI / 2; g.add(h); for (let i = 0; i < 5; i++) g.add(at(box(0.09, 0.02, 0.13, mat(i % 2 ? 0xe8a020 : 0xcc4422)), -0.3 + i * 0.12, 0.01, 0.3 + (i % 2) * 0.1, i)); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.55, 1.15, 0.45, red), 0, 0.575, 0));
    g.add(at(box(0.56, 0.06, 0.46, mat(0x2a1a18)), 0, 0.03, 0)); // plinth
    g.add(at(box(0.4, 0.62, 0.02, dmg ? mat(0x0c1216, { roughness: 0.2 }) : glow(0x18242e, 0x0c1620, 0.8)), -0.04, 0.74, 0.23));
    if (dmg) for (let i = 0; i < 6; i++) { const crack = box(0.012, 0.18 + (i % 3) * 0.08, 0.004, mat(0xa8c8e0)); crack.position.set(-0.2 + i * 0.065, 0.74 + (i % 2) * 0.1, 0.242); crack.rotation.z = (i - 3) * 0.3; g.add(crack); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const fallen = dmg && r === 2;
        const bag = box(0.09, fallen ? 0.02 : 0.13, fallen ? 0.13 : 0.015, mat(c % 2 ? 0xe8a020 : 0xcc4422, { roughness: 0.5 }));
        bag.position.set(-0.16 + c * 0.12, fallen ? 0.46 : 0.52 + r * 0.19, fallen ? 0.2 : 0.245);
        g.add(bag);
        if (!fallen) g.add(at(box(0.09, 0.005, 0.03, metal(0x9aa0a8, 0.4)), -0.16 + c * 0.12, 0.45 + r * 0.19, 0.24)); // shelf lip
    }
    g.add(at(box(0.45, 0.14, 0.03, glow(0xffd24a, 0x806000, dmg ? 0.3 : 0.9)), 0, 1.05, 0.235)); // marquee
    g.add(at(box(0.1, 0.4, 0.02, mat(0x6a6a72)), 0.2, 0.74, 0.23));
    g.add(at(box(0.03, 0.06, 0.01, mat(0x1a1a20)), 0.2, 0.85, 0.245)); // coin slot
    g.add(at(box(0.06, 0.06, 0.01, glow(0x2a3a2a, 0x1a6a2a, 0.6)), 0.2, 0.7, 0.245)); // keypad
    g.add(at(box(0.34, 0.12, 0.04, mat(0x1a1a20)), -0.04, 0.22, 0.22));
    return g;
}

export function buildFridge(state = 'intact') {
    const g = new THREE.Group();
    const white = mat(0xd8d4ca, { roughness: 0.35 }), trim = mat(0x8a867c);
    if (state === 'wreck') { const h = box(0.5, 1.05, 0.45, white); h.position.set(0, 0.23, 0.1); h.rotation.x = Math.PI / 2; g.add(h); const door = box(0.48, 0.7, 0.03, white); door.position.set(0.3, 0.02, -0.2); door.rotation.x = Math.PI / 2; door.rotation.z = 0.4; g.add(door); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.5, 1.05, 0.45, white), 0, 0.525, 0));
    g.add(at(box(0.5, 0.015, 0.46, trim), 0, 0.72, 0));
    g.add(at(box(0.5, 0.04, 0.45, mat(0x2a2a2e)), 0, 0.02, 0)); // kick
    const door = box(0.48, 0.32, 0.03, white); if (dmg) { door.position.set(0.2, 0.89, 0.35); door.rotation.y = -0.9; } else door.position.set(0, 0.89, 0.235); g.add(door); // freezer door (ajar when damaged)
    for (const [y, h] of [[0.85, 0.18], [0.45, 0.3]]) g.add(at(box(0.03, h, 0.03, metal(0x9a968c, 0.35)), 0.2, y, dmg && y > 0.8 ? 0.4 : 0.25));
    g.add(at(box(0.08, 0.06, 0.004, mat(0xc9a227)), -0.12, 0.6, 0.227)); g.add(at(box(0.06, 0.08, 0.004, mat(0x3a6acc)), -0.05, 0.5, 0.227)); // magnets
    return g;
}

export function buildFloorLamp(state = 'intact') {
    const g = new THREE.Group();
    const brass = metal(0x8a7a52, 0.4), shadeM = glow(0xf2e2b8, 0xaa8844, 0.9);
    if (state === 'wreck') { const pole = cyl(0.014, 0.014, 0.85, brass, 8); pole.position.set(0.2, 0.02, 0.1); pole.rotation.z = Math.PI / 2; pole.rotation.y = 0.4; g.add(pole); const shade = cyl(0.1, 0.15, 0.18, mat(0xd8c8a0), 10); shade.position.set(0.55, 0.1, 0.25); shade.rotation.z = 1.3; g.add(shade); g.add(at(cyl(0.12, 0.14, 0.04, mat(0x3a3026), 10), -0.1, 0.02, 0)); return g; }
    const dmg = state === 'damaged';
    g.add(at(cyl(0.12, 0.14, 0.04, mat(0x3a3026), 12), 0, 0.02, 0));
    const pole = cyl(0.014, 0.014, 0.85, brass, 8); pole.position.y = 0.46; if (dmg) tilt(pole, 0, 0.12); g.add(pole);
    g.add(at(cyl(0.03, 0.02, 0.03, brass, 8), 0, 0.05, 0));
    const shade = cyl(0.1, 0.15, 0.18, shadeM, 12); shade.position.y = 0.95; if (dmg) { shade.position.x = 0.1; tilt(shade, 0.3, 0.4); } g.add(shade);
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow(0xfff2c0, 0xffd080, 1.4)), dmg ? 0.1 : 0, 0.92, 0)); // bulb
    return g;
}

export function buildBigTable(state = 'intact') {
    const g = new THREE.Group();
    const wood = mat(0x8a5a2c, { roughness: 0.45 }), woodDark = mat(0x6a4220);
    if (state === 'wreck') { const t = box(1.3, 0.06, 0.7, wood); t.position.set(0, 0.05, 0); t.rotation.z = 0.08; g.add(t); rubble(g, 0x6a4220, 4, 0xB16, 0.8, 0.4); return g; }
    const dmg = state === 'damaged';
    const top = box(1.3, 0.06, 0.7, wood); top.position.y = 0.42; if (dmg) { top.rotation.z = -0.2; top.position.y = 0.36; top.position.x = 0.1; } g.add(top);
    g.add(at(box(1.32, 0.02, 0.72, woodDark), 0, 0.395, 0)); // apron
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (!(dmg && sx === 1)) g.add(at(box(0.07, 0.4, 0.07, woodDark), sx * 0.56, 0.2, sz * 0.27));
    if (!dmg) {
        g.add(at(box(0.5, 0.012, 0.66, mat(0x6a1f1a, { roughness: 0.9 })), 0, 0.455, 0)); // runner
        for (const x of [-0.4, 0.4]) { g.add(at(cyl(0.02, 0.03, 0.12, metal(0xc9a227, 0.3), 8), x, 0.51, 0)); g.add(at(cyl(0.012, 0.012, 0.08, mat(0xf0e8d0), 8), x, 0.6, 0)); } // candlesticks
        for (let i = 0; i < 3; i++) g.add(at(box(0.16, 0.01, 0.22, mat(0xf0ece0)), -0.3 + i * 0.3, 0.456, 0.15 * (i % 2 ? 1 : -1), i * 0.3)); // papers
    }
    return g;
}

export function buildLumberStack(state = 'intact') {
    const g = new THREE.Group();
    const tones = [0x9a7442, 0xa07a46, 0x8a6a3a];
    if (state === 'wreck') { for (let i = 0; i < 7; i++) { const p = box(0.16, 0.09, 0.95, mat(tones[i % 3])); p.position.set(-0.35 + i * 0.12, 0.045, (i % 2) * 0.1); p.rotation.y = (i - 3) * 0.12; g.add(p); } return g; }
    const dmg = state === 'damaged';
    for (let layer = 0; layer < 4; layer++) {
        const n = 4 - (layer % 2);
        for (let i = 0; i < n; i++) {
            const plank = box(0.16, 0.09, 0.95, mat(tones[(layer + i) % 3], { roughness: 0.85 }));
            plank.position.set(-0.27 + i * 0.18 + (layer % 2) * 0.09, 0.05 + layer * 0.1, 0);
            if (dmg && layer >= 2) { plank.position.x += (i - 1) * 0.06; plank.rotation.y = (i - 1) * 0.15; plank.position.y -= 0.02; }
            g.add(plank);
        }
    }
    for (const z of [-0.3, 0.3]) g.add(at(box(0.78, 0.01, 0.04, mat(0x2a2a2e)), 0, dmg ? 0.3 : 0.41, z)); // straps
    return g;
}

export function buildCopier(state = 'intact') {
    const g = new THREE.Group();
    const beige = mat(0xd0ccc0, { roughness: 0.5 });
    if (state === 'wreck') { const h = box(0.55, 0.62, 0.45, beige); h.position.set(0.05, 0.25, 0); h.rotation.z = 1.2; g.add(h); for (let i = 0; i < 5; i++) g.add(at(box(0.12, 0.004, 0.16, mat(0xf0ece0)), -0.3 + i * 0.12, 0.005, 0.25 + (i % 2) * 0.1, i * 0.4)); return g; }
    const dmg = state === 'damaged';
    g.add(at(box(0.55, 0.62, 0.45, beige), 0, 0.31, 0));
    g.add(at(box(0.58, 0.07, 0.48, mat(0xb8b4a8)), 0, 0.65, 0));
    const lid = box(0.4, 0.03, 0.32, mat(0x8a867c)); if (dmg) { lid.position.set(-0.02, 0.86, -0.14); lid.rotation.x = -1.2; } else { lid.position.set(-0.02, 0.7, 0); lid.rotation.z = 0.06; } g.add(lid);
    g.add(at(box(0.16, 0.02, 0.12, dmg ? glow(0x3a1a1a, 0x8a1a1a, 0.9) : glow(0x2a3a2a, 0x1a4a2a, 0.8)), 0.19, 0.665, 0.16)); // panel (red on jam)
    const tray = box(0.3, 0.02, 0.18, mat(0xe8e4da)); tray.position.set(-0.05, 0.42, 0.3); tray.rotation.x = -0.15; g.add(tray);
    g.add(at(box(0.26, 0.03, 0.14, mat(0xf0ece0)), -0.05, 0.44, 0.3)); // paper stack in the tray
    g.add(at(box(0.3, 0.1, 0.02, mat(0x8a867c)), 0, 0.15, 0.226)); // paper drawer
    if (dmg) for (let i = 0; i < 3; i++) { const jam = box(0.14, 0.004, 0.2, mat(0xf0ece0)); jam.position.set(-0.05 + i * 0.05, 0.69 + i * 0.01, -0.02 + i * 0.03); jam.rotation.z = 0.3 + i * 0.2; g.add(jam); }
    return g;
}

/**
 * Prop registry (classic values): { build(state), tall, hp, height, radius }.
 * tall props block shots/sight · hp = smash resistance ·
 * height = how high shots can hit it · radius = walk-around collision circle.
 */
export const PROP_BUILDERS = {
    plant:     { build: buildPlant,       tall: false, hp: 20,  height: 0.85, radius: 0.24 },
    cooler:    { build: buildCooler,      tall: false, hp: 30,  height: 0.75, radius: 0.26 },
    cabinet:   { build: buildCabinet,     tall: true,  hp: 60,  height: 0.9,  radius: 0.32 },
    crate:     { build: buildCrate,       tall: false, hp: 30,  height: 0.6,  radius: 0.34 },
    barrel:    { build: buildBarrel,      tall: false, hp: 40,  height: 0.62, radius: 0.28 },
    shelf:     { build: buildShelf,       tall: true,  hp: 60,  height: 1.15, radius: 0.38 },
    desk:      { build: buildDesk,        tall: false, hp: 40,  height: 0.72, radius: 0.42 },
    bench:     { build: buildBench,       tall: false, hp: 35,  height: 0.6,  radius: 0.4 },
    pallet:    { build: buildPallet,      tall: false, hp: 25,  height: 0.35, radius: 0.4 },
    statue:    { build: buildStatue,      tall: false, hp: 80,  height: 0.85, radius: 0.28 },
    machine:   { build: buildMachine,     tall: true,  hp: 100, height: 1.3,  radius: 0.42 },
    counter:   { build: buildCounter,     tall: false, hp: 45,  height: 0.7,  radius: 0.45 },
    sofa:      { build: buildSofa,        tall: false, hp: 40,  height: 0.6,  radius: 0.44 },
    vending:   { build: buildVending,     tall: true,  hp: 80,  height: 1.25, radius: 0.34 },
    fridge:    { build: buildFridge,      tall: true,  hp: 70,  height: 1.1,  radius: 0.32 },
    floorLamp: { build: buildFloorLamp,   tall: false, hp: 15,  height: 1.05, radius: 0.16 },
    bigTable:  { build: buildBigTable,    tall: false, hp: 40,  height: 0.5,  radius: 0.5 },
    lumber:    { build: buildLumberStack, tall: false, hp: 25,  height: 0.45, radius: 0.42 },
    copier:    { build: buildCopier,      tall: false, hp: 50,  height: 0.95, radius: 0.34 },
};
