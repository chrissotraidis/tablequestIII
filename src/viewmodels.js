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
import { buildArm, loft, hose } from './hands.js';

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

const buildHand = buildArm; // G3: lofted organic hands from hands.js (legacy primitive hand kept above for reference)

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
    shadeGroup(g, V(0.35, 1, 0.55), 0.7); // J3.1: baked directional shading on the tool's flat-colour parts
    const baked = bakeStatic(g, { quantize: 0.5 });
    for (const bp of Object.values(bakedParts)) baked.add(bp);
    const hands = []; baked.traverse(o => { if (o.isMesh && o.userData.isHand) { o.morphTargetInfluences = o.morphTargetInfluences ? [...o.morphTargetInfluences] : [0, 0, 0, 0]; hands.push(o); } });
    baked.userData = { name, baseRotX, muzzle, ads, parts: bakedParts, hands };
    baked.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 10; o.layers.enable(1); } });
    return baked;
}

// ---------------------------------------------------------------- weapons (v3, Round 3 G4)

const plastic = (color, rough = 0.48) => mat(color, { roughness: rough, metalness: 0.05 });
const alu = () => texMat(brushedTex(), { roughness: 0.32, metalness: 0.85 });
const rubberM = () => mat(RUBBER, { roughness: 0.92 });
/** rounded body lofted along -Z: sections [[z, rx, ry], ...] */
function body(sections, m, up = V(0, 1, 0), segs = 18) {
    const st = sections.map(([z, rx, ry]) => ({ p: V(0, 0, z), rx, ry }));
    return new THREE.Mesh(loft(st, segs, { up }), m);
}

/** the cover's brush: long flat wooden handle, chamfered flat ferrule, layered flat bristles loaded with blue */
export function buildBrushViewmodel() {
    const g = new THREE.Group();
    const wood = texMat(woodTex(), { roughness: 0.42 });
    // flat handle (lathe, then flattened): hang-hole end behind the hand, waist under the fingers, flare into the ferrule
    const handle = lathe([[0.004, -0.14], [0.011, -0.128], [0.014, -0.09], [0.012, -0.03], [0.013, 0.02], [0.017, 0.06], [0.02, 0.085], [0.0, 0.09]], wood, 20);
    handle.rotation.x = -Math.PI / 2; handle.scale.set(1.9, 1, 1); handle.position.z = 0.0; g.add(handle);
    const hole = alongZ(cyl(0.004, 0.004, 0.03, mat(0x1a1410), 8)); hole.rotation.z = Math.PI / 2; hole.rotation.x = 0; hole.position.set(0, 0, 0.125); hole.rotation.set(0, 0, Math.PI / 2); g.add(hole);
    const label = box(0.03, 0.0125, 0.03, texMat(labelTex(['ARTISAN', 'No. 7 · FLAT SASH'], '#efe6d2', '#2a1a10', '#8a1422'), { roughness: 0.5 })); label.position.set(0, 0, 0.04); label.scale.set(1.35, 1.02, 1); g.add(label);
    // head part: ferrule, crimps, rivets, bristle block, bristle strands, paint load, drips
    const head = new THREE.Group(); head.position.z = -0.09;
    const ferrule = box(0.078, 0.022, 0.055, alu()); ferrule.position.z = -0.02; head.add(ferrule);
    const chamfer = box(0.074, 0.03, 0.012, alu()); chamfer.position.set(0, 0, 0.012); head.add(chamfer);
    for (const z of [-0.036, -0.03]) { const c = box(0.08, 0.023, 0.003, metal(0x9aa0a8, 0.4)); c.position.z = z; head.add(c); }
    for (const sx of [-1, 1]) { const rv = sph(0.0035, metal(0x606870, 0.4), 6, 5); rv.position.set(sx * 0.028, 0.0115, -0.012); head.add(rv); }
    const bristleM = mat(0x8a7350, { roughness: 0.95 }), bristleD = mat(0x5e4b30, { roughness: 0.95 });
    const block = box(0.072, 0.014, 0.08, bristleM); block.position.set(0, 0, -0.085); head.add(block);
    for (let i = 0; i < 18; i++) { // strands along the working edge, layered top and bottom
        const x = -0.034 + i * 0.004, y = (i % 2 ? 0.004 : -0.004);
        head.add(bar(V(x, y, -0.06), V(x + (i % 3 - 1) * 0.002, y * 1.6 - 0.002, -0.128 - (i % 4) * 0.003), 0.0016, 0.0011, i % 2 ? bristleM : bristleD, 5));
    }
    const paintM = mat(0x2f62d8, { emissive: 0x0f2a80, emissiveIntensity: 0.45, roughness: 0.2 });
    const load = box(0.074, 0.016, 0.034, paintM); load.position.set(0, -0.001, -0.112); head.add(load);
    for (const [x, len] of [[-0.02, 0.03], [0.004, 0.045], [0.026, 0.022]]) { // drips
        head.add(bar(V(x, -0.008, -0.108), V(x + 0.002, -0.008 - len, -0.104), 0.0035, 0.0018, paintM, 6));
        const d = sph(0.0045, paintM, 8, 6); d.scale.set(1, 1.5, 1); d.position.set(x + 0.002, -0.008 - len, -0.104); head.add(d);
    }
    g.add(head);
    // right hand on the handle waist, index along; off hand holds the can
    const R = buildHand({ side: 'R', grip: V(0, -0.003, 0.035), elbow: V(0.16, -0.31, 0.32), radius: 0.014, axis: V(0, 0, 1), curl: 0.95 });
    g.add(R.group);
    const off = new THREE.Group(); off.position.set(-0.17, -0.11, -0.08);
    const can = new THREE.Group();
    can.add(cyl(0.045, 0.045, 0.085, alu(), 18));
    can.add(at(cyl(0.047, 0.047, 0.008, metal(0xb8bcc2, 0.35), 18), 0, 0.043, 0));
    can.add(at(cyl(0.041, 0.041, 0.006, mat(0x2f62d8, { roughness: 0.12, emissive: 0x0f2a80, emissiveIntensity: 0.4 }), 18), 0, 0.045, 0));
    can.add(at(cyl(0.0458, 0.0458, 0.05, texMat(labelTex(["SANDY'S", 'SOLID OAK STAIN'], '#e8dfc8', '#1a1a1a', '#2244aa'), { roughness: 0.7 }), 18), 0, -0.005, 0));
    can.add(bar(V(-0.048, 0.048, 0), V(0.048, 0.048, 0), 0.0035, 0.0035, metal(0x9aa0a8, 0.4), 8));
    off.add(can);
    off.add(buildHand({ side: 'L', grip: V(0, 0.055, 0), elbow: V(-0.17, -0.17, 0.33), radius: 0.004, axis: V(1, 0, 0), curl: 1.0, watch: true }).group);
    g.add(off);
    g.rotation.set(0.12, 0.18, -0.3); g.position.set(0.05, 0.0, -0.03); g.scale.setScalar(0.92);
    return finish(g, 'paintbrush', -0.3, V(0, 0.0, -0.24), { pos: V(0.05, -0.04, -0.42), rotX: 0.16, rotY: -0.22 }, { head, offHand: off });
}

export function buildLegViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.07;
    const wood = texMat(woodTex(), { roughness: 0.5 }), woodDark = texMat(woodTex(true), { roughness: 0.55 });
    const tilt = -Math.PI / 3;
    const along = V(0, Math.cos(tilt + Math.PI / 2) * -1, Math.sin(tilt + Math.PI / 2) * -1).normalize();
    const leg = lathe([[0.0, -0.02], [0.03, -0.02], [0.036, 0.0], [0.03, 0.03], [0.026, 0.06], [0.034, 0.08], [0.026, 0.1], [0.02, 0.2], [0.024, 0.3], [0.03, 0.42], [0.036, 0.5], [0.036, 0.54], [0.0, 0.54]], wood, 20);
    leg.rotation.x = tilt; leg.position.set(0, 0.1, -0.1).addScaledVector(along, -0.02); inner.add(leg);
    // metal top plate with a hanger bolt where it tore off the table
    const plate = cyl(0.04, 0.04, 0.006, alu(), 16); plate.rotation.x = tilt; plate.position.set(0, 0.1, -0.1).addScaledVector(along, 0.525); inner.add(plate);
    const bolt = cyl(0.006, 0.006, 0.05, metal(0x8a929c, 0.45), 8); bolt.rotation.x = tilt; bolt.position.set(0, 0.1, -0.1).addScaledVector(along, 0.55); inner.add(bolt);
    for (let i = 0; i < 4; i++) { const sc = sph(0.004, metal(0x6a7078, 0.5), 6, 5); const a = i / 4 * Math.PI * 2; sc.position.set(Math.cos(a) * 0.03, 0.1, -0.1).addScaledVector(along, 0.525).add(V(0, Math.sin(a) * 0.015, Math.sin(a) * 0.026)); inner.add(sc); }
    for (let i = 0; i < 3; i++) { // bent nails near the plate
        const base = V(0.02 - i * 0.02, 0.1, -0.1).addScaledVector(along, 0.46 + i * 0.012);
        const n1 = V().copy(base).add(V(0.01 * (i % 2 ? 1 : -1), 0.02, -0.01)), n2 = V().copy(n1).add(V(0.012, 0.006, -0.008));
        inner.add(bar(base, n1, 0.0025, 0.002, metal(0x9aa0a8, 0.5), 6)); inner.add(bar(n1, n2, 0.002, 0.0015, metal(0x8a929c, 0.5), 6));
    }
    for (let i = 0; i < 4; i++) { const sc = box(0.012, 0.004, 0.02, mat(0x4a2e14, { roughness: 0.9 })); sc.position.set(0.02 * Math.cos(i * 1.7), 0.1, -0.1).addScaledVector(along, 0.05 + i * 0.045); sc.rotation.x = tilt; inner.add(sc); }
    const gripBand = cyl(0.041, 0.041, 0.11, texMat(tapeTex(), { roughness: 0.95 }), 16); gripBand.rotation.x = tilt; gripBand.position.set(0, -0.06, -0.005); inner.add(gripBand);
    const ferrule = cyl(0.041, 0.041, 0.02, metal(BRASS, 0.35), 16); ferrule.rotation.x = tilt; ferrule.position.set(0, -0.12, 0.03); inner.add(ferrule);
    const gripAxis = V(0, Math.sin(-tilt), -Math.cos(-tilt)).normalize();
    inner.add(buildHand({ side: 'R', grip: V(0.0, -0.075, 0.01), elbow: V(0.17, -0.27, 0.22), radius: 0.04, axis: gripAxis, curl: 0.85 }).group);
    inner.add(buildHand({ side: 'L', grip: V(0.0, -0.02, -0.02), elbow: V(-0.19, -0.25, 0.22), radius: 0.04, axis: gripAxis, curl: 0.85, watch: true }).group);
    g.add(inner);
    g.scale.setScalar(0.55); g.position.set(0.06, 0.17, 0.0);
    return finish(g, 'tableLeg', 0, V(0, 0.2, -0.3));
}

/** cordless framing nailer */
export function buildNailgunViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.05;
    const orange = plastic(0xe07820), orangeD = plastic(0xb85f14, 0.55), dark = plastic(0x2a2e34, 0.6);
    // rounded main body with the motor bulge at the rear, drive housing toward the nose
    inner.add(body([[0.07, 0.03, 0.036], [0.03, 0.038, 0.046], [-0.02, 0.04, 0.05], [-0.07, 0.036, 0.046], [-0.12, 0.028, 0.04], [-0.15, 0.024, 0.034]], orange));
    inner.add(body([[0.02, 0.041, 0.02], [-0.08, 0.041, 0.02]], orangeD, V(0, 1, 0), 12)); // side rib
    inner.add(at(box(0.086, 0.012, 0.16, dark), 0, -0.04, -0.05)); // lower frame
    // exhaust deflector, depth dial, LED, rafter hook, decal
    inner.add(at(cyl(0.017, 0.017, 0.016, metal(0x444c56, 0.45), 14), 0, 0.055, -0.03));
    inner.add(at(cyl(0.019, 0.019, 0.004, metal(0x2a3038, 0.5), 14), 0, 0.065, -0.03));
    const dial = cyl(0.011, 0.011, 0.01, metal(0x9aa0a8, 0.35), 12); dial.rotation.x = Math.PI / 2; dial.position.set(0.0, 0.03, -0.155); inner.add(dial);
    const led = sph(0.004, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 2, roughness: 0.3 }), 8, 6); led.position.set(0.02, -0.02, -0.16); inner.add(led);
    inner.add(new THREE.Mesh(hose([V(0.036, 0.03, 0.0), V(0.05, 0.05, -0.005), V(0.062, 0.045, -0.02), V(0.064, 0.02, -0.03)], 0.0035, 14), metal(0x6a7078, 0.4))); // rafter hook on the body
    inner.add(body([[0.072, 0.028, 0.034], [0.082, 0.024, 0.03], [0.088, 0.012, 0.016]], plastic(0x2a2e34, 0.6), V(0, 1, 0), 16)); // rear motor cap
    for (let i = 0; i < 5; i++) inner.add(at(box(0.05, 0.003, 0.006, plastic(0x14161a, 0.7)), 0, 0.012 - i * 0.008, 0.078)); // vents
    inner.add(at(alongZ(cyl(0.02, 0.02, 0.006, rubberM(), 14)), 0, 0.0, 0.092)); // rubber bumper
    inner.add(at(alongZ(cyl(0.008, 0.008, 0.02, metal(BRASS, 0.3), 10)), 0.02, -0.03, 0.09)); // air fitting + coiled hose
    inner.add(new THREE.Mesh(hose([V(0.02, -0.03, 0.1), V(0.04, -0.05, 0.14), V(0.07, -0.08, 0.18), V(0.08, -0.13, 0.24), V(0.06, -0.18, 0.32)], 0.0075), rubberM()));
    const decal = box(0.002, 0.026, 0.07, texMat(labelTex(['CARTEL-PRO', 'FN-90 · 18V FRAMING'], '#1a1a1a', '#ffb060', '#e07820'), { roughness: 0.5 })); decal.position.set(0.041, 0.01, -0.06); decal.rotation.y = Math.PI / 2; inner.add(decal);
    // nose: cast housing, contact tip, no-mar pad
    inner.add(at(box(0.036, 0.11, 0.05, alu()), 0, -0.02, -0.185));
    inner.add(at(alongZ(cyl(0.009, 0.009, 0.05, metal(0x444c56, 0.4), 10)), 0, -0.002, -0.235));
    inner.add(at(box(0.024, 0.03, 0.022, dark), 0, -0.07, -0.2));
    inner.add(at(box(0.03, 0.012, 0.03, rubberM()), 0, -0.088, -0.2));
    // angled magazine with the nail strip window
    const mag = box(0.028, 0.044, 0.2, metal(0x39404a, 0.5)); mag.position.set(0, -0.105, -0.095); mag.rotation.x = -0.38; inner.add(mag);
    const magRail = box(0.032, 0.008, 0.2, metal(0x2a3038, 0.5)); magRail.position.set(0, -0.128, -0.09); magRail.rotation.x = -0.38; inner.add(magRail);
    for (let i = 0; i < 12; i++) { const h = cyl(0.0045, 0.0045, 0.002, metal(0xd8dce4, 0.3), 8); h.rotation.z = Math.PI / 2; h.position.set(0.0155, -0.098 - i * 0.006, -0.185 + i * 0.015); inner.add(h); }
    // grip with rubber overmould ridges, trigger, guard, battery pack under the grip
    const gripB = box(0.036, 0.1, 0.05, rubberM()); gripB.position.set(0, -0.06, 0.06); gripB.rotation.x = 0.28; inner.add(gripB);
    for (let i = 0; i < 6; i++) { const rd = box(0.038, 0.003, 0.052, mat(0x3a3e44, { roughness: 0.9 })); rd.position.set(0, -0.025 - i * 0.014, 0.05 + i * 0.004); rd.rotation.x = 0.28; inner.add(rd); }
    const trig = box(0.01, 0.03, 0.008, metal(0x9aa0a8, 0.4)); trig.position.set(0, -0.04, 0.02); trig.rotation.x = 0.3; inner.add(trig);
    inner.add(bar(V(0, -0.082, 0.0), V(0, -0.082, 0.05), 0.003, 0.003, metal(DARK, 0.5), 6));
    const batt = box(0.046, 0.026, 0.07, plastic(0x1e2126, 0.55)); batt.position.set(0, -0.118, 0.085); inner.add(batt);
    inner.add(at(box(0.05, 0.006, 0.02, plastic(0xe07820)), 0, -0.107, 0.12));
    const battLbl = box(0.002, 0.02, 0.05, texMat(labelTex(['18V', 'LITHIUM'], '#e07820', '#1a1a1a', '#1a1a1a'), { roughness: 0.5 })); battLbl.position.set(0.029, -0.125, 0.085); battLbl.rotation.y = Math.PI / 2; inner.add(battLbl);
    const R = buildHand({ side: 'R', grip: V(0, -0.06, 0.072), elbow: V(0.17, -0.29, 0.3), radius: 0.027, axis: V(0, 1, 0.3).normalize(), curl: 0.95, trigger: V(0, -0.04, 0.02) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', mode: 'support', grip: V(0, -0.12, -0.165), radius: 0.024, axis: V(0, 0, 1), watch: true }).group); // under the nose housing, fingers up its side
    inner.add(off);
    g.add(inner);
    g.scale.setScalar(0.9); g.position.set(0.0, -0.01, -0.03);
    return finish(g, 'nailgun', -0.14, V(0, 0.0, -0.26), { pos: V(0.0, -0.15, -0.8), rotX: -0.06, rotY: 0.0 }, { trigger: R.trigger, offHand: off });
}

/** shoulder-fired roller launcher: turned tube with a bell, sight rail, foregrip, stock, tank */
export function buildRollerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.06;
    const tubeM = alu();
    const tube = lathe([[0.05, 0.14], [0.055, 0.1], [0.055, -0.1], [0.06, -0.17], [0.072, -0.2], [0.075, -0.22]], tubeM, 24); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.02, 0); inner.add(tube);
    for (const z of [0.05, -0.05, -0.13]) { inner.add(at(alongZ(cyl(0.062, 0.062, 0.014, metal(0x363c44, 0.5), 20)), 0, 0.02, z)); inner.add(at(box(0.012, 0.02, 0.016, metal(0x5a6470, 0.45)), 0, 0.086, z)); }
    inner.add(at(box(0.016, 0.008, 0.26, metal(0x2a3038, 0.5)), 0, 0.09, -0.06)); // sight rail
    inner.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 16), metal(0x9aa0a8, 0.4)), 0, 0.108, -0.17));
    inner.add(at(box(0.004, 0.014, 0.004, metal(0x9aa0a8, 0.4)), 0, 0.1, 0.06));
    inner.add(at(alongZ(cyl(0.042, 0.042, 0.09, texMat(napTex(), { roughness: 1, emissive: 0x442800, emissiveIntensity: 0.35 }), 20)), 0, 0.02, -0.255));
    inner.add(at(alongZ(cyl(0.03, 0.03, 0.01, metal(0x9aa0a8, 0.4), 12)), 0, 0.02, -0.302));
    // tank below, straps, label, gauge, valve, hose
    inner.add(at(alongZ(cyl(0.035, 0.035, 0.11, plastic(0xcc3322, 0.35), 16)), 0, -0.045, 0.02));
    for (const z of [-0.01, 0.05]) inner.add(at(alongZ(cyl(0.037, 0.037, 0.01, rubberM(), 16)), 0, -0.045, z));
    inner.add(at(alongZ(cyl(0.0355, 0.0355, 0.03, texMat(labelTex(['PRESSURE', 'CAUTION · 90 PSI'], '#f2e6c8', '#1a1a1a', '#b02020'), { roughness: 0.6 }), 16)), 0, -0.045, 0.02));
    const gauge = cyl(0.015, 0.015, 0.01, metal(0xd8d0b8, 0.25), 14); gauge.rotation.z = Math.PI / 2; gauge.position.set(0.04, -0.03, 0.0); inner.add(gauge);
    const gface = cyl(0.012, 0.012, 0.002, mat(0xf4f0e0, { roughness: 0.4 }), 14); gface.rotation.z = Math.PI / 2; gface.position.set(0.046, -0.03, 0.0); inner.add(gface);
    const needle = box(0.002, 0.002, 0.016, mat(0xb02020)); needle.position.set(0.047, -0.03, 0.004); needle.rotation.x = 0.6; inner.add(needle);
    inner.add(at(cyl(0.006, 0.006, 0.014, metal(BRASS, 0.3), 8), 0, -0.002, 0.06));
    inner.add(new THREE.Mesh(hose([V(0.0, -0.045, 0.08), V(0.03, -0.07, 0.13), V(0.06, -0.11, 0.2), V(0.08, -0.14, 0.28)], 0.008), rubberM()));
    inner.add(at(alongZ(cyl(0.056, 0.05, 0.02, metal(0x363c44, 0.5), 20)), 0, 0.02, 0.15)); // breech cap
    inner.add(at(box(0.012, 0.05, 0.02, metal(0x9aa0a8, 0.4)), 0.05, 0.03, 0.14)); // latch lever
    inner.add(at(alongZ(cyl(0.058, 0.058, 0.012, rubberM(), 20)), 0, 0.02, 0.135)); // rubber ring
    // foregrip for the off hand, pistol grip, trigger, stock off-screen right
    const fore = cyl(0.014, 0.017, 0.06, rubberM(), 12); fore.position.set(0, -0.06, -0.13); inner.add(fore);
    const gripB = box(0.034, 0.09, 0.05, rubberM()); gripB.position.set(0, -0.06, 0.08); gripB.rotation.x = 0.3; inner.add(gripB);
    const trig = box(0.008, 0.026, 0.008, metal(0x9aa0a8, 0.4)); trig.position.set(0, -0.045, 0.045); trig.rotation.x = 0.3; inner.add(trig);
    const stock = box(0.05, 0.06, 0.16, plastic(0x2a2e34, 0.6)); stock.position.set(0.085, -0.11, 0.24); stock.rotation.set(0.25, -0.2, 0.1); inner.add(stock); // to the shoulder, below and right of the eye
    inner.add(at(box(0.054, 0.07, 0.02, rubberM()), 0.1, -0.135, 0.32));
    const R = buildHand({ side: 'R', grip: V(0, -0.065, 0.09), elbow: V(0.17, -0.29, 0.31), radius: 0.026, axis: V(0, 1, 0.3).normalize(), curl: 0.95, trigger: V(0, -0.045, 0.045) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', mode: 'support', grip: V(0, -0.045, -0.15), radius: 0.06, axis: V(0, 0, 1), watch: true }).group);
    inner.add(off);
    g.add(inner);
    g.scale.setScalar(0.9); g.position.set(0.0, -0.01, -0.03);
    return finish(g, 'roller', -0.12, V(0, 0.08, -0.31), { pos: V(0.02, -0.21, -0.62), rotX: -0.08, rotY: 0.0 }, { trigger: R.trigger, offHand: off });
}

/** gravity-feed spray gun with the cup on top */
export function buildSprayerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.06;
    const aluM = alu();
    // gun body (rounded aluminium block), air cap with horns, nozzle, needle knob, fan knob
    inner.add(body([[0.05, 0.02, 0.026], [0.0, 0.024, 0.03], [-0.06, 0.022, 0.028], [-0.1, 0.018, 0.022]], aluM, V(0, 1, 0), 14));
    inner.add(at(alongZ(cyl(0.018, 0.018, 0.02, metal(0x8a929c, 0.4), 14)), 0, 0.0, -0.115));
    for (const sx of [-1, 1]) inner.add(at(alongZ(cyl(0.006, 0.006, 0.012, metal(0x8a929c, 0.4), 8)), sx * 0.014, 0.0, -0.128));
    inner.add(at(alongZ(cyl(0.005, 0.003, 0.012, mat(0x88ff66, { emissive: 0x226611, emissiveIntensity: 0.6, roughness: 0.3 }), 8)), 0, 0, -0.13));
    const knob = cyl(0.009, 0.009, 0.014, metal(0x9aa0a8, 0.35), 10); knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.0, 0.065); inner.add(knob);
    for (let i = 0; i < 8; i++) { const k = box(0.002, 0.004, 0.012, metal(0x5a6470, 0.5)); const a = i / 8 * Math.PI * 2; k.position.set(Math.cos(a) * 0.009, Math.sin(a) * 0.009, 0.065); k.rotation.z = a; inner.add(k); }
    const fan = cyl(0.007, 0.007, 0.012, metal(0x9aa0a8, 0.35), 10); fan.rotation.z = Math.PI / 2; fan.position.set(0.03, 0.005, -0.04); inner.add(fan);
    // gravity cup on top: lathe with a lid and vent
    const cup = lathe([[0.006, 0.0], [0.03, 0.03], [0.036, 0.06], [0.036, 0.1], [0.03, 0.105], [0.0, 0.105]], plastic(0x9fd08a, 0.35), 18); cup.position.set(0, 0.03, -0.03); inner.add(cup);
    inner.add(at(cyl(0.031, 0.031, 0.006, metal(0x9aa0a8, 0.4), 18), 0, 0.135, -0.03));
    inner.add(at(cyl(0.004, 0.004, 0.012, metal(0x9aa0a8, 0.4), 8), 0.02, 0.142, -0.03));
    inner.add(at(cyl(0.0365, 0.0365, 0.002, mat(0x2a6a2a, { roughness: 0.6 }), 18), 0, 0.085, -0.03)); // fill line
    // long trigger, guard, grip, air fitting + coiled hose
    const trig = box(0.01, 0.04, 0.006, metal(0x9aa0a8, 0.4)); trig.position.set(0, -0.03, -0.005); trig.rotation.x = 0.25; inner.add(trig);
    inner.add(bar(V(0, -0.062, -0.02), V(0, -0.062, 0.03), 0.003, 0.003, metal(DARK, 0.5), 6));
    const gripB = box(0.03, 0.09, 0.04, aluM); gripB.position.set(0, -0.045, 0.045); gripB.rotation.x = 0.25; inner.add(gripB);
    for (let i = 0; i < 4; i++) { const rd = box(0.032, 0.003, 0.042, rubberM()); rd.position.set(0, -0.02 - i * 0.016, 0.037 + i * 0.004); rd.rotation.x = 0.25; inner.add(rd); }
    inner.add(at(cyl(0.008, 0.008, 0.02, metal(BRASS, 0.3), 10), 0, -0.098, 0.06));
    inner.add(new THREE.Mesh(hose([V(0, -0.105, 0.06), V(0.01, -0.13, 0.09), V(0.04, -0.15, 0.13), V(0.06, -0.19, 0.2), V(0.05, -0.24, 0.28)], 0.007), rubberM()));
    const R = buildHand({ side: 'R', grip: V(0, -0.052, 0.055), elbow: V(0.17, -0.28, 0.3), radius: 0.024, axis: V(0, 1, 0.25).normalize(), curl: 0.95, trigger: V(0, -0.03, -0.005) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', mode: 'support', grip: V(0, -0.03, -0.07), radius: 0.026, axis: V(0, 0, 1), watch: true }).group);
    inner.add(off);
    g.add(inner);
    g.scale.setScalar(0.9); g.position.set(0.0, -0.01, -0.03);
    return finish(g, 'sprayer', -0.12, V(0, 0.0, -0.14), { pos: V(0.075, -0.13, -0.62), rotX: -0.05, rotY: 0.1 }, { trigger: R.trigger, offHand: off });
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
