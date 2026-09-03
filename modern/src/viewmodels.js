/**
 * VIEWMODELS — MODERN (Round 2, R3/R4; supersedes the M2.1 set)
 *
 * Sandy's five tools and both of her hands, all procedural, at a fidelity a
 * 2007 shooter would ship:
 *   hands   capsule limbs with an elbow, a rolled sleeve with folds and a
 *           double-rolled cuff, a bare forearm with a wrist bone, three-segment
 *           fingers with knuckles and nails, a thumb on its mound, a padded
 *           fingerless work glove with a strap, buckle and stitching, a watch
 *           on the off hand; form shading is baked into vertex colours
 *   tools   turned wood (lathe profiles with a grain map), brushed metal,
 *           decal labels, rubber overmoulds, hoses, gauges, straps
 *   parts   pieces that animate stay separate: `trigger` (index finger),
 *           `offHand` (support hand), `head` (brush head) — game.js drives them
 *
 * Coordinate convention (camera space): -Z forward, +X screen right, +Y up.
 * Each builder returns a baked Group with userData { name, baseRotX, muzzle,
 * ads, parts }.
 */
import * as THREE from 'three';
import { bakeStatic } from './bake.js';

const SKIN = 0xe9b993, SKIN_DARK = 0xd39f7a, SLEEVE = 0x9a8560, SLEEVE_DARK = 0x84714f, CUFF = 0x7d6b4d;
const GLOVE = 0x5a4632, GLOVE_PAD = 0x3f3124, GLOVE_STRAP = 0x3b2d20, THREAD = 0xc8b48a, NAIL = 0xf6e0cc;
const STEEL = 0x8a929c, DARK = 0x2b3038, BRASS = 0xc9a227, RUBBER = 0x1e2126;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0, ...opts });
const metal = (color, rough = 0.35) => mat(color, { roughness: rough, metalness: 0.75 });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
const sph = (r, m, w = 12, h = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };
const alongZ = (mesh) => { mesh.rotation.x = Math.PI / 2; return mesh; };

/** cylinder from a to b */
function bar(a, b, r1, r2, m, seg = 10) {
    const d = V(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length();
    const c = cyl(r1, r2, len, m, seg);
    c.position.copy(a).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    return c;
}
/** tapered limb a→b with round joints at both ends */
function limb(a, b, r1, r2, m, seg = 12) {
    const g = new THREE.Group();
    g.add(bar(a, b, r2, r1, m, seg));
    const ca = sph(r1, m, seg, 8); ca.position.copy(a); g.add(ca);
    const cb = sph(r2, m, seg, 8); cb.position.copy(b); g.add(cb);
    return g;
}
/** a ring around the a→b axis at fraction t */
function ring(a, b, t, r, h, m, seg = 14) {
    const d = V().subVectors(b, a); const p = V().copy(a).addScaledVector(d, t);
    const c = cyl(r, r, h, m, seg); c.position.copy(p); c.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    return c;
}
/** lathe a profile [[radius, y], ...] around Y */
function lathe(profile, m, seg = 18) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m);
}

// ---------------------------------------------------------------- procedural textures

function canvasTex(w, h, draw, repeat = [1, 1]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 4;
    return t;
}
let _wood = null, _woodDark = null, _brushed = null, _tape = null, _nap = null;
function woodTex(dark = false) {
    if (dark ? _woodDark : _wood) return dark ? _woodDark : _wood;
    const t = canvasTex(256, 128, (ctx, w, h) => {
        ctx.fillStyle = dark ? '#6a4220' : '#8f5f30'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
            const y = (i / 70) * h + Math.sin(i * 1.7) * 3;
            ctx.strokeStyle = `rgba(${dark ? '40,22,8' : '70,40,16'},${0.18 + (i % 3) * 0.1})`; ctx.lineWidth = 0.8 + (i % 4) * 0.35;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.045 + i) * 2.2 + Math.sin(x * 0.011 + i * 3) * 4);
            ctx.stroke();
        }
        for (let k = 0; k < 3; k++) { // knots
            const kx = 40 + k * 90, ky = 30 + (k % 2) * 60;
            for (let r = 12; r > 1; r -= 2) { ctx.strokeStyle = `rgba(50,28,10,${0.25})`; ctx.beginPath(); ctx.ellipse(kx, ky, r * 1.6, r, 0.3, 0, 7); ctx.stroke(); }
        }
        ctx.fillStyle = 'rgba(255,220,160,0.06)'; for (let i = 0; i < 200; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    }, [2, 1]);
    if (dark) _woodDark = t; else _wood = t;
    return t;
}
function brushedTex() {
    return _brushed || (_brushed = canvasTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#9aa2aa'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) { const y = Math.random() * h; ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,44,50'},${0.05 + Math.random() * 0.12})`; ctx.fillRect(Math.random() * w, y, 8 + Math.random() * 30, 1); }
    }, [3, 1]));
}
function tapeTex() {
    return _tape || (_tape = canvasTex(64, 64, (ctx, w, h) => {
        ctx.fillStyle = '#1e2126'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
        for (let i = -h; i < w + h; i += 9) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); }
    }, [6, 2]));
}
function napTex() {
    return _nap || (_nap = canvasTex(64, 64, (ctx, w, h) => {
        ctx.fillStyle = '#e8a030'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,200,90' : '150,80,10'},${0.3})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 2); }
    }, [4, 2]));
}
function labelTex(lines, bg = '#e8dfc8', fg = '#1a1a1a', accent = '#b02020') {
    return canvasTex(256, 128, (ctx, w, h) => {
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = accent; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 10, w, 10);
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => { ctx.font = `${i === 0 ? 'bold 34px' : '18px'} "Arial Narrow", Impact, sans-serif`; ctx.fillText(l, w / 2, 34 + i * 30); });
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(6, 18, w - 12, h - 32);
    });
}
const texMat = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.0, ...opts });

// ---------------------------------------------------------------- form shading

/** bake soft directional shading into vertex colours (skips textured meshes) */
function shadeGroup(group, light = V(0.35, 1, 0.55), lo = 0.74) {
    group.updateMatrixWorld(true);
    const L = light.clone().normalize();
    const nm = new THREE.Matrix3(), v = new THREE.Vector3();
    group.traverse(o => {
        if (!o.isMesh || !o.material.isMeshStandardMaterial || o.material.map) return;
        const g = o.geometry = o.geometry.clone();
        const nrm = g.attributes.normal; if (!nrm) return;
        nm.getNormalMatrix(o.matrixWorld);
        const cols = new Float32Array(nrm.count * 3);
        for (let i = 0; i < nrm.count; i++) {
            v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
            const k = lo + (1 - lo) * (0.5 + 0.5 * v.dot(L));
            cols[i * 3] = k; cols[i * 3 + 1] = k; cols[i * 3 + 2] = k;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        o.material = o.material.clone(); o.material.vertexColors = true;
    });
}

// ---------------------------------------------------------------- hands

/**
 * One articulated arm + hand.
 *   side     'R' | 'L'
 *   grip     palm centre        elbow  where the forearm bends (off-screen-ish)
 *   radius   handle radius the fingers wrap     axis  unit vector along the handle
 *   curl     0..1 grip tightness   watch  wrist watch   trigger  Vector3 the index finger reaches for (becomes an animated part)
 * Returns { group, trigger }.
 */
function buildHand({ side, grip, elbow, radius = 0.02, axis = V(0, 0, 1), curl = 0.9, watch = false, trigger = null, spread = 1 }) {
    const g = new THREE.Group();
    const s = side === 'R' ? 1 : -1;
    const skin = mat(SKIN, { roughness: 0.5 }), skinDark = mat(SKIN_DARK, { roughness: 0.55 });
    const glove = mat(GLOVE, { roughness: 0.85 }), pad = mat(GLOVE_PAD, { roughness: 0.9 }), strapM = mat(GLOVE_STRAP, { roughness: 0.75 });
    const thread = mat(THREAD, { roughness: 0.8 }), nailM = mat(NAIL, { roughness: 0.3 });
    const sleeve = mat(SLEEVE, { roughness: 0.9 }), sleeveDark = mat(SLEEVE_DARK, { roughness: 0.9 }), cuffM = mat(CUFF, { roughness: 0.9 });

    // ---- arm: shoulder stub → elbow → cuff → forearm → wrist
    elbow = elbow.clone().add(V(0.03 * s, -0.07, -0.05)); // R3.1: elbows sit lower and further back so forearms read at a natural size
    const toGrip = V().subVectors(grip, elbow);
    const dir = toGrip.clone().normalize();
    const wrist = V().copy(elbow).addScaledVector(toGrip, 0.86);
    const shoulder = V().copy(elbow).addScaledVector(dir, -0.2).add(V(s * 0.05, -0.05, 0.08));
    g.add(limb(shoulder, elbow, 0.05, 0.045, sleeve));
    const cuffEnd = V().copy(elbow).addScaledVector(toGrip, 0.56);
    g.add(limb(elbow, cuffEnd, 0.045, 0.039, sleeve));
    for (const t of [0.12, 0.27, 0.41]) g.add(ring(elbow, cuffEnd, t, 0.0435 - t * 0.008, 0.005, sleeveDark)); // folds
    g.add(ring(elbow, grip, 0.50, 0.046, 0.024, cuffM, 16)); // rolled cuff
    g.add(ring(elbow, grip, 0.555, 0.043, 0.012, cuffM, 16)); // second roll
    g.add(limb(cuffEnd, wrist, 0.031, 0.026, skin));
    const ax = axis.clone().normalize();
    let out = V().crossVectors(ax, V(s, 0, 0)).normalize();
    if (out.lengthSq() < 0.01) out.set(0, -1, 0);
    const across = V().crossVectors(out, ax).normalize();
    const bone = sph(0.0085, skinDark, 8, 6); bone.position.copy(wrist).addScaledVector(across, 0.022 * s).addScaledVector(out, -0.012); g.add(bone);
    if (watch) {
        g.add(ring(elbow, grip, 0.705, 0.03, 0.014, mat(0x2a221a, { roughness: 0.6 }), 14));
        g.add(ring(elbow, grip, 0.705, 0.031, 0.004, metal(0x8a8070, 0.4), 14));
        const face = cyl(0.015, 0.015, 0.006, metal(0xd8d0b8, 0.25), 14);
        face.position.copy(elbow).addScaledVector(toGrip, 0.705).addScaledVector(out, -0.027);
        face.quaternion.setFromUnitVectors(UP, out.clone().negate()); g.add(face);
        const crown = cyl(0.003, 0.003, 0.006, metal(0x9aa0a8, 0.3), 6); crown.position.copy(face.position).addScaledVector(across, 0.016 * s); crown.quaternion.setFromUnitVectors(UP, across.clone().multiplyScalar(s)); g.add(crown);
    }

    // ---- palm, heel, glove body, pad, strap, buckle, stitching, knuckle ridge
    const palm = sph(0.036, skin); palm.scale.set(1.0, 0.56, 1.3); palm.position.copy(grip); palm.quaternion.setFromUnitVectors(UP, out); g.add(palm);
    const heel = sph(0.027, skin, 10, 8); heel.position.copy(grip).addScaledVector(ax, -0.022).addScaledVector(out, 0.004); g.add(heel);
    const gloveBody = sph(0.0385, glove); gloveBody.scale.set(1.03, 0.5, 1.18); gloveBody.position.copy(grip).addScaledVector(out, -0.009); gloveBody.quaternion.setFromUnitVectors(UP, out); g.add(gloveBody);
    const padM = sph(0.03, pad, 10, 8); padM.scale.set(1.05, 0.3, 1.2); padM.position.copy(grip).addScaledVector(out, 0.021); padM.quaternion.setFromUnitVectors(UP, out); g.add(padM);
    const strap = box(0.066, 0.011, 0.02, strapM); strap.position.copy(grip).addScaledVector(out, -0.03).addScaledVector(ax, 0.018); strap.quaternion.setFromUnitVectors(V(1, 0, 0), across.clone().multiplyScalar(s)); g.add(strap);
    const buckle = box(0.012, 0.014, 0.007, metal(0x9aa0a8, 0.4)); buckle.position.copy(strap.position).addScaledVector(across, 0.03 * s); buckle.quaternion.copy(strap.quaternion); g.add(buckle);
    for (const dz of [-0.008, 0.008]) { const st = box(0.06, 0.0025, 0.0025, thread); st.position.copy(strap.position).addScaledVector(ax, dz).addScaledVector(out, -0.006); st.quaternion.copy(strap.quaternion); g.add(st); }
    for (let i = 0; i < 4; i++) { const t = (i - 1.5) * 0.0165 * spread; const k = sph(0.0105, skin, 8, 6); k.position.copy(grip).addScaledVector(ax, t).addScaledVector(out, 0.008).addScaledVector(across, 0.03 * s); g.add(k); }

    // ---- fingers: three segments, knuckles, nails, glove loops
    const fingerSegs = (parent, k0, k1, k2, k3, gloved = true) => {
        parent.add(limb(k0, k1, 0.0093, 0.0086, skin, 9));
        parent.add(limb(k1, k2, 0.0084, 0.0076, skin, 9));
        parent.add(limb(k2, k3, 0.0074, 0.0064, skinDark, 9));
        const kn1 = sph(0.0097, skin, 8, 6); kn1.position.copy(k1); parent.add(kn1);
        const kn2 = sph(0.0085, skinDark, 8, 6); kn2.position.copy(k2); parent.add(kn2);
        const segDir = V().subVectors(k3, k2).normalize();
        const back = V().subVectors(k3, V().lerpVectors(k0, k3, 0.5)).normalize(); // roughly outward from the curl
        const nail = box(0.0085, 0.0022, 0.009, nailM); nail.position.copy(k3).addScaledVector(back, 0.004).addScaledVector(segDir, 0.002);
        nail.quaternion.setFromUnitVectors(V(0, 0, 1), segDir); parent.add(nail);
        if (gloved) { parent.add(bar(k0, V().lerpVectors(k0, k1, 0.62), 0.0106, 0.0099, glove, 9)); parent.add(ring(k0, k1, 0.58, 0.0108, 0.0025, thread, 9)); }
    };
    let triggerPart = null;
    for (let i = 0; i < 4; i++) {
        const t = (i - 1.5) * 0.0165 * spread;
        const base = V().copy(grip).addScaledVector(ax, t).addScaledVector(out, 0.012).addScaledVector(across, 0.03 * s);
        if (i === 0 && trigger) {
            // index finger reaches for the trigger; it lives in its own pivot group so it can squeeze
            const tf = new THREE.Group(); tf.position.copy(base);
            const d = V().subVectors(trigger, base).normalize();
            const inward = out.clone().negate();
            const k1 = V().copy(d).multiplyScalar(0.027);
            const k2 = V().copy(k1).addScaledVector(d, 0.019).addScaledVector(inward, 0.004);
            const k3 = V().copy(k2).addScaledVector(d, 0.013).addScaledVector(inward, 0.006);
            fingerSegs(tf, V(0, 0, 0), k1, k2, k3);
            g.add(tf); triggerPart = tf;
            continue;
        }
        const r = radius + 0.012;
        const a0 = 0.15, a1 = a0 + 1.15 * curl, a2 = a1 + 1.05 * curl, a3 = a2 + 0.9 * curl;
        const p = (a) => V().copy(grip).addScaledVector(ax, t).addScaledVector(out, Math.cos(a) * r).addScaledVector(across, Math.sin(a) * r * s);
        fingerSegs(g, base, p(a1 * 0.5 + 0.35), p(a2 * 0.55 + 0.45), p(a3 * 0.6 + 0.5));
    }
    // ---- thumb on its mound
    const tb = V().copy(grip).addScaledVector(across, -0.026 * s).addScaledVector(out, -0.008);
    const mound = sph(0.017, skin, 10, 8); mound.position.copy(tb).addScaledVector(ax, -0.006); g.add(mound);
    const t1 = V().copy(tb).addScaledVector(ax, -0.021).addScaledVector(out, 0.021);
    const t2 = V().copy(t1).addScaledVector(ax, -0.015).addScaledVector(out, 0.019).addScaledVector(across, 0.009 * s);
    g.add(limb(tb, t1, 0.0118, 0.0098, skin, 9));
    g.add(limb(t1, t2, 0.0094, 0.0078, skinDark, 9));
    const tn = box(0.009, 0.0022, 0.01, nailM); tn.position.copy(t2).addScaledVector(out, 0.005); tn.quaternion.setFromUnitVectors(V(0, 0, 1), V().subVectors(t2, t1).normalize()); g.add(tn);
    g.add(bar(tb, V().lerpVectors(tb, t1, 0.55), 0.0128, 0.0112, glove, 9));

    shadeGroup(g, V(0.35 * s, 1, 0.55));
    return { group: g, trigger: triggerPart };
}

// ---------------------------------------------------------------- finish: bake with animated parts kept separate

function finish(g, name, baseRotX, muzzle, ads = null, parts = {}) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const bakedParts = {};
    for (const [k, part] of Object.entries(parts)) {
        if (!part) continue;
        const rel = new THREE.Matrix4().multiplyMatrices(inv, part.matrixWorld);
        part.parent.remove(part);
        part.position.set(0, 0, 0); part.rotation.set(0, 0, 0); part.scale.setScalar(1);
        const bp = bakeStatic(part, { quantize: 0.5 });
        rel.decompose(bp.position, bp.quaternion, bp.scale);
        bp.userData.rest = { x: bp.rotation.x, y: bp.rotation.y, z: bp.rotation.z, px: bp.position.x, py: bp.position.y, pz: bp.position.z };
        bakedParts[k] = bp;
    }
    const baked = bakeStatic(g, { quantize: 0.5 });
    for (const bp of Object.values(bakedParts)) baked.add(bp);
    baked.userData = { name, baseRotX, muzzle, ads, parts: bakedParts };
    baked.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 10; } });
    return baked;
}

// ---------------------------------------------------------------- weapons

export function buildBrushViewmodel() {
    const g = new THREE.Group();
    const wood = texMat(woodTex(), { roughness: 0.45 });
    // turned handle (lathe) along -Z: profile radius vs length
    const handle = lathe([[0.006, -0.11], [0.013, -0.09], [0.017, -0.05], [0.0165, 0.0], [0.014, 0.05], [0.017, 0.08], [0.0125, 0.105], [0.0, 0.112]], wood, 18);
    handle.rotation.x = -Math.PI / 2; handle.position.z = 0.0; g.add(handle);
    // grip tape band + lacquered red tip
    const band = alongZ(cyl(0.0178, 0.0178, 0.045, texMat(tapeTex(), { roughness: 0.95 }), 16)); band.position.z = 0.055; g.add(band);
    const tip = sph(0.0165, mat(0xb02020, { roughness: 0.3 }), 14, 10); tip.position.z = 0.118; g.add(tip);
    // brand label wrapped on the handle
    const label = alongZ(cyl(0.0172, 0.0172, 0.036, texMat(labelTex(['ARTISAN', 'No. 7 · OAK'], '#efe6d2', '#2a1a10', '#8a1422'), { roughness: 0.5 }), 16)); label.position.z = -0.03; g.add(label);
    // brush head: ferrule with crimp rings and rivets, bristle tufts, paint-loaded tips and a drip — its own part (wrist flick)
    const head = new THREE.Group(); head.position.z = -0.1;
    const ferrule = alongZ(cyl(0.027, 0.018, 0.06, texMat(brushedTex(), { roughness: 0.3, metalness: 0.8 }), 16)); ferrule.position.z = -0.01; head.add(ferrule);
    for (const z of [0.005, -0.02]) { const r = alongZ(cyl(0.0275, 0.0275, 0.005, metal(0x9aa0a8, 0.4), 16)); r.position.z = z; head.add(r); }
    for (const sx of [-1, 1]) { const rv = sph(0.0035, metal(0x606870, 0.4), 6, 5); rv.position.set(sx * 0.024, 0.008, 0.0); head.add(rv); }
    const bristle = mat(0x6b5a3a, { roughness: 0.95 }), bristleDark = mat(0x4f4229, { roughness: 0.95 });
    for (let i = 0; i < 16; i++) { // fanned tufts
        const a = (i / 16) * Math.PI * 2, rr = 0.009 + (i % 3) * 0.006;
        const x0 = Math.cos(a) * rr, y0 = Math.sin(a) * rr;
        const tuft = bar(V(x0, y0, -0.04), V(x0 * 1.9, y0 * 1.9 - 0.006, -0.105), 0.0045, 0.0025, i % 2 ? bristle : bristleDark, 6);
        head.add(tuft);
    }
    const paint = alongZ(cyl(0.026, 0.008, 0.045, mat(0x4488ff, { emissive: 0x1133aa, emissiveIntensity: 0.5, roughness: 0.25 }), 14)); paint.position.set(0, -0.004, -0.115); head.add(paint);
    const drip = sph(0.0055, mat(0x4488ff, { emissive: 0x1133aa, emissiveIntensity: 0.5, roughness: 0.2 }), 8, 6); drip.scale.set(1, 1.6, 1); drip.position.set(0.006, -0.028, -0.1); head.add(drip);
    g.add(head);
    // right hand on the handle; off hand carries the paint can (its own part: it fidgets and tops up)
    const R = buildHand({ side: 'R', grip: V(0, -0.004, 0.045), elbow: V(0.16, -0.31, 0.32), radius: 0.016, axis: V(0, 0, 1), curl: 0.95 });
    g.add(R.group);
    const off = new THREE.Group(); off.position.set(-0.17, -0.11, -0.08);
    const can = new THREE.Group();
    can.add(cyl(0.045, 0.045, 0.085, texMat(brushedTex(), { roughness: 0.45, metalness: 0.7 }), 18));
    can.add(at(cyl(0.047, 0.047, 0.008, metal(0xb8bcc2, 0.35), 18), 0, 0.043, 0));
    can.add(at(cyl(0.041, 0.041, 0.006, mat(0x3a6acc, { roughness: 0.12, emissive: 0x102040, emissiveIntensity: 0.4 }), 18), 0, 0.045, 0));
    can.add(at(cyl(0.0458, 0.0458, 0.05, texMat(labelTex(["SANDY'S", 'SOLID OAK STAIN'], '#e8dfc8', '#1a1a1a', '#2244aa'), { roughness: 0.7 }), 18), 0, -0.005, 0));
    const wire = bar(V(-0.048, 0.048, 0), V(0.048, 0.048, 0), 0.0035, 0.0035, metal(0x9aa0a8, 0.4), 8); can.add(wire);
    off.add(can);
    const L = buildHand({ side: 'L', grip: V(0, 0.055, 0), elbow: V(-0.17, -0.17, 0.33), radius: 0.004, axis: V(1, 0, 0), curl: 1.0, watch: true });
    off.add(L.group);
    g.add(off);
    g.rotation.y = 0.18; g.position.set(0.05, 0.02, 0.0); g.scale.setScalar(0.92);
    return finish(g, 'paintbrush', -0.42, V(0, 0.0, -0.24), { pos: V(0.05, -0.04, -0.42), rotX: 0.16, rotY: -0.22 }, { head, offHand: off });
}

export function buildLegViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.07;
    const wood = texMat(woodTex(), { roughness: 0.5 }), woodDark = texMat(woodTex(true), { roughness: 0.55 });
    const tilt = -Math.PI / 3;
    const along = V(0, Math.cos(tilt + Math.PI / 2) * -1, Math.sin(tilt + Math.PI / 2) * -1).normalize();
    // turned leg profile (lathe): foot, beads, taper, top block
    const leg = lathe([[0.0, -0.02], [0.03, -0.02], [0.036, 0.0], [0.03, 0.03], [0.026, 0.06], [0.034, 0.08], [0.026, 0.1], [0.02, 0.2], [0.024, 0.3], [0.03, 0.42], [0.036, 0.5], [0.036, 0.54], [0.0, 0.54]], wood, 18);
    leg.rotation.x = tilt; leg.position.set(0, 0.1, -0.1).addScaledVector(along, -0.02); inner.add(leg);
    const foot = cyl(0.04, 0.032, 0.02, woodDark, 16); foot.rotation.x = tilt; foot.position.set(0, 0.1, -0.1).addScaledVector(along, 0.26); inner.add(foot);
    // bent nails at the top block, scuffs and a split
    for (let i = 0; i < 3; i++) {
        const base = V(0.02 - i * 0.02, 0.1, -0.1).addScaledVector(along, -0.06 + i * 0.012);
        const n1 = V().copy(base).add(V(0.01 * (i % 2 ? 1 : -1), 0.02, -0.01)), n2 = V().copy(n1).add(V(0.012, 0.006, -0.008));
        inner.add(bar(base, n1, 0.0025, 0.002, metal(0x9aa0a8, 0.5), 6)); inner.add(bar(n1, n2, 0.002, 0.0015, metal(0x8a929c, 0.5), 6));
        const hd = sph(0.0035, metal(0x9aa0a8, 0.4), 6, 5); hd.position.copy(n2); inner.add(hd);
    }
    for (let i = 0; i < 4; i++) { const sc = box(0.012, 0.004, 0.02, mat(0x4a2e14, { roughness: 0.9 })); sc.position.set(0.02 * Math.cos(i * 1.7), 0.1, -0.1).addScaledVector(along, 0.05 + i * 0.045); sc.rotation.x = tilt; inner.add(sc); }
    // grip tape + brass ferrule
    const gripBand = cyl(0.041, 0.041, 0.11, texMat(tapeTex(), { roughness: 0.95 }), 16); gripBand.rotation.x = tilt; gripBand.position.set(0, -0.06, -0.005); inner.add(gripBand);
    const seam = cyl(0.042, 0.042, 0.008, mat(0x111316, { roughness: 0.9 }), 16); seam.rotation.x = tilt; seam.position.set(0, -0.03, -0.02); inner.add(seam);
    const ferrule = cyl(0.041, 0.041, 0.02, metal(BRASS, 0.35), 16); ferrule.rotation.x = tilt; ferrule.position.set(0, -0.12, 0.03); inner.add(ferrule);
    const gripAxis = V(0, Math.sin(-tilt), -Math.cos(-tilt)).normalize();
    inner.add(buildHand({ side: 'R', grip: V(0.0, -0.075, 0.01), elbow: V(0.17, -0.27, 0.22), radius: 0.04, axis: gripAxis, curl: 0.85 }).group);
    inner.add(buildHand({ side: 'L', grip: V(0.0, -0.02, -0.02), elbow: V(-0.19, -0.25, 0.22), radius: 0.04, axis: gripAxis, curl: 0.85, watch: true }).group);
    g.add(inner);
    g.scale.setScalar(0.55); g.position.set(0.06, 0.1, 0.0);
    return finish(g, 'tableLeg', 0, V(0, 0.2, -0.3));
}

export function buildNailgunViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.05;
    const orange = mat(0xe07820, { roughness: 0.42 }), body2 = mat(0xc4661a, { roughness: 0.5 }), rubber = mat(RUBBER, { roughness: 0.92 });
    const brushed = texMat(brushedTex(), { roughness: 0.35, metalness: 0.8 });
    // body with a chamfered top, side plates, exhaust cap, depth dial, brand decal
    inner.add(at(box(0.07, 0.085, 0.2, orange), 0, 0.02, -0.04));
    inner.add(at(box(0.05, 0.02, 0.18, body2), 0, 0.072, -0.04));
    inner.add(at(box(0.064, 0.012, 0.16, body2), 0, -0.028, -0.03));
    for (const sx of [-1, 1]) { inner.add(at(box(0.006, 0.05, 0.12, brushed), sx * 0.037, 0.02, -0.03)); for (let i = 0; i < 4; i++) { const sc = sph(0.003, metal(0x444c56, 0.4), 6, 5); sc.position.set(sx * 0.041, 0.038 - i * 0.012 * (i % 2 ? 1 : 3) * 0.3, -0.08 + i * 0.03); inner.add(sc); } }
    inner.add(at(cyl(0.016, 0.016, 0.02, metal(0x444c56, 0.45), 12), 0, 0.09, -0.02)); // exhaust cap
    inner.add(at(cyl(0.018, 0.018, 0.004, metal(0x2a3038, 0.5), 12), 0, 0.101, -0.02));
    const dial = cyl(0.011, 0.011, 0.008, metal(0x9aa0a8, 0.35), 12); dial.rotation.z = Math.PI / 2; dial.position.set(0.04, 0.005, -0.12); inner.add(dial);
    for (let i = 0; i < 8; i++) { const k = box(0.002, 0.003, 0.009, metal(0x5a6470, 0.5)); const a = i / 8 * Math.PI * 2; k.position.set(0.044, 0.005 + Math.cos(a) * 0.011, -0.12 + Math.sin(a) * 0.011); k.rotation.x = -a; inner.add(k); }
    const decal = box(0.002, 0.03, 0.07, texMat(labelTex(['CARTEL-PRO', 'FN-90 FRAMING'], '#1a1a1a', '#ffb060', '#e07820'), { roughness: 0.5 })); decal.position.set(0.0365, 0.03, -0.04); decal.rotation.y = Math.PI / 2; inner.add(decal);
    // nose with safety contact, barrel tip
    inner.add(at(box(0.034, 0.1, 0.05, brushed), 0, -0.01, -0.165));
    inner.add(at(box(0.02, 0.03, 0.02, metal(0x444c56, 0.5)), 0, -0.055, -0.185));
    inner.add(at(alongZ(cyl(0.008, 0.008, 0.05, metal(0x444c56, 0.4), 10)), 0, 0.012, -0.215));
    inner.add(at(alongZ(cyl(0.011, 0.011, 0.006, metal(0x2a3038, 0.5), 10)), 0, 0.012, -0.238));
    // slanted magazine with a visible nail strip
    const mag = box(0.03, 0.07, 0.17, brushed); mag.position.set(0, -0.045, -0.02); mag.rotation.x = -0.5; inner.add(mag);
    for (let i = 0; i < 9; i++) { const n = cyl(0.0035, 0.0035, 0.032, metal(0xc8ccd4, 0.3), 6); n.rotation.z = Math.PI / 2; n.position.set(0, -0.04 - i * 0.011, 0.02 - i * 0.016); inner.add(n); const h = cyl(0.005, 0.005, 0.002, metal(0xd8dce4, 0.3), 8); h.rotation.z = Math.PI / 2; h.position.set(0.0165, -0.04 - i * 0.011, 0.02 - i * 0.016); inner.add(h); }
    // air fitting + coiled hose
    inner.add(at(alongZ(cyl(0.01, 0.01, 0.03, metal(BRASS, 0.3), 10)), 0, -0.005, 0.07));
    for (let i = 0; i < 6; i++) { const a = i * 0.9; inner.add(bar(V(0.01 + i * 0.01, -0.01 - i * 0.014, 0.085 + i * 0.024), V(0.02 + i * 0.01, -0.024 - i * 0.014, 0.105 + i * 0.024), 0.008, 0.008, rubber, 8)); void a; }
    // rubber overmould grip with ridges, trigger, guard
    const gripB = box(0.034, 0.09, 0.05, rubber); gripB.position.set(0, -0.05, 0.06); gripB.rotation.x = 0.3; inner.add(gripB);
    for (let i = 0; i < 5; i++) { const rd = box(0.036, 0.003, 0.052, mat(0x2a2e34, { roughness: 0.9 })); rd.position.set(0, -0.02 - i * 0.015, 0.05 + i * 0.005); rd.rotation.x = 0.3; inner.add(rd); }
    const trig = box(0.008, 0.028, 0.008, metal(0x9aa0a8, 0.4)); trig.position.set(0, -0.035, 0.02); trig.rotation.x = 0.3; inner.add(trig);
    inner.add(bar(V(0, -0.075, 0.0), V(0, -0.075, 0.045), 0.003, 0.003, metal(DARK, 0.5), 6));
    const R = buildHand({ side: 'R', grip: V(0, -0.055, 0.065), elbow: V(0.17, -0.29, 0.3), radius: 0.02, axis: V(0, 1, 0.3).normalize(), curl: 0.95, trigger: V(0, -0.035, 0.02) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', grip: V(-0.02, -0.06, -0.13), elbow: V(-0.27, -0.29, 0.22), radius: 0.03, axis: V(0, 0, 1), curl: 0.6, watch: true }).group);
    inner.add(off);
    g.add(inner);
    return finish(g, 'nailgun', -0.14, V(0, 0.06, -0.25), { pos: V(0.0, -0.15, -0.8), rotX: -0.06, rotY: 0.0 }, { trigger: R.trigger, offHand: off });
}

export function buildRollerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.06;
    const tubeM = texMat(brushedTex(), { roughness: 0.4, metalness: 0.7 }), rubber = mat(RUBBER, { roughness: 0.9 });
    // fat launcher tube with clamps and a brass muzzle collar
    inner.add(at(alongZ(cyl(0.055, 0.06, 0.3, tubeM, 20)), 0, 0.02, -0.07));
    for (const z of [0.0, -0.09, -0.16]) { inner.add(at(alongZ(cyl(0.064, 0.064, 0.014, metal(0x363c44, 0.5), 20)), 0, 0.02, z)); inner.add(at(box(0.012, 0.02, 0.016, metal(0x5a6470, 0.45)), 0, 0.088, z)); inner.add(at(cyl(0.004, 0.004, 0.022, metal(0x9aa0a8, 0.4), 6), 0, 0.09, z)); }
    inner.add(at(alongZ(cyl(0.068, 0.068, 0.04, metal(BRASS, 0.3), 20)), 0, 0.02, -0.215));
    // loaded roller nap + cap
    inner.add(at(alongZ(cyl(0.042, 0.042, 0.09, texMat(napTex(), { roughness: 1, emissive: 0x442800, emissiveIntensity: 0.35 }), 20)), 0, 0.02, -0.255));
    inner.add(at(alongZ(cyl(0.03, 0.03, 0.01, metal(0x9aa0a8, 0.4), 12)), 0, 0.02, -0.302));
    // pressure tank with straps, label, gauge with needle, valve, hose
    inner.add(at(alongZ(cyl(0.035, 0.035, 0.11, mat(0xcc3322, { roughness: 0.35 }), 16)), 0, -0.045, 0.02));
    for (const z of [-0.01, 0.05]) inner.add(at(alongZ(cyl(0.037, 0.037, 0.01, rubber, 16)), 0, -0.045, z));
    inner.add(at(alongZ(cyl(0.0355, 0.0355, 0.03, texMat(labelTex(['PRESSURE', 'CAUTION · 90 PSI'], '#f2e6c8', '#1a1a1a', '#b02020'), { roughness: 0.6 }), 16)), 0, -0.045, 0.02));
    const gauge = cyl(0.015, 0.015, 0.01, metal(0xd8d0b8, 0.25), 14); gauge.rotation.z = Math.PI / 2; gauge.position.set(0.04, -0.03, 0.0); inner.add(gauge);
    const gface = cyl(0.012, 0.012, 0.002, mat(0xf4f0e0, { roughness: 0.4 }), 14); gface.rotation.z = Math.PI / 2; gface.position.set(0.046, -0.03, 0.0); inner.add(gface);
    const needle = box(0.002, 0.002, 0.016, mat(0xb02020)); needle.position.set(0.047, -0.03, 0.004); needle.rotation.x = 0.6; inner.add(needle);
    inner.add(at(cyl(0.006, 0.006, 0.014, metal(BRASS, 0.3), 8), 0, -0.002, 0.06));
    inner.add(bar(V(0.0, -0.045, 0.08), V(0.07, -0.12, 0.22), 0.008, 0.008, rubber, 8));
    // shoulder strap (flat arc off-screen right)
    for (let i = 0; i < 5; i++) inner.add(bar(V(0.05 + i * 0.02, -0.02 - i * 0.03, 0.05 + i * 0.05), V(0.07 + i * 0.02, -0.05 - i * 0.03, 0.1 + i * 0.05), 0.012, 0.012, mat(0x3a3020, { roughness: 0.9 }), 6));
    // grip + trigger
    const gripB = box(0.034, 0.09, 0.05, rubber); gripB.position.set(0, -0.06, 0.08); gripB.rotation.x = 0.3; inner.add(gripB);
    const trig = box(0.008, 0.026, 0.008, metal(0x9aa0a8, 0.4)); trig.position.set(0, -0.045, 0.045); trig.rotation.x = 0.3; inner.add(trig);
    const R = buildHand({ side: 'R', grip: V(0, -0.065, 0.085), elbow: V(0.17, -0.29, 0.31), radius: 0.02, axis: V(0, 1, 0.3).normalize(), curl: 0.95, trigger: V(0, -0.045, 0.045) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', grip: V(-0.01, -0.03, -0.13), elbow: V(-0.27, -0.29, 0.22), radius: 0.056, axis: V(0, 0, 1), curl: 0.75, watch: true }).group);
    inner.add(off);
    g.add(inner);
    return finish(g, 'roller', -0.12, V(0, 0.08, -0.31), { pos: V(0.045, -0.15, -0.56), rotX: -0.02, rotY: 0.0 }, { trigger: R.trigger, offHand: off });
}

export function buildSprayerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.06;
    const rubber = mat(RUBBER, { roughness: 0.9 }), brushed = texMat(brushedTex(), { roughness: 0.35, metalness: 0.8 });
    // hopper tank with straps and a fill cap; label
    inner.add(at(alongZ(cyl(0.05, 0.05, 0.15, mat(0xcc3322, { roughness: 0.35 }), 18)), 0, 0.02, 0.02));
    for (const z of [-0.03, 0.06]) inner.add(at(alongZ(cyl(0.052, 0.052, 0.012, rubber, 18)), 0, 0.02, z));
    inner.add(at(alongZ(cyl(0.0505, 0.0505, 0.04, texMat(labelTex(['SPRAY-MASTER', 'AIRLESS · 3000'], '#f2e6c8', '#1a1a1a', '#2a6a2a'), { roughness: 0.6 }), 18)), 0, 0.02, 0.015));
    inner.add(at(cyl(0.014, 0.014, 0.012, metal(BRASS, 0.3), 10), 0, 0.075, 0.04));
    // gun body, barrel with a heat shroud (holes), pattern knob, nozzle guard and tip
    inner.add(at(box(0.04, 0.05, 0.08, brushed), 0, 0.045, -0.06));
    inner.add(at(alongZ(cyl(0.014, 0.02, 0.2, metal(0x333a44, 0.4), 12)), 0, 0.05, -0.12));
    inner.add(at(alongZ(cyl(0.024, 0.024, 0.09, metal(0x2a3038, 0.5), 12)), 0, 0.05, -0.1));
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const hole = sph(0.005, mat(0x0c0e12), 6, 5); hole.position.set(sx * 0.022, 0.05, -0.07 - i * 0.02); inner.add(hole); }
    const knob = cyl(0.012, 0.012, 0.01, metal(0x9aa0a8, 0.35), 10); knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.075, -0.05); inner.add(knob);
    inner.add(at(alongZ(cyl(0.024, 0.014, 0.03, mat(0x88ff66, { emissive: 0x226611, emissiveIntensity: 0.6, roughness: 0.3 }), 12)), 0, 0.05, -0.23));
    inner.add(at(alongZ(cyl(0.03, 0.03, 0.008, metal(0x9aa0a8, 0.4), 12)), 0, 0.05, -0.212));
    // gauge on the tank, hose from tank to grip
    const gauge = cyl(0.012, 0.012, 0.008, metal(0xd8d0b8, 0.25), 12); gauge.rotation.z = Math.PI / 2; gauge.position.set(0.052, 0.035, 0.06); inner.add(gauge);
    inner.add(bar(V(0.03, -0.02, 0.06), V(0.08, -0.1, 0.22), 0.008, 0.008, rubber, 8));
    // grip with ridges, trigger, guard
    const gripB = box(0.032, 0.085, 0.045, rubber); gripB.position.set(0, -0.04, 0.055); gripB.rotation.x = 0.25; inner.add(gripB);
    for (let i = 0; i < 4; i++) { const rd = box(0.034, 0.003, 0.047, mat(0x2a2e34, { roughness: 0.9 })); rd.position.set(0, -0.015 - i * 0.016, 0.047 + i * 0.004); rd.rotation.x = 0.25; inner.add(rd); }
    const trig = box(0.008, 0.026, 0.008, metal(0x9aa0a8, 0.4)); trig.position.set(0, -0.025, 0.02); trig.rotation.x = 0.25; inner.add(trig);
    inner.add(bar(V(0, -0.062, -0.005), V(0, -0.062, 0.04), 0.003, 0.003, metal(DARK, 0.5), 6));
    const R = buildHand({ side: 'R', grip: V(0, -0.05, 0.06), elbow: V(0.17, -0.28, 0.3), radius: 0.02, axis: V(0, 1, 0.25).normalize(), curl: 0.95, trigger: V(0, -0.025, 0.02) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', grip: V(-0.015, 0.02, -0.09), elbow: V(-0.27, -0.28, 0.24), radius: 0.024, axis: V(0, 0, 1), curl: 0.9, watch: true }).group);
    inner.add(off);
    g.add(inner);
    return finish(g, 'sprayer', -0.12, V(0, 0.11, -0.25), { pos: V(0.075, -0.13, -0.62), rotX: -0.05, rotY: 0.1 }, { trigger: R.trigger, offHand: off });
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
