/**
 * HANDS v3 — MODERN (Round 3, G3)
 *
 * Organic hands and forearms built by lofting elliptical cross-sections along
 * curved centre-lines (smooth normals, one merged skin mesh per hand), with
 * procedural skin and leather maps. Exports:
 *   buildArm(opts)  → { group, trigger }   same contract as the round-2 hand
 *   loft(...)       reusable for tools
 *   skinMaterial(), leatherMaterial()
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHandMesh, gripPose } from './handmesh.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- loft

/**
 * Loft a tube through `stations` [{ p: Vector3, rx, ry, shade? }] with `segs`
 * points around. Frames come from the path tangent and a reference up vector
 * (`up`) so the ellipse's rx spans the up×tangent axis and ry the up axis.
 * Returns a non-indexed BufferGeometry with smooth normals, uv, and a colour
 * attribute (shade, default 1) for baked creases.
 */
export function loft(stations, segs = 14, { up = V(0, 1, 0), capStart = true, capEnd = true } = {}) {
    const n = stations.length;
    const pos = [], uv = [], col = [];
    const rings = [];
    for (let i = 0; i < n; i++) {
        const s = stations[i];
        const prev = stations[Math.max(0, i - 1)].p, next = stations[Math.min(n - 1, i + 1)].p;
        const t = V().subVectors(next, prev).normalize();
        let u = (s.up || up).clone();
        u.sub(t.clone().multiplyScalar(u.dot(t)));
        if (u.lengthSq() < 1e-6) u = Math.abs(t.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
        u.normalize();
        const b = V().crossVectors(t, u).normalize();
        const ring = [];
        for (let j = 0; j <= segs; j++) {
            const a = (j / segs) * Math.PI * 2;
            ring.push(V().copy(s.p).addScaledVector(b, Math.cos(a) * s.rx).addScaledVector(u, Math.sin(a) * s.ry));
        }
        rings.push(ring);
    }
    const shade = (i) => stations[i].shade ?? 1;
    const push = (p, uu, vv, c) => { pos.push(p.x, p.y, p.z); uv.push(uu, vv); col.push(c, c, c); };
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < segs; j++) {
            const a = rings[i][j], b2 = rings[i][j + 1], c = rings[i + 1][j], d = rings[i + 1][j + 1];
            const v0 = i / (n - 1), v1 = (i + 1) / (n - 1), u0 = j / segs, u1 = (j + 1) / segs;
            push(a, u0, v0, shade(i)); push(c, u0, v1, shade(i + 1)); push(b2, u1, v0, shade(i));
            push(b2, u1, v0, shade(i)); push(c, u0, v1, shade(i + 1)); push(d, u1, v1, shade(i + 1));
        }
    }
    const cap = (i, flip) => {
        const c = stations[i].p, ring = rings[i];
        for (let j = 0; j < segs; j++) {
            const a = ring[j], b2 = ring[j + 1];
            if (flip) { push(c, 0.5, i ? 1 : 0, shade(i)); push(b2, 0.5, i ? 1 : 0, shade(i)); push(a, 0.5, i ? 1 : 0, shade(i)); }
            else { push(c, 0.5, i ? 1 : 0, shade(i)); push(a, 0.5, i ? 1 : 0, shade(i)); push(b2, 0.5, i ? 1 : 0, shade(i)); }
        }
    };
    if (capStart) cap(0, false);
    if (capEnd) cap(n - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const merged = BufferGeometryUtils.mergeVertices(g, 1e-5);
    merged.computeVertexNormals();
    return merged;
}

/** sample a smooth curve through joints; returns stations with interpolated radii and joint creases */
function tubeStations(joints, radii, ry = null, samples = 16, { crease = 0.86, creaseAt = [] } = {}) {
    const curve = new THREE.CatmullRomCurve3(joints, false, 'catmullrom', 0.4);
    const out = [];
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const k = t * (radii.length - 1), k0 = Math.floor(k), k1 = Math.min(radii.length - 1, k0 + 1), f = k - k0;
        const r = radii[k0] * (1 - f) + radii[k1] * f;
        const rr = ry ? ry[k0] * (1 - f) + ry[k1] * f : r * 0.86;
        let shade = 1;
        for (const c of creaseAt) { const d = Math.abs(t - c); if (d < 0.07) shade = Math.min(shade, crease + (1 - crease) * (d / 0.07)); }
        out.push({ p: curve.getPoint(t), rx: r, ry: rr, shade });
    }
    return out;
}

// ---------------------------------------------------------------- materials

function canvasTex(w, h, draw, repeat = [1, 1]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 4;
    return t;
}
let _skin = null, _skinR = null, _leather = null, _leatherR = null, _cloth = null;
function skinMaps() {
    if (_skin) return [_skin, _skinR];
    _skin = canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#e0a67c'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 220; i++) { // mottling: warm and cool blotches
            const r = 10 + Math.random() * 40; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            const warm = Math.random() < 0.5; g.addColorStop(0, warm ? 'rgba(210,100,80,0.16)' : 'rgba(190,150,120,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save(); ctx.translate(Math.random() * w, Math.random() * h); ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
        }
        for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '120,60,40' : '255,230,210'},${0.04 + Math.random() * 0.06})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2); } // pores
    }, [2, 2]);
    _skin.colorSpace = THREE.SRGBColorSpace;
    _skinR = canvasTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#8c8c8c'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '220,220,220'},${0.08})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    }, [2, 2]);
    return [_skin, _skinR];
}
function leatherMaps() {
    if (_leather) return [_leather, _leatherR];
    _leather = canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#5b4632'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) { const x = Math.random() * w, y = Math.random() * h, r = 2 + Math.random() * 5; ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,20,12' : '120,95,70'},0.25)`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, r, Math.random() * 6, Math.random() * 6 + 2); ctx.stroke(); } // grain cells
        for (let i = 0; i < 40; i++) { ctx.strokeStyle = 'rgba(30,20,12,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Math.random() * w, Math.random() * h); ctx.lineTo(Math.random() * w, Math.random() * h); ctx.stroke(); } // scuffs
    }, [2, 2]);
    _leather.colorSpace = THREE.SRGBColorSpace;
    _leatherR = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { ctx.fillStyle = `rgba(80,80,80,${0.12})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, [2, 2]);
    return [_leather, _leatherR];
}
function clothMap() {
    if (_cloth) return _cloth;
    _cloth = canvasTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#8f7a56'; ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, y, w, 1); }
        for (let x = 0; x < w; x += 3) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, 0, 1, h); }
        for (let i = 0; i < 400; i++) { ctx.fillStyle = 'rgba(60,40,20,0.15)'; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, [3, 3]);
    _cloth.colorSpace = THREE.SRGBColorSpace;
    return _cloth;
}
export function skinMaterial() { const [m, r] = skinMaps(); return new THREE.MeshStandardMaterial({ map: m, roughnessMap: r, roughness: 0.62, metalness: 0, color: 0xffffff, vertexColors: true }); }
export function leatherMaterial() { const [m, r] = leatherMaps(); return new THREE.MeshStandardMaterial({ map: m, roughnessMap: r, roughness: 0.9, metalness: 0, color: 0xffffff, vertexColors: true }); }
export function clothMaterial() { return new THREE.MeshStandardMaterial({ map: clothMap(), roughness: 0.95, metalness: 0, color: 0xffffff, vertexColors: true }); }

// ---------------------------------------------------------------- arm + hand

/**
 * side 'R'|'L'; grip palm centre; elbow; radius handle radius; axis unit along
 * the handle; curl 0..1; watch; trigger Vector3 (index finger reaches for it and
 * becomes an animated part); spread finger spacing scale.
 */
/**
 * side 'R'|'L'; grip: contact point on the tool; radius: handle/barrel radius; axis: along the handle;
 * mode 'grip' (fingers wrap, thumb over) or 'support' (palm up under the tool, fingers together);
 * out: for 'support', the direction from the tool to the back of the hand (default down).
 * Shoulders are anchored at the lower corners of the view (K1); the elbow comes from two-bone IK.
 */
export function buildArm({ side, grip, radius = 0.02, axis = V(0, 0, 1), curl = 0.9, watch = false, trigger = null, spread = 0.25, mode = 'grip', out: outIn = null, shoulder: shoulderIn = null, elbow = null }) {
    const g = new THREE.Group();
    const s = side === 'R' ? 1 : -1;
    const ax = axis.clone().normalize();
    let out = outIn ? outIn.clone().normalize() : V().crossVectors(ax, V(s, 0, 0)).normalize();
    if (out.lengthSq() < 0.01) out.set(0, -1, 0);
    if (mode === 'support' && !outIn) out.set(0, -1, 0);
    const across = V().crossVectors(out, ax).normalize();

    // ---- hand frame: +Y = back of the hand (away from the tool), +Z = fingers before the curl
    const Y = out.clone(), Z = across.clone().multiplyScalar(s).normalize(), X = V().crossVectors(Y, Z).normalize();
    const HAND_SCALE = 0.88;
    const origin = grip.clone().addScaledVector(out, radius + 0.014 * HAND_SCALE).addScaledVector(Z, -0.026 * HAND_SCALE);
    const frame = new THREE.Matrix4().makeBasis(X, Y, Z);
    const hand = new THREE.Group(); hand.position.copy(origin); hand.quaternion.setFromRotationMatrix(frame); hand.scale.setScalar(HAND_SCALE);
    const pose = mode === 'support'
        ? { curl: [[0.5, 0.55, 0.4], [0.55, 0.6, 0.45], [0.5, 0.55, 0.4], [0.45, 0.5, 0.35]].map(f => f.map(a => Math.min(1.3, a * (0.6 + radius * 12)))), spread: 0.15, thumb: [0.15, 0.25, 0.2] }
        : gripPose(radius / HAND_SCALE, { curlScale: 0.85 + curl * 0.35, spread, trigger: !!trigger });
    const built = buildHandMesh(pose, s);
    const mesh = new THREE.Mesh(built.geometry, [skinMaterial(), leatherMaterial()]);
    mesh.userData.isHand = true; mesh.userData.side = side;
    hand.add(mesh);
    const nailMat = new THREE.MeshStandardMaterial({ color: 0xf3d6c2, roughness: 0.28, metalness: 0 });
    for (const st of built.nails) {
        const nail = new THREE.Mesh(new THREE.SphereGeometry(st.r, 10, 6), nailMat);
        nail.scale.set(0.95, 0.22, 1.35); nail.position.copy(st.pos);
        const m = new THREE.Matrix4().makeBasis(V().crossVectors(st.up, st.dir).normalize(), st.up, st.dir); nail.quaternion.setFromRotationMatrix(m);
        hand.add(nail);
    }
    g.add(hand);

    // ---- arm: shoulder anchored at the lower corner of the view; elbow from two-bone IK bending down and outward
    const wrist = origin.clone().addScaledVector(Z, -0.045 * HAND_SCALE);
    const shoulder = shoulderIn ? shoulderIn.clone() : V(s > 0 ? 0.08 : -0.5, -0.36, 0.5);
    const LU = 0.28, LF = 0.25;
    const sw = V().subVectors(wrist, shoulder); let d = sw.length(); const dirSW = sw.clone().normalize();
    if (d > LU + LF - 0.01) { d = LU + LF - 0.01; }
    const a = (LU * LU - LF * LF + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(0, LU * LU - a * a));
    const hint = V(s * 0.45, -1, 0.15).normalize();
    const perp = hint.sub(dirSW.clone().multiplyScalar(hint.dot(dirSW))).normalize();
    const elbowP = elbow ? elbow.clone() : shoulder.clone().addScaledVector(dirSW, a).addScaledVector(perp, hgt);
    const toWrist = V().subVectors(wrist, elbowP), dir = toWrist.clone().normalize();
    const armUp = Y.clone();
    const skinGeos = [], leatherGeos = [], clothGeos = [];
    // upper arm (sleeve) shoulder → elbow, then the sleeve continues to the cuff with ripples and a rolled cuff
    const cuffEnd = V().copy(elbowP).addScaledVector(toWrist, 0.45);
    const sleeveSt = tubeStations([shoulder, V().lerpVectors(shoulder, elbowP, 0.5), elbowP, V().lerpVectors(elbowP, cuffEnd, 0.5), cuffEnd], [0.046, 0.044, 0.042, 0.039, 0.036], [0.044, 0.042, 0.04, 0.037, 0.034], 26);
    sleeveSt.forEach((st, i) => { const t = i / 26; const rip = t > 0.55 ? 1 + 0.04 * Math.sin(t * 46) : 1; st.rx *= rip; st.ry *= rip; if (t > 0.92) { st.rx *= 1.16; st.ry *= 1.16; } });
    clothGeos.push(loft(sleeveSt, 16, { up: armUp }));
    const foreSt = tubeStations([cuffEnd, V().lerpVectors(cuffEnd, wrist, 0.5), V().copy(wrist).addScaledVector(dir, -0.006), V().copy(wrist).addScaledVector(dir, 0.008)], [0.029, 0.027, 0.024, 0.022], [0.024, 0.022, 0.019, 0.015], 12);
    skinGeos.push(loft(foreSt, 16, { up: armUp }));
    const strapSt = [{ p: V().copy(wrist).addScaledVector(dir, -0.014), rx: 0.027, ry: 0.021 }, { p: V().copy(wrist).addScaledVector(dir, -0.01), rx: 0.0285, ry: 0.0225 }, { p: V().copy(wrist).addScaledVector(dir, 0.002), rx: 0.0285, ry: 0.0225 }, { p: V().copy(wrist).addScaledVector(dir, 0.006), rx: 0.027, ry: 0.021 }];
    leatherGeos.push(loft(strapSt, 16, { up: armUp }));
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.005, 0.013), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.75 }));
    buckle.position.copy(wrist).addScaledVector(dir, -0.004).addScaledVector(armUp, 0.023); buckle.quaternion.setFromUnitVectors(V(0, 1, 0), armUp); g.add(buckle);
    if (watch) {
        const wp = V().copy(cuffEnd).addScaledVector(toWrist, 0.3);
        leatherGeos.push(loft([{ p: V().copy(wp).addScaledVector(dir, -0.006), rx: 0.027, ry: 0.021 }, { p: V().copy(wp).addScaledVector(dir, 0.006), rx: 0.027, ry: 0.021 }], 16, { up: armUp }));
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 16), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.25, metalness: 0.7 }));
        face.position.copy(wp).addScaledVector(armUp, 0.023); face.quaternion.setFromUnitVectors(V(0, 1, 0), armUp); g.add(face);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.002, 16), new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1, metalness: 0.2 }));
        glass.position.copy(face.position).addScaledVector(armUp, 0.004); glass.quaternion.copy(face.quaternion); g.add(glass);
    }
    const mergedSkin = BufferGeometryUtils.mergeGeometries(skinGeos, false); skinGeos.forEach(x => x.dispose());
    g.add(new THREE.Mesh(mergedSkin, skinMaterial()));
    const ml = BufferGeometryUtils.mergeGeometries(leatherGeos, false); leatherGeos.forEach(x => x.dispose()); g.add(new THREE.Mesh(ml, leatherMaterial()));
    const mc = BufferGeometryUtils.mergeGeometries(clothGeos, false); clothGeos.forEach(x => x.dispose()); g.add(new THREE.Mesh(mc, clothMaterial()));
    return { group: g, trigger: null, hand: mesh, handGroup: hand };
}

/** a continuous hose along control points (Catmull-Rom), for tools */
export function hose(points, r = 0.007, samples = 24) {
    const st = tubeStations(points, points.map(() => r), points.map(() => r), samples);
    return loft(st, 10);
}
