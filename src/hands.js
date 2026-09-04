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
        ctx.fillStyle = '#e8b48e'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 220; i++) { // mottling: warm and cool blotches
            const r = 10 + Math.random() * 40; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            const warm = Math.random() < 0.5; g.addColorStop(0, warm ? 'rgba(220,120,90,0.12)' : 'rgba(200,170,140,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
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
        ctx.fillStyle = '#9c8762'; ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, w, 1); }
        for (let x = 0; x < w; x += 3) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, 0, 1, h); }
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
export function buildArm({ side, grip, elbow, radius = 0.02, axis = V(0, 0, 1), curl = 0.9, watch = false, trigger = null, spread = 1 }) {
    const g = new THREE.Group();
    const s = side === 'R' ? 1 : -1;
    elbow = elbow.clone().add(V(0.03 * s, -0.07, -0.05));
    const ax = axis.clone().normalize();
    let out = V().crossVectors(ax, V(s, 0, 0)).normalize();
    if (out.lengthSq() < 0.01) out.set(0, -1, 0);
    const across = V().crossVectors(out, ax).normalize();
    const toGrip = V().subVectors(grip, elbow), dir = toGrip.clone().normalize();
    const wrist = V().copy(elbow).addScaledVector(toGrip, 0.84);
    const shoulder = V().copy(elbow).addScaledVector(dir, -0.22).add(V(s * 0.05, -0.05, 0.08));

    const skinGeos = [], leatherGeos = [], clothGeos = [];
    const armUp = out.clone().negate(); // back of the hand faces -out

    // sleeve: shoulder → cuff with fabric ripples, then a rolled cuff bump
    const cuffEnd = V().copy(elbow).addScaledVector(toGrip, 0.56);
    const sleeveJ = [shoulder, elbow, V().lerpVectors(elbow, cuffEnd, 0.5), cuffEnd];
    const sleeveSt = tubeStations(sleeveJ, [0.05, 0.047, 0.043, 0.04], [0.048, 0.045, 0.041, 0.038], 22);
    sleeveSt.forEach((st, i) => { const t = i / 22; const rip = t > 0.35 ? 1 + 0.045 * Math.sin(t * 40) : 1; st.rx *= rip; st.ry *= rip; if (t > 0.9) { st.rx *= 1.18; st.ry *= 1.18; } });
    clothGeos.push(loft(sleeveSt, 16, { up: armUp }));
    // forearm skin: cuff → wrist (tapering, slightly flattened), wrist bump
    const foreSt = tubeStations([cuffEnd, V().lerpVectors(cuffEnd, wrist, 0.5), wrist, V().copy(wrist).addScaledVector(dir, 0.012)], [0.031, 0.029, 0.026, 0.025], [0.026, 0.024, 0.02, 0.019], 12);
    skinGeos.push(loft(foreSt, 16, { up: armUp }));
    // palm: wrist → knuckle line, widening, cupped toward the handle
    const knuckleC = V().copy(grip).addScaledVector(across, 0.028 * s).addScaledVector(out, 0.006);
    const palmJ = [V().copy(wrist).addScaledVector(dir, 0.008), V().lerpVectors(wrist, knuckleC, 0.45).addScaledVector(out, 0.002), knuckleC, V().copy(knuckleC).addScaledVector(across, 0.008 * s)];
    const palmSt = tubeStations(palmJ, [0.024, 0.033, 0.04, 0.036], [0.019, 0.017, 0.015, 0.014], 14);
    skinGeos.push(loft(palmSt, 18, { up: armUp }));
    // fingerless leather glove over the palm (slightly larger), open at the finger bases
    const gloveSt = tubeStations(palmJ, [0.027, 0.036, 0.043, 0.038], [0.022, 0.02, 0.018, 0.017], 14);
    leatherGeos.push(loft(gloveSt.slice(0, 13), 18, { up: armUp, capStart: false, capEnd: false }));
    // wrist strap (leather ring) + buckle
    const strapSt = [{ p: V().copy(wrist).addScaledVector(dir, -0.002), rx: 0.03, ry: 0.024 }, { p: V().copy(wrist).addScaledVector(dir, 0.012), rx: 0.03, ry: 0.024 }];
    leatherGeos.push(loft(strapSt, 16, { up: armUp }));
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.014), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.75 }));
    buckle.position.copy(wrist).addScaledVector(dir, 0.005).addScaledVector(armUp, 0.026); buckle.quaternion.setFromUnitVectors(V(0, 1, 0), armUp); g.add(buckle);

    // fingers
    const nailMat = new THREE.MeshStandardMaterial({ color: 0xf6dcc8, roughness: 0.3, metalness: 0 });
    let triggerPart = null;
    const finger = (parent, joints, rBase, gloved) => {
        const st = tubeStations(joints, [rBase, rBase * 0.95, rBase * 0.86, rBase * 0.7], null, 18, { creaseAt: [0.36, 0.68], crease: 0.84 });
        const geo = loft(st, 12, { up: armUp });
        if (parent === g) skinGeos.push(geo); else parent.add(new THREE.Mesh(geo, skinMaterial()));
        // nail: flattened ellipsoid on the back of the tip
        const tip = joints[3], seg = V().subVectors(joints[3], joints[2]).normalize();
        const nail = new THREE.Mesh(new THREE.SphereGeometry(rBase * 0.62, 10, 6), nailMat);
        nail.scale.set(1, 0.28, 1.35); nail.position.copy(tip).addScaledVector(armUp, rBase * 0.62).addScaledVector(seg, -rBase * 0.3);
        nail.quaternion.setFromUnitVectors(V(0, 0, 1), seg); parent.add(nail);
        if (gloved) { // proximal glove loop
            const loopSt = tubeStations([joints[0], V().lerpVectors(joints[0], joints[1], 0.6)], [rBase + 0.0025, rBase + 0.0022], null, 4);
            if (parent === g) leatherGeos.push(loft(loopSt, 12, { up: armUp, capStart: false })); else parent.add(new THREE.Mesh(loft(loopSt, 12, { up: armUp, capStart: false }), leatherMaterial()));
        }
    };
    for (let i = 0; i < 4; i++) {
        const t = (i - 1.5) * 0.0175 * spread;
        const rBase = 0.0095 - Math.abs(i - 1.2) * 0.0008;
        const base = V().copy(grip).addScaledVector(ax, t).addScaledVector(out, 0.01).addScaledVector(across, 0.032 * s);
        if (i === 0 && trigger) {
            const tf = new THREE.Group(); tf.position.copy(base);
            const d = V().subVectors(trigger, base).normalize(), inward = out.clone().negate();
            const k1 = V().copy(d).multiplyScalar(0.028), k2 = V().copy(k1).addScaledVector(d, 0.02).addScaledVector(inward, 0.004), k3 = V().copy(k2).addScaledVector(d, 0.015).addScaledVector(inward, 0.007);
            finger(tf, [V(0, 0, 0), k1, k2, k3], rBase, true);
            g.add(tf); triggerPart = tf; continue;
        }
        const r = radius + 0.011;
        const a0 = 0.1, a1 = a0 + 1.1 * curl, a2 = a1 + 1.0 * curl, a3 = a2 + 0.85 * curl;
        const p = (a) => V().copy(grip).addScaledVector(ax, t).addScaledVector(out, Math.cos(a) * r).addScaledVector(across, Math.sin(a) * r * s);
        finger(g, [base, p(a1 * 0.5 + 0.3), p(a2 * 0.55 + 0.4), p(a3 * 0.6 + 0.45)], rBase, true);
    }
    // thumb: from the palm side over the top of the handle
    const tb = V().copy(grip).addScaledVector(across, -0.024 * s).addScaledVector(out, -0.004).addScaledVector(ax, 0.004);
    const t1 = V().copy(tb).addScaledVector(ax, -0.02).addScaledVector(out, 0.02).addScaledVector(across, -0.004 * s);
    const t2 = V().copy(t1).addScaledVector(ax, -0.015).addScaledVector(out, 0.018).addScaledVector(across, 0.008 * s);
    const t3 = V().copy(t2).addScaledVector(ax, -0.008).addScaledVector(out, 0.012).addScaledVector(across, 0.012 * s);
    const thumbSt = tubeStations([V().copy(tb).addScaledVector(ax, 0.012).addScaledVector(across, 0.006 * s), tb, t1, t2, t3], [0.015, 0.0135, 0.0115, 0.0098, 0.0082], null, 20, { creaseAt: [0.55, 0.8], crease: 0.86 });
    skinGeos.push(loft(thumbSt, 12, { up: armUp }));
    const tnail = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 6), nailMat); tnail.scale.set(1, 0.3, 1.35); tnail.position.copy(t3).addScaledVector(out, 0.004); tnail.quaternion.setFromUnitVectors(V(0, 0, 1), V().subVectors(t3, t2).normalize()); g.add(tnail);
    // watch on the off hand
    if (watch) {
        const wp = V().copy(elbow).addScaledVector(toGrip, 0.70);
        leatherGeos.push(loft([{ p: V().copy(wp).addScaledVector(dir, -0.006), rx: 0.029, ry: 0.023 }, { p: V().copy(wp).addScaledVector(dir, 0.006), rx: 0.029, ry: 0.023 }], 16, { up: armUp }));
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 16), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.25, metalness: 0.7 }));
        face.position.copy(wp).addScaledVector(armUp, 0.025); face.quaternion.setFromUnitVectors(V(0, 1, 0), armUp); g.add(face);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.002, 16), new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1, metalness: 0.2 }));
        glass.position.copy(face.position).addScaledVector(armUp, 0.004); glass.quaternion.copy(face.quaternion); g.add(glass);
    }

    const mergedSkin = BufferGeometryUtils.mergeGeometries(skinGeos, false); skinGeos.forEach(x => x.dispose());
    g.add(new THREE.Mesh(mergedSkin, skinMaterial()));
    if (leatherGeos.length) { const ml = BufferGeometryUtils.mergeGeometries(leatherGeos, false); leatherGeos.forEach(x => x.dispose()); g.add(new THREE.Mesh(ml, leatherMaterial())); }
    if (clothGeos.length) { const mc = BufferGeometryUtils.mergeGeometries(clothGeos, false); clothGeos.forEach(x => x.dispose()); g.add(new THREE.Mesh(mc, clothMaterial())); }
    return { group: g, trigger: triggerPart };
}
