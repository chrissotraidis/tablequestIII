/**
 * VIEWMODELS — MODERN (GOAL_LOOP M2.1)
 *
 * Sandy's five weapons rebuilt at 2007-era fidelity, still 100 % procedural.
 * Every weapon has both of Sandy's hands on it (articulated fingers,
 * fingerless work gloves, rolled khaki sleeves, a watch on the off hand),
 * and each group is baked to a handful of draw calls.
 *
 * Coordinate convention (camera space): -Z is forward, +X is screen right,
 * +Y is up. Each builder returns a Group with:
 *   userData.baseRotX  resting pitch of the weapon
 *   userData.muzzle    Vector3 where flashes/tracers start (M2.3)
 *   userData.name      weapon key
 */
import * as THREE from 'three';
import { bakeStatic } from './bake.js';

const SKIN = 0xe8b890, SKIN_DARK = 0xd4a27c;
const SLEEVE = 0x9a8560, CUFF = 0x7d6b4d, GLOVE = 0x5a4632, GLOVE_STRAP = 0x3b2d20;
const STEEL = 0x8a929c, DARK = 0x2b3038, BRASS = 0xc9a227, RUBBER = 0x1e2126;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0, ...opts });
const metal = (color, rough = 0.35) => mat(color, { roughness: rough, metalness: 0.75 });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
const sph = (r, m, w = 12, h = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** cylinder from a to b */
function bar(a, b, r1, r2, m, seg = 10) {
    const d = V(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length();
    const c = cyl(r1, r2, len, m, seg);
    c.position.copy(a).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    return c;
}

/**
 * One articulated hand + forearm.
 *   side     'R' | 'L' (mirrors thumb/knuckle layout)
 *   grip     Vector3 palm centre
 *   elbow    Vector3 where the forearm leaves frame
 *   radius   handle radius the fingers wrap
 *   axis     unit Vector3 along the handle (fingers curl around it)
 *   curl     0..1 how tightly the fingers close (0.9 = full grip)
 *   watch    put a watch on this wrist
 */
function buildHand({ side, grip, elbow, radius = 0.02, axis = V(0, 0, 1), curl = 0.9, watch = false }) {
    const g = new THREE.Group();
    const s = side === 'R' ? 1 : -1;
    const skin = mat(SKIN, { roughness: 0.55 }), skinDark = mat(SKIN_DARK, { roughness: 0.6 });
    const glove = mat(GLOVE, { roughness: 0.8 }), strap = mat(GLOVE_STRAP, { roughness: 0.7 });

    // forearm: sleeve → cuff → bare wrist
    const toGrip = V().subVectors(grip, elbow);
    const wristPt = V().copy(elbow).addScaledVector(toGrip, 0.84);
    const cuffPt = V().copy(elbow).addScaledVector(toGrip, 0.58);
    g.add(bar(elbow, cuffPt, 0.05, 0.043, mat(SLEEVE, { roughness: 0.85 }), 12));
    const cuff = bar(V().copy(elbow).addScaledVector(toGrip, 0.52), V().copy(elbow).addScaledVector(toGrip, 0.62), 0.05, 0.05, mat(CUFF, { roughness: 0.9 }), 12);
    g.add(cuff);
    g.add(bar(cuffPt, wristPt, 0.03, 0.027, skin, 12));
    if (watch) {
        const w = bar(V().copy(elbow).addScaledVector(toGrip, 0.68), V().copy(elbow).addScaledVector(toGrip, 0.73), 0.031, 0.031, mat(0x2a221a, { roughness: 0.6 }), 12);
        g.add(w);
        const face = cyl(0.014, 0.014, 0.006, metal(0xd8d0b8, 0.25), 12);
        face.position.copy(elbow).addScaledVector(toGrip, 0.705).add(V(0, 0.03, 0));
        face.rotation.x = Math.PI / 2;
        g.add(face);
    }

    // palm: a flattened sphere + glove body with an open back and a strap
    const palm = sph(0.036, skin);
    palm.scale.set(1.0, 0.72, 1.25);
    palm.position.copy(grip);
    g.add(palm);
    const gloveBody = sph(0.0375, glove);
    gloveBody.scale.set(1.02, 0.6, 1.1);
    gloveBody.position.copy(grip).add(V(0, 0.004, 0.01));
    g.add(gloveBody);
    const gloveStrap = box(0.06, 0.012, 0.022, strap);
    gloveStrap.position.copy(grip).add(V(0, 0.024, 0.03));
    g.add(gloveStrap);

    // frame for the fingers: axis along the handle, "out" is away from the palm
    const ax = axis.clone().normalize();
    const out = V().crossVectors(ax, V(s, 0, 0)).normalize();
    if (out.lengthSq() < 0.01) out.set(0, -1, 0);
    const across = V().crossVectors(out, ax).normalize(); // direction fingers are spread along

    // four fingers, two segments each, curled around the handle
    for (let i = 0; i < 4; i++) {
        const t = (i - 1.5) * 0.017;
        const base = V().copy(grip).addScaledVector(ax, t).addScaledVector(out, 0.012).addScaledVector(across, 0.028 * s);
        const r = radius + 0.012;
        const a0 = 0.15, a1 = a0 + 1.35 * curl, a2 = a1 + 1.3 * curl;
        const p = (a) => V().copy(grip).addScaledVector(ax, t).addScaledVector(out, Math.cos(a) * r).addScaledVector(across, Math.sin(a) * r * s);
        const k0 = base, k1 = p(a1 * 0.55 + 0.4), k2 = p(a2 * 0.6 + 0.5);
        g.add(bar(k0, k1, 0.0085, 0.008, skin, 8));
        g.add(bar(k1, k2, 0.0078, 0.0068, skinDark, 8));
        const knuckle = sph(0.0092, skin, 8, 6); knuckle.position.copy(k1); g.add(knuckle);
        const tip = sph(0.0072, skinDark, 8, 6); tip.position.copy(k2); g.add(tip);
        // glove finger loop (fingerless: covers only the first segment)
        const loop = bar(k0, V().lerpVectors(k0, k1, 0.55), 0.0098, 0.0092, glove, 8); g.add(loop);
    }
    // thumb over the top
    const tb = V().copy(grip).addScaledVector(across, -0.026 * s).addScaledVector(out, -0.01);
    const t1 = V().copy(tb).addScaledVector(ax, -0.022).addScaledVector(out, 0.02);
    const t2 = V().copy(t1).addScaledVector(ax, -0.016).addScaledVector(out, 0.018).addScaledVector(across, 0.008 * s);
    g.add(bar(tb, t1, 0.011, 0.0095, skin, 8));
    g.add(bar(t1, t2, 0.0092, 0.0078, skinDark, 8));
    const tk = sph(0.0105, skin, 8, 6); tk.position.copy(t1); g.add(tk);
    const tt = sph(0.008, skinDark, 8, 6); tt.position.copy(t2); g.add(tt);
    return g;
}

/**
 * ads: where vmRoot goes while aiming (camera space) and how much the
 * weapon pitches; null = the weapon cannot be aimed (melee).
 */
function finish(g, name, baseRotX, muzzle, ads = null) {
    g.userData.name = name;
    g.userData.baseRotX = baseRotX;
    g.userData.muzzle = muzzle;
    const baked = bakeStatic(g);
    baked.userData = { name, baseRotX, muzzle, ads };
    baked.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 10; } });
    return baked;
}

// ---------------------------------------------------------------- weapons

export function buildBrushViewmodel() {
    const g = new THREE.Group();
    const wood = mat(0x8a5a2e, { roughness: 0.55 });
    // handle: turned wood with a grip-tape band and a lacquered tip
    g.add((() => { const h = cyl(0.012, 0.017, 0.2, wood, 14); h.rotation.x = Math.PI / 2; h.position.z = 0.02; return h; })());
    g.add((() => { const t = cyl(0.0175, 0.0175, 0.05, mat(0x1e1a18, { roughness: 0.95 }), 14); t.rotation.x = Math.PI / 2; t.position.z = 0.045; return t; })());
    g.add((() => { const e = sph(0.0175, mat(0xb02020, { roughness: 0.4 }), 12, 8); e.position.z = 0.122; return e; })());
    // ferrule with crimp rings and a rivet
    g.add((() => { const f = cyl(0.026, 0.017, 0.055, metal(0xd8d5cc, 0.3), 14); f.rotation.x = Math.PI / 2; f.position.z = -0.105; return f; })());
    for (const z of [-0.09, -0.12]) g.add((() => { const r = cyl(0.0265, 0.0265, 0.005, metal(0x9aa0a8, 0.4), 14); r.rotation.x = Math.PI / 2; r.position.z = z; return r; })());
    g.add((() => { const rv = sph(0.004, metal(0x606870, 0.4), 6, 5); rv.position.set(0.024, 0.006, -0.105); return rv; })());
    // bristles: a fuller brush, paint-loaded at the tip
    g.add((() => { const b = cyl(0.03, 0.02, 0.06, mat(0x6b5a3a, { roughness: 0.95 }), 14); b.rotation.x = Math.PI / 2; b.position.z = -0.16; return b; })());
    g.add((() => { const p = cyl(0.03, 0.006, 0.05, mat(0x4488ff, { emissive: 0x1133aa, emissiveIntensity: 0.5, roughness: 0.3 }), 14); p.rotation.x = Math.PI / 2; p.position.z = -0.215; return p; })());
    // right hand on the handle, left hand holding a paint can down-left
    g.add(buildHand({ side: 'R', grip: V(0, -0.004, 0.045), elbow: V(0.15, -0.3, 0.3), radius: 0.016, axis: V(0, 0, 1), curl: 0.95 }));
    const can = new THREE.Group();
    can.position.set(-0.17, -0.11, -0.08);
    can.add((() => { const c = cyl(0.045, 0.045, 0.085, metal(0x8c9096, 0.45), 16); return c; })());
    can.add((() => { const rim = cyl(0.047, 0.047, 0.008, metal(0xb8bcc2, 0.35), 16); rim.position.y = 0.043; return rim; })());
    can.add((() => { const paint = cyl(0.041, 0.041, 0.006, mat(0x3a6acc, { roughness: 0.15, emissive: 0x102040, emissiveIntensity: 0.4 }), 16); paint.position.y = 0.045; return paint; })());
    can.add((() => { const lbl = cyl(0.0455, 0.0455, 0.04, mat(0xe8dfc8, { roughness: 0.7 }), 16); lbl.position.y = -0.005; return lbl; })());
    can.add((() => { const stripe = cyl(0.046, 0.046, 0.012, mat(0x2244aa, { roughness: 0.6 }), 16); stripe.position.y = -0.005; return stripe; })());
    can.add((() => { const handle = bar(V(-0.05, 0.02, 0), V(0.05, 0.02, 0), 0.004, 0.004, metal(0x9aa0a8, 0.4), 8); handle.position.y = 0.05; return handle; })());
    g.add(can);
    g.add(buildHand({ side: 'L', grip: V(-0.17, -0.055, -0.08), elbow: V(-0.34, -0.28, 0.25), radius: 0.004, axis: V(1, 0, 0), curl: 1.0, watch: true }));
    g.rotation.y = 0.18;
    g.position.set(0.05, 0.02, 0.0);
    g.scale.setScalar(0.92);
    return finish(g, 'paintbrush', -0.42, V(0, 0.0, -0.24), { pos: V(0.05, -0.1, -0.42), rotX: 0.16, rotY: -0.22 });
}

export function buildLegViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.07;
    const wood = mat(0x8a5a2c, { roughness: 0.5 }), woodDark = mat(0x6a4220, { roughness: 0.55 });
    const tilt = -Math.PI / 3;
    const along = V(0, Math.cos(tilt + Math.PI / 2) * -1, Math.sin(tilt + Math.PI / 2) * -1).normalize(); // leg direction (up-forward)
    // turned leg: shaft + decorative rings + a wider foot
    const shaft = cyl(0.02, 0.036, 0.5, wood, 16); shaft.rotation.x = tilt; shaft.position.set(0, 0.1, -0.1); inner.add(shaft);
    for (const [off, r] of [[0.06, 0.03], [0.14, 0.027], [0.21, 0.034]]) {
        const ring = cyl(r, r, 0.014, woodDark, 16);
        ring.rotation.x = tilt;
        ring.position.set(0, 0.1, -0.1).addScaledVector(along, off);
        inner.add(ring);
    }
    const foot = cyl(0.042, 0.03, 0.04, woodDark, 16); foot.rotation.x = tilt; foot.position.set(0, 0.1, -0.1).addScaledVector(along, 0.265); inner.add(foot);
    // wrapped tape grip + brass ferrule
    const gripBand = cyl(0.042, 0.042, 0.11, mat(RUBBER, { roughness: 0.95 }), 16); gripBand.rotation.x = tilt; gripBand.position.set(0, -0.06, -0.005); inner.add(gripBand);
    const tapeSeam = cyl(0.043, 0.043, 0.008, mat(0x111316, { roughness: 0.9 }), 16); tapeSeam.rotation.x = tilt; tapeSeam.position.set(0, -0.03, -0.02); inner.add(tapeSeam);
    const ferrule = cyl(0.041, 0.041, 0.02, metal(BRASS, 0.35), 16); ferrule.rotation.x = tilt; ferrule.position.set(0, -0.12, 0.03); inner.add(ferrule);
    // two-handed bat grip, right below left
    const gripAxis = V(0, Math.sin(-tilt), -Math.cos(-tilt)).normalize();
    inner.add(buildHand({ side: 'R', grip: V(0.0, -0.075, 0.01), elbow: V(0.16, -0.24, 0.2), radius: 0.04, axis: gripAxis, curl: 0.85 }));
    inner.add(buildHand({ side: 'L', grip: V(0.0, -0.02, -0.02), elbow: V(-0.18, -0.22, 0.2), radius: 0.04, axis: gripAxis, curl: 0.85, watch: true }));
    g.add(inner);
    return finish(g, 'tableLeg', 0, V(0, 0.2, -0.3));
}

export function buildNailgunViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.05;
    const orange = mat(0xe07820, { roughness: 0.45 }), body2 = mat(0xc4661a, { roughness: 0.5 });
    // body with a chamfered top, side plates, brand plate
    inner.add((() => { const b = box(0.07, 0.085, 0.2, orange); b.position.set(0, 0.02, -0.04); return b; })());
    inner.add((() => { const c = box(0.05, 0.02, 0.18, body2); c.position.set(0, 0.072, -0.04); return c; })());
    for (const sx of [-1, 1]) inner.add((() => { const p = box(0.006, 0.05, 0.12, metal(DARK, 0.45)); p.position.set(sx * 0.037, 0.02, -0.03); return p; })());
    inner.add((() => { const b = box(0.008, 0.02, 0.05, metal(0xd8d0b8, 0.3)); b.position.set(0.038, 0.035, -0.06); return b; })());
    // nose with safety contact, barrel tip
    inner.add((() => { const n = box(0.034, 0.1, 0.05, metal(STEEL, 0.4)); n.position.set(0, -0.01, -0.165); return n; })());
    inner.add((() => { const s = box(0.02, 0.03, 0.02, metal(0x444c56, 0.5)); s.position.set(0, -0.055, -0.185); return s; })());
    inner.add((() => { const t = cyl(0.008, 0.008, 0.05, metal(0x444c56, 0.4), 10); t.rotation.x = Math.PI / 2; t.position.set(0, 0.012, -0.215); return t; })());
    // slanted nail strip magazine with visible nail heads
    inner.add((() => { const m = box(0.03, 0.07, 0.17, metal(0x39404a, 0.5)); m.position.set(0, -0.045, -0.02); m.rotation.x = -0.5; return m; })());
    for (let i = 0; i < 6; i++) inner.add((() => { const n = cyl(0.004, 0.004, 0.032, metal(0xc8ccd4, 0.3), 6); n.rotation.z = Math.PI / 2; n.position.set(0, -0.04 - i * 0.012, 0.02 - i * 0.018); return n; })());
    // air hose fitting + hose curling out of frame
    inner.add((() => { const f = cyl(0.01, 0.01, 0.03, metal(BRASS, 0.3), 10); f.rotation.x = Math.PI / 2; f.position.set(0, -0.005, 0.07); return f; })());
    inner.add(bar(V(0, -0.005, 0.085), V(0.06, -0.09, 0.22), 0.009, 0.009, mat(0x202428, { roughness: 0.8 }), 8));
    // grip + trigger + guard
    inner.add((() => { const gs = box(0.034, 0.09, 0.05, mat(DARK, { roughness: 0.85 })); gs.position.set(0, -0.05, 0.06); gs.rotation.x = 0.3; return gs; })());
    inner.add((() => { const tr = box(0.008, 0.028, 0.008, metal(0x9aa0a8, 0.4)); tr.position.set(0, -0.035, 0.02); tr.rotation.x = 0.3; return tr; })());
    inner.add(bar(V(0, -0.075, 0.0), V(0, -0.075, 0.045), 0.003, 0.003, metal(DARK, 0.5), 6));
    inner.add(buildHand({ side: 'R', grip: V(0, -0.055, 0.065), elbow: V(0.16, -0.28, 0.28), radius: 0.02, axis: V(0, 1, 0.3).normalize(), curl: 0.95 }));
    // off hand cupped under the nose
    inner.add(buildHand({ side: 'L', grip: V(-0.02, -0.06, -0.13), elbow: V(-0.26, -0.28, 0.2), radius: 0.03, axis: V(0, 0, 1), curl: 0.6, watch: true }));
    g.add(inner);
    return finish(g, 'nailgun', 0, V(0, 0.06, -0.25), { pos: V(0.0, -0.165, -0.48), rotX: 0.0, rotY: 0.0 });
}

export function buildRollerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.06;
    const tubeM = metal(0x4a525c, 0.45);
    // fat launcher tube with reinforcing rings and a muzzle collar
    inner.add((() => { const t = cyl(0.055, 0.06, 0.3, tubeM, 18); t.rotation.x = Math.PI / 2; t.position.set(0, 0.02, -0.07); return t; })());
    for (const z of [-0.0, -0.09, -0.16]) inner.add((() => { const r = cyl(0.063, 0.063, 0.012, metal(0x363c44, 0.5), 18); r.rotation.x = Math.PI / 2; r.position.set(0, 0.02, z); return r; })());
    inner.add((() => { const c = cyl(0.068, 0.068, 0.04, metal(BRASS, 0.3), 18); c.rotation.x = Math.PI / 2; c.position.set(0, 0.02, -0.215); return c; })());
    // loaded roller peeking out, nap texture implied by a second ring
    inner.add((() => { const r = cyl(0.042, 0.042, 0.09, mat(0xffaa22, { emissive: 0x664400, emissiveIntensity: 0.5, roughness: 0.9 }), 18); r.rotation.x = Math.PI / 2; r.position.set(0, 0.02, -0.255); return r; })());
    inner.add((() => { const cap = cyl(0.03, 0.03, 0.01, metal(0x9aa0a8, 0.4), 12); cap.rotation.x = Math.PI / 2; cap.position.set(0, 0.02, -0.302); return cap; })());
    // pressure tank with straps + gauge + hose
    inner.add((() => { const t = cyl(0.035, 0.035, 0.11, mat(0xcc3322, { roughness: 0.4 }), 14); t.rotation.x = Math.PI / 2; t.position.set(0, -0.045, 0.02); return t; })());
    for (const z of [-0.01, 0.05]) inner.add((() => { const s = cyl(0.037, 0.037, 0.01, mat(0x202428, { roughness: 0.8 }), 14); s.rotation.x = Math.PI / 2; s.position.set(0, -0.045, z); return s; })());
    inner.add((() => { const gauge = cyl(0.014, 0.014, 0.01, metal(0xd8d0b8, 0.25), 12); gauge.rotation.z = Math.PI / 2; gauge.position.set(0.04, -0.03, 0.0); return gauge; })());
    inner.add(bar(V(0.0, -0.045, 0.08), V(0.07, -0.12, 0.22), 0.008, 0.008, mat(0x202428, { roughness: 0.8 }), 8));
    // grip + trigger
    inner.add((() => { const gs = box(0.034, 0.09, 0.05, mat(DARK, { roughness: 0.85 })); gs.position.set(0, -0.06, 0.08); gs.rotation.x = 0.3; return gs; })());
    inner.add((() => { const tr = box(0.008, 0.026, 0.008, metal(0x9aa0a8, 0.4)); tr.position.set(0, -0.045, 0.045); tr.rotation.x = 0.3; return tr; })());
    inner.add(buildHand({ side: 'R', grip: V(0, -0.065, 0.085), elbow: V(0.16, -0.28, 0.29), radius: 0.02, axis: V(0, 1, 0.3).normalize(), curl: 0.95 }));
    inner.add(buildHand({ side: 'L', grip: V(-0.01, -0.03, -0.13), elbow: V(-0.26, -0.28, 0.2), radius: 0.056, axis: V(0, 0, 1), curl: 0.75, watch: true }));
    g.add(inner);
    return finish(g, 'roller', 0, V(0, 0.08, -0.31), { pos: V(0.045, -0.19, -0.52), rotX: 0.0, rotY: 0.0 });
}

export function buildSprayerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.06;
    // industrial tank with straps and a fill cap, barrel with a heat shroud
    inner.add((() => { const t = cyl(0.05, 0.05, 0.15, mat(0xcc3322, { roughness: 0.4 }), 16); t.rotation.x = Math.PI / 2; t.position.set(0, 0.02, 0.02); return t; })());
    for (const z of [-0.03, 0.06]) inner.add((() => { const s = cyl(0.052, 0.052, 0.012, mat(0x202428, { roughness: 0.8 }), 16); s.rotation.x = Math.PI / 2; s.position.set(0, 0.02, z); return s; })());
    inner.add((() => { const cap = cyl(0.014, 0.014, 0.012, metal(BRASS, 0.3), 10); cap.position.set(0, 0.075, 0.04); return cap; })());
    inner.add((() => { const b = cyl(0.014, 0.02, 0.2, metal(0x333a44, 0.4), 12); b.rotation.x = Math.PI / 2; b.position.set(0, 0.05, -0.12); return b; })());
    inner.add((() => { const sh = cyl(0.024, 0.024, 0.09, metal(0x2a3038, 0.5), 12); sh.rotation.x = Math.PI / 2; sh.position.set(0, 0.05, -0.1); return sh; })());
    for (let i = 0; i < 4; i++) inner.add((() => { const hole = cyl(0.0245, 0.0245, 0.006, mat(0x0c0e12), 12); hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.05, -0.07 - i * 0.02); return hole; })());
    inner.add((() => { const tip = cyl(0.024, 0.014, 0.03, mat(0x88ff66, { emissive: 0x226611, emissiveIntensity: 0.6, roughness: 0.3 }), 12); tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.05, -0.23); return tip; })());
    inner.add((() => { const guard = cyl(0.03, 0.03, 0.008, metal(0x9aa0a8, 0.4), 12); guard.rotation.x = Math.PI / 2; guard.position.set(0, 0.05, -0.212); return guard; })());
    // hose from tank to grip
    inner.add(bar(V(0.03, -0.02, 0.06), V(0.08, -0.1, 0.22), 0.008, 0.008, mat(0x202428, { roughness: 0.8 }), 8));
    // grip + trigger
    inner.add((() => { const gs = box(0.032, 0.085, 0.045, mat(DARK, { roughness: 0.85 })); gs.position.set(0, -0.04, 0.055); gs.rotation.x = 0.25; return gs; })());
    inner.add((() => { const tr = box(0.008, 0.026, 0.008, metal(0x9aa0a8, 0.4)); tr.position.set(0, -0.025, 0.02); tr.rotation.x = 0.25; return tr; })());
    inner.add(buildHand({ side: 'R', grip: V(0, -0.05, 0.06), elbow: V(0.16, -0.27, 0.28), radius: 0.02, axis: V(0, 1, 0.25).normalize(), curl: 0.95 }));
    inner.add(buildHand({ side: 'L', grip: V(-0.015, 0.02, -0.09), elbow: V(-0.26, -0.27, 0.22), radius: 0.024, axis: V(0, 0, 1), curl: 0.9, watch: true }));
    g.add(inner);
    return finish(g, 'sprayer', 0, V(0, 0.11, -0.25), { pos: V(0.0, -0.175, -0.48), rotX: 0.0, rotY: 0.0 });
}

export function buildViewmodels() {
    return {
        paintbrush: buildBrushViewmodel(),
        tableLeg: buildLegViewmodel(),
        sprayer: buildSprayerViewmodel(),
        nailgun: buildNailgunViewmodel(),
        roller: buildRollerViewmodel(),
    };
}
