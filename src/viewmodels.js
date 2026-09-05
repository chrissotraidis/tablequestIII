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
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildArm, loft, hose } from './hands.js';

const SKIN = 0xe9b993, SKIN_DARK = 0xd39f7a, SLEEVE = 0x9a8560, SLEEVE_DARK = 0x84714f, CUFF = 0x7d6b4d;
const GLOVE = 0x5a4632, GLOVE_PAD = 0x3f3124, GLOVE_STRAP = 0x3b2d20, THREAD = 0xc8b48a, NAIL = 0xf6e0cc;
const STEEL = 0x8a929c, DARK = 0x2b3038, BRASS = 0xc9a227, RUBBER = 0x1e2126;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0, ...opts });
const metal = (color, rough = 0.35) => mat(color, { roughness: rough, metalness: 0.75 });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const rbox = (w, h, d, r, m, seg = 3) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)), m); // O5: chamfered hard-surface block
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
let _grain = {};
/** P5: plastic grain with scuffs — a colour map plus a matching roughness map (scuffs shinier, grain matte) */
function grainMaps(hex) {
    if (_grain[hex]) return _grain[hex];
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; // sRGB bytes straight from the hex (THREE.Color would hand back linear values)
    const scuffs = []; for (let i = 0; i < 26; i++) scuffs.push([Math.random() * 256, Math.random() * 256, 6 + Math.random() * 40, Math.random() * 6.3, 0.5 + Math.random()]);
    const map = canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + Math.random() * 0.05})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } // grain
        for (const [x, y, len, a, wd] of scuffs) { ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = wd * 0.6; ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 1 + Math.cos(a) * len, y + 1 + Math.sin(a) * len); ctx.stroke(); }
        const grd = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, w * 0.75); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h); // grime toward the edges
    }, [2, 2]);
    map.colorSpace = THREE.SRGBColorSpace;
    const rough = canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '230,230,230'},0.08)`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        for (const [x, y, len, a, wd] of scuffs) { ctx.strokeStyle = 'rgba(30,30,30,0.7)'; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); }
    }, [2, 2]);
    return (_grain[hex] = [map, rough]);
}
const grained = (hex, rough = 0.55, metalness = 0.05) => { const [m, r] = grainMaps(hex); return new THREE.MeshStandardMaterial({ map: m, roughnessMap: r, roughness: rough, metalness }); };
let _brushedR = null;
function brushedRough() { return _brushedR || (_brushedR = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#6a6a6a'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,20' : '200,200,200'},0.25)`; ctx.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 1); } for (let i = 0; i < 12; i++) { ctx.fillStyle = 'rgba(230,230,230,0.5)'; const x = Math.random() * w, y = Math.random() * h; ctx.fillRect(x, y, 3 + Math.random() * 10, 2 + Math.random() * 6); } }, [3, 1])); }
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
    // L3: hand specs (grip frames) expressed in the baked root's space, for the skinned rig
    const handSpecs = [];
    g.traverse(o => {
        const hs = o.userData.handSpec; if (!hs) return;
        const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const nm = new THREE.Matrix3().getNormalMatrix(rel);
        handSpecs.push({ ...hs, grip: hs.grip.clone().applyMatrix4(rel), axis: hs.axis.clone().applyMatrix3(nm).normalize(), out: hs.out ? hs.out.clone().applyMatrix3(nm).normalize() : null, forearm: hs.forearm ? hs.forearm.clone().applyMatrix3(nm).normalize() : null, shoulder: hs.shoulder ? hs.shoulder.clone().applyMatrix4(rel) : null });
    });
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
    baked.userData = { name, baseRotX, muzzle, ads, parts: bakedParts, hands, handSpecs, rigs: [] };
    baked.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.renderOrder = 10; o.layers.set(1); } }); // layer 1: drawn by the viewmodel camera (48° FOV), shadowed by the camera-space key
    return baked;
}

// ---------------------------------------------------------------- weapons (v3, Round 3 G4)

const plastic = (color, rough = 0.48) => mat(color, { roughness: rough, metalness: 0.05 });
const alu = () => texMat(brushedTex(), { roughness: 0.4, metalness: 0.85, roughnessMap: brushedRough() });
const rubberM = () => mat(RUBBER, { roughness: 0.92 });
/** rounded body lofted along -Z: sections [[z, rx, ry], ...] */
function body(sections, m, up = V(0, 1, 0), segs = 18) {
    const st = sections.map(([z, rx, ry]) => ({ p: V(0, 0, z), rx, ry }));
    return new THREE.Mesh(loft(st, segs, { up }), m);
}

/** the cover's brush: long flat wooden handle, chamfered flat ferrule, layered flat bristles loaded with blue */
export function buildBrushViewmodel() {
    // T1: a real 3" sash brush — turned varnished handle, crimped brass ferrule with rivets, a dense three-layer bristle
    // block, and a glossy paint load that wraps the tip, sags, and drips; smears on the ferrule and splatter on the handle
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.rotation.set(0.55, 0.1, -0.05); g.add(inner); // head up-forward 32°: the root's rotation is driven per frame, so the rake lives here
    const wood = texMat(woodTex(), { roughness: 0.32, metalness: 0.0 });
    // handle along -Z: hang-hole knob at the rear, waist under the fingers, flare into the ferrule (lathe, flattened)
    const handle = lathe([[0.0, -0.15], [0.009, -0.148], [0.013, -0.135], [0.016, -0.11], [0.014, -0.07], [0.0125, -0.03], [0.014, 0.02], [0.018, 0.06], [0.022, 0.085], [0.0, 0.09]], wood, 24);
    handle.rotation.x = -Math.PI / 2; handle.scale.set(1.75, 1, 1); inner.add(handle);
    const hole = cyl(0.004, 0.004, 0.034, mat(0x1a1410), 8); hole.rotation.z = Math.PI / 2; hole.position.set(0, 0, 0.135); inner.add(hole);
    for (let i = 0; i < 5; i++) { const chip = box(0.006 + Math.random() * 0.006, 0.0015, 0.004 + Math.random() * 0.01, mat(0xc9b48e, { roughness: 0.85 })); const a = i * 1.9; chip.position.set(Math.cos(a) * 0.024, Math.sin(a) * 0.013, 0.02 + i * 0.022); chip.rotation.z = a; inner.add(chip); } // varnish chips
    const label = box(0.03, 0.0125, 0.03, texMat(labelTex(['ARTISAN', 'No. 7 · FLAT SASH'], '#efe6d2', '#2a1a10', '#8a1422'), { roughness: 0.5 })); label.position.set(0, 0, 0.045); label.scale.set(1.4, 1.02, 1); inner.add(label);
    for (let i = 0; i < 9; i++) { const sp = sph(0.002 + Math.random() * 0.003, mat(0x2f62d8, { roughness: 0.25 }), 6, 5); sp.scale.set(1, 0.35, 1); const a = i * 2.4; sp.position.set(Math.cos(a) * 0.026, 0.0135 * Math.sign(Math.sin(a) + 0.3), -0.02 + i * 0.012); inner.add(sp); } // old splatter on the handle
    // head part: ferrule, crimp ridges, rivets, bristle block, bristle strands, paint load, drips
    const head = new THREE.Group(); head.position.z = -0.09;
    const brass = metal(0xc9a227, 0.28), brassD = metal(0x9a7a1a, 0.4);
    const ferrule = rbox(0.082, 0.024, 0.06, 0.004, brass); ferrule.position.z = -0.022; head.add(ferrule);
    const chamfer = rbox(0.076, 0.03, 0.014, 0.003, brass); chamfer.position.set(0, 0, 0.012); head.add(chamfer);
    for (const z of [-0.04, -0.034, -0.014]) { const c = rbox(0.085, 0.026, 0.003, 0.001, brassD); c.position.z = z; head.add(c); } // crimps
    for (const sx of [-1, 1]) for (const z of [-0.03, -0.005]) { const rv = sph(0.0032, metal(0x6a6a66, 0.35), 8, 6); rv.scale.set(1, 0.6, 1); rv.position.set(sx * 0.028, 0.0125, z); head.add(rv); const rv2 = rv.clone(); rv2.position.y = -0.0125; head.add(rv2); } // rivets both faces
    for (let i = 0; i < 4; i++) { const sm = sph(0.006 + Math.random() * 0.004, mat(0x2f62d8, { roughness: 0.2, emissive: 0x0f2a80, emissiveIntensity: 0.25 }), 8, 6); sm.scale.set(1.6, 0.25, 1.1); sm.position.set(-0.03 + i * 0.02, 0.0125, -0.03 + (i % 2) * 0.012); head.add(sm); } // paint smears up the ferrule
    // bristles: one solid, slightly flaring slab with a striated bristle map (no gaps), fuzz strands only at the tip edge
    const bristleTex = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#8a7350'; ctx.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 1) { const t = Math.random(); ctx.fillStyle = t < 0.35 ? 'rgba(40,28,14,0.5)' : t < 0.7 ? 'rgba(200,175,130,0.45)' : 'rgba(120,95,60,0.4)'; ctx.fillRect(x, 0, 1, h); } for (let i = 0; i < 300; i++) { ctx.fillStyle = 'rgba(30,20,10,0.35)'; ctx.fillRect(Math.random() * w, Math.random() * h, 1, 6 + Math.random() * 20); } }, [3, 1]);
    bristleTex.colorSpace = THREE.SRGBColorSpace;
    const bristleMat = new THREE.MeshStandardMaterial({ map: bristleTex, roughness: 0.97, metalness: 0 });
    const slab = new THREE.Mesh(loft([{ p: V(0, 0, -0.044), rx: 0.038, ry: 0.0115 }, { p: V(0, 0, -0.08), rx: 0.0385, ry: 0.0105 }, { p: V(0, 0, -0.115), rx: 0.04, ry: 0.0085 }, { p: V(0, 0, -0.142), rx: 0.042, ry: 0.006 }, { p: V(0, -0.001, -0.153), rx: 0.043, ry: 0.0035 }], 22), bristleMat); head.add(slab);
    const bristleT = mat(0x6b5a3e, { roughness: 0.95 });
    for (let i = 0; i < 26; i++) { const x = -0.04 + i * 0.0032, y = (i % 2 ? 0.003 : -0.003); head.add(bar(V(x, y, -0.135), V(x + (i % 3 - 1) * 0.0015, y * 1.8, -0.158 - (i % 4) * 0.002), 0.0009, 0.0006, i % 2 ? bristleT : mat(0x3a5aa8, { roughness: 0.5 }), 5)); } // tip fuzz, half of it paint-tinted
    // paint: a glossy blue shell over the last third of the bristles, a sag underneath, drips of four lengths with beads
    const paintM = mat(0x2f62d8, { emissive: 0x0f2a80, emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.05 });
    const load = new THREE.Mesh(loft([{ p: V(0, 0, -0.098), rx: 0.0395, ry: 0.0112 }, { p: V(0, -0.0005, -0.118), rx: 0.0425, ry: 0.0125 }, { p: V(0, -0.0015, -0.14), rx: 0.0445, ry: 0.0105 }, { p: V(0, -0.003, -0.156), rx: 0.044, ry: 0.0065 }, { p: V(0, -0.004, -0.162), rx: 0.038, ry: 0.003 }], 24), paintM); head.add(load);
    const sag = sph(0.014, paintM, 12, 8); sag.scale.set(2.4, 0.6, 1.2); sag.position.set(0.004, -0.011, -0.138); head.add(sag);
    for (const [x, len, r] of [[-0.026, 0.036, 0.0036], [-0.008, 0.055, 0.0044], [0.012, 0.028, 0.0031], [0.03, 0.045, 0.0039]]) { // drips with beads
        head.add(bar(V(x, -0.012, -0.136), V(x + 0.002, -0.012 - len, -0.132), r, r * 0.55, paintM, 7));
        const d = sph(r * 1.55, paintM, 8, 6); d.scale.set(1, 1.45, 1); d.position.set(x + 0.002, -0.012 - len, -0.132); head.add(d);
    }
    for (let i = 0; i < 6; i++) { const fl = sph(0.0025, paintM, 6, 5); fl.scale.set(1.4, 0.3, 1); fl.position.set(-0.03 + i * 0.012, (i % 2 ? 1 : -1) * 0.0105, -0.07 - (i % 3) * 0.01); head.add(fl); } // flecks on the bristles
    inner.add(head);
    // right hand on the handle waist (grip spec only — hands are parked, see docs/modern/HANDS_REINTRODUCTION.md)
    const R = buildHand({ side: 'R', grip: V(0, -0.003, 0.035), elbow: V(0.16, -0.31, 0.32), radius: 0.015, axis: V(0, 0, -1), curl: 0.95, forearm: V(0, 0.2, 0.98) });
    inner.add(R.group);
    const off = new THREE.Group(); inner.add(off); // the brush is one-handed; empty part kept for the animator
    g.position.set(0.05, -0.09, -0.02); g.scale.setScalar(0.92); // handle end behind the bench
    return finish(g, 'paintbrush', 0.0, V(0, 0.0, -0.24), { pos: V(0.04, -0.1, -0.5), rotX: 0.2, rotY: -0.05 }, { head, offHand: off });
}

export function buildLegViewmodel() {
    // Q3: the whole leg is built on one axis (legG local +Y from the taped grip up to the torn-off plate), then tilted once
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.07; inner.rotation.z = 0.5; inner.rotation.x = -0.15; // club hold: the leg rises to the upper left, foot end away from the lens
    const legG = new THREE.Group(); legG.rotation.x = -Math.PI / 3 + 0.2; inner.add(legG);
    const wood = texMat(woodTex(), { roughness: 0.5 });
    const leg = lathe([[0.0, -0.02], [0.03, -0.02], [0.036, 0.0], [0.03, 0.03], [0.026, 0.06], [0.034, 0.08], [0.026, 0.1], [0.02, 0.2], [0.024, 0.3], [0.03, 0.42], [0.036, 0.5], [0.036, 0.54], [0.0, 0.54]], wood, 20); legG.add(leg);
    // metal top plate with a hanger bolt and bent nails where it tore off the table
    legG.add(at(cyl(0.04, 0.04, 0.006, alu(), 16), 0, 0.543, 0));
    legG.add(at(cyl(0.006, 0.006, 0.05, metal(0x8a929c, 0.45), 8), 0, 0.57, 0));
    for (let i = 0; i < 4; i++) { const sc = sph(0.004, metal(0x6a7078, 0.5), 6, 5); const a = i / 4 * Math.PI * 2; sc.position.set(Math.cos(a) * 0.03, 0.548, Math.sin(a) * 0.03); legG.add(sc); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1; const base = V(Math.cos(a) * 0.032, 0.5 + i * 0.012, Math.sin(a) * 0.032); const n1 = base.clone().add(V(Math.cos(a) * 0.015, 0.02, Math.sin(a) * 0.015)), n2 = n1.clone().add(V(Math.cos(a + 1) * 0.012, 0.008, Math.sin(a + 1) * 0.012)); legG.add(bar(base, n1, 0.0025, 0.002, metal(0x9aa0a8, 0.5), 6)); legG.add(bar(n1, n2, 0.002, 0.0015, metal(0x8a929c, 0.5), 6)); }
    for (let i = 0; i < 4; i++) { const sc = box(0.012, 0.02, 0.004, mat(0x4a2e14, { roughness: 0.9 })); const a = i * 1.7; sc.position.set(Math.cos(a) * 0.024, 0.16 + i * 0.07, Math.sin(a) * 0.024); sc.rotation.y = -a; legG.add(sc); } // scuffs on the shaft
    // taped grip at the foot end, brass ferrule at the tip
    legG.add(at(cyl(0.04, 0.04, 0.11, texMat(tapeTex(), { roughness: 0.95 }), 16), 0, 0.075, 0));
    legG.add(at(cyl(0.041, 0.041, 0.018, metal(BRASS, 0.35), 16), 0, 0.005, 0));
    for (let i = 0; i < 7; i++) { const fr = box(0.006, 0.012 + Math.random() * 0.01, 0.0015, mat(0x2a2a2e, { roughness: 0.95 })); const a = i * 0.9; fr.position.set(Math.cos(a) * 0.041, 0.132 + (i % 2) * 0.006, Math.sin(a) * 0.041); fr.rotation.y = -a; fr.rotation.z = (i % 2 ? 0.4 : -0.3); legG.add(fr); } // T5: fraying tape edge
    for (let i = 0; i < 6; i++) { const sp = bar(V(Math.cos(i * 1.1) * 0.03, 0.5 + i * 0.004, Math.sin(i * 1.1) * 0.03), V(Math.cos(i * 1.1) * 0.045, 0.53 + i * 0.008, Math.sin(i * 1.1) * 0.045), 0.003, 0.001, mat(0xd9c49a, { roughness: 0.9 }), 5); legG.add(sp); } // splinters where the plate tore off
    for (let i = 0; i < 6; i++) { const ch = box(0.008 + Math.random() * 0.008, 0.0015, 0.005 + Math.random() * 0.01, mat(0xd8c49c, { roughness: 0.85 })); const a = i * 1.3; ch.position.set(Math.cos(a) * 0.027, 0.18 + i * 0.05, Math.sin(a) * 0.027); ch.rotation.y = -a; legG.add(ch); } // varnish chips
    legG.add(buildHand({ side: 'R', grip: V(0, 0.075, 0), radius: 0.04, axis: V(0, 1, 0), out: V(-0.37, 0, 0.93), curl: 0.9, forearm: V(0.415, -0.49, -0.77) }).group); // right hand on the tape, knuckles toward the lens, thumb up the shaft, forearm down the shaft's line
    g.add(inner);
    g.scale.setScalar(0.62); g.position.set(0.13, -0.13, 0.02); // S1: floating leg — the taped grip rises from behind the bench
    return finish(g, 'tableLeg', 0, V(0, 0.2, -0.3));
}

/** O5: cordless framing nailer as a hard-surface object built around the canonical grip.
 *  Layout (tool space, −Z forward, metres): raked pistol grip (top forward), long two-tone body above it,
 *  vertical nose housing at the front, 15° magazine from the nose back under the grip, battery under the grip.
 *  The right hand's palm sits on the grip's rear face; the left supports under the nose. */
export function buildNailgunViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.05;
    const orange = grained(0xe07a22, 0.5), orangeD = plastic(0xb85f14, 0.55), dark = grained(0x2a2e34, 0.62), darkL = plastic(0x3a4048, 0.55);
    const RAKE = -0.28; // grip top forward
    // ---- body: upper orange shell over a dark lower casting, rear motor cap, seams and screws
    inner.add(at(rbox(0.076, 0.07, 0.25, 0.014, orange), 0, 0.045, -0.02));
    inner.add(at(rbox(0.07, 0.04, 0.23, 0.01, dark), 0, -0.005, -0.015));
    inner.add(at(rbox(0.05, 0.05, 0.03, 0.008, orangeD), 0, 0.04, -0.15)); // shell tapers into the nose
    const shellEnd = sph(0.036, orange, 20, 12); shellEnd.scale.set(1.05, 0.95, 0.5); shellEnd.position.set(0, 0.045, 0.1); inner.add(shellEnd); // the orange shell rounds off the rear
    const cap = alongZ(cyl(0.02, 0.018, 0.016, darkL, 16)); cap.position.set(0, 0.045, 0.118); inner.add(cap); // small vented motor cap
    for (let i = 0; i < 4; i++) inner.add(at(box(0.026, 0.002, 0.004, plastic(0x14161a, 0.7)), 0, 0.052 - i * 0.005, 0.127)); // motor vents
    for (const sx of [-1, 1]) {
        inner.add(at(box(0.002, 0.03, 0.2, plastic(0x1a1c20, 0.7)), sx * 0.0385, 0.015, -0.02)); // shell/casting seam
        for (const [y, z] of [[0.055, 0.06], [0.055, -0.08], [0.01, 0.0], [0.01, -0.1]]) { const sc = cyl(0.0045, 0.0045, 0.003, metal(0x7a8088, 0.4), 6); sc.rotation.z = Math.PI / 2; sc.position.set(sx * 0.0385, y, z); inner.add(sc); }
    }
    inner.add(at(rbox(0.05, 0.012, 0.09, 0.004, orangeD), 0, 0.085, -0.03)); // top spine
    inner.add(at(cyl(0.016, 0.018, 0.014, metal(0x444c56, 0.45), 14), 0, 0.09, 0.04)); // exhaust deflector
    inner.add(at(cyl(0.019, 0.019, 0.004, metal(0x2a3038, 0.5), 14), 0, 0.099, 0.04));
    inner.add(new THREE.Mesh(hose([V(0.03, 0.07, 0.02), V(0.05, 0.1, 0.0), V(0.062, 0.09, -0.03), V(0.06, 0.06, -0.045)], 0.0035, 14), metal(0x8a9098, 0.4))); // rafter hook
    const decal = box(0.002, 0.03, 0.09, texMat(labelTex(['CARTEL-PRO', 'FN-90 · 18V FRAMING'], '#1a1a1a', '#ffb060', '#e07820'), { roughness: 0.5 })); decal.position.set(0.0392, 0.045, -0.02); decal.rotation.y = Math.PI / 2; inner.add(decal);
    const decalL = decal.clone(); decalL.position.x = -0.0392; decalL.rotation.y = -Math.PI / 2; inner.add(decalL);
    // ---- nose: cast aluminium drive housing, depth dial, LED, contact tip with no-mar pad
    inner.add(at(rbox(0.042, 0.17, 0.05, 0.006, alu()), 0, -0.03, -0.165));
    inner.add(at(rbox(0.046, 0.03, 0.054, 0.005, dark), 0, 0.03, -0.165)); // clamp block
    const dial = cyl(0.012, 0.012, 0.012, metal(0x9aa0a8, 0.35), 12); dial.rotation.x = Math.PI / 2; dial.position.set(0.0, 0.0, -0.196); inner.add(dial);
    for (let i = 0; i < 8; i++) { const k = box(0.002, 0.005, 0.006, metal(0x5a6470, 0.5)); const a = i / 8 * Math.PI * 2; k.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.196); k.rotation.z = a; inner.add(k); }
    const led = sph(0.004, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 2, roughness: 0.3 }), 8, 6); led.position.set(0.018, -0.05, -0.192); inner.add(led);
    const glow = at(cyl(0.007, 0.007, 0.001, mat(0xfff4d0, { emissive: 0xffe6a0, emissiveIntensity: 0.9, transparent: true, opacity: 0.55 }), 12), 0.018, -0.05, -0.194); glow.rotation.x = Math.PI / 2; inner.add(glow); // (never chain .rotation on add(): it returns the group)
    inner.add(at(alongZ(cyl(0.008, 0.008, 0.04, metal(0x444c56, 0.4), 10)), 0, -0.02, -0.21));
    inner.add(at(rbox(0.026, 0.035, 0.024, 0.004, dark), 0, -0.13, -0.165)); // contact tip
    inner.add(at(rbox(0.03, 0.012, 0.03, 0.003, rubberM()), 0, -0.152, -0.165)); // no-mar pad
    for (let i = 0; i < 4; i++) inner.add(at(box(0.03, 0.002, 0.002, plastic(0x0e1012, 0.9)), 0, -0.155, -0.176 + i * 0.007)); // pad teeth
    // ---- magazine: 15° from the nose foot back under the grip, nail-strip window, pusher
    const magT = 0.25;
    const mag = rbox(0.03, 0.046, 0.27, 0.005, metal(0x39404a, 0.5)); mag.position.set(0, -0.115, -0.035); mag.rotation.x = magT; inner.add(mag);
    const magRail = rbox(0.036, 0.008, 0.27, 0.003, metal(0x2a3038, 0.5)); magRail.position.set(0, -0.14, -0.03); magRail.rotation.x = magT; inner.add(magRail);
    const win = box(0.002, 0.024, 0.2, mat(0x0a0c10, { roughness: 0.4 })); win.position.set(0.0155, -0.115, -0.035); win.rotation.x = magT; inner.add(win);
    for (let i = 0; i < 14; i++) { const h = cyl(0.0042, 0.0042, 0.002, metal(0xd8dce4, 0.3), 8); h.rotation.z = Math.PI / 2; const t = -0.13 + i * 0.015; h.position.set(0.0165, -0.115 - Math.sin(magT) * t, -0.035 + Math.cos(magT) * t); inner.add(h); }
    const pusher = rbox(0.034, 0.02, 0.03, 0.003, plastic(0xe07a22, 0.5)); pusher.position.set(0, -0.10, 0.08); pusher.rotation.x = magT; inner.add(pusher);
    inner.add(at(box(0.016, 0.006, 0.004, metal(0x9aa0a8, 0.4)), 0.02, -0.105, 0.075));
    // ---- grip: raked rubber overmould with a finger-groove front, trigger, guard, battery
    const overmould = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (ctx, w, h) => { ctx.fillStyle = '#1e2126'; ctx.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x + 4, y + 4, 2.6, 0, 6.3); ctx.fill(); } }, [3, 6]), roughness: 0.92, metalness: 0 }); // T2: dimpled rubber overmould
    const gripB = rbox(0.034, 0.11, 0.046, 0.009, overmould); gripB.position.set(0, -0.06, 0.075); gripB.rotation.x = RAKE; inner.add(gripB);
    const warn = box(0.002, 0.018, 0.034, texMat(labelTex(['⚠ WARNING', 'EYE PROTECTION'], '#f2c811', '#1a1a1a', '#1a1a1a'), { roughness: 0.55 })); warn.position.set(-0.0392, 0.035, 0.03); warn.rotation.y = -Math.PI / 2; inner.add(warn);
    for (let i = 0; i < 5; i++) { const wr = box(0.0015, 0.004 + Math.random() * 0.01, 0.002, metal(0xb8bcc2, 0.35)); wr.position.set(0.0215, -0.03 - i * 0.02, -0.165 - 0.02 + (i % 2) * 0.03); inner.add(wr); } // bright wear on the nose casting edges
    for (let i = 0; i < 4; i++) { const grv = rbox(0.036, 0.006, 0.02, 0.002, mat(0x3a3e44, { roughness: 0.9 })); const y = -0.03 - i * 0.017; grv.position.set(0, y, 0.075 - 0.02 + Math.sin(RAKE) * (y + 0.06)); grv.rotation.x = RAKE; inner.add(grv); } // finger grooves on the front
    const backstrap = rbox(0.03, 0.1, 0.008, 0.003, plastic(0x1e2126, 0.55)); backstrap.position.set(0, -0.058, 0.098); backstrap.rotation.x = RAKE; inner.add(backstrap);
    const trig = new THREE.Mesh(loft([{ p: V(0, -0.012, 0.038), rx: 0.006, ry: 0.004 }, { p: V(0, -0.032, 0.034), rx: 0.006, ry: 0.004 }, { p: V(0, -0.045, 0.04), rx: 0.005, ry: 0.003 }], 8, { up: V(0, 0, 1) }), metal(0x9aa0a8, 0.4)); inner.add(trig);
    const guardPts = [V(0, -0.015, 0.025), V(0, -0.055, 0.02), V(0, -0.07, 0.035), V(0, -0.075, 0.055)];
    inner.add(new THREE.Mesh(hose(guardPts, 0.0035, 16), metal(DARK, 0.5)));
    const batt = rbox(0.052, 0.03, 0.085, 0.006, plastic(0x1e2126, 0.55)); batt.position.set(0, -0.128, 0.095); inner.add(batt);
    inner.add(at(rbox(0.054, 0.008, 0.024, 0.003, plastic(0xe07a22)), 0, -0.116, 0.13)); // release latch
    const battLbl = box(0.002, 0.02, 0.06, texMat(labelTex(['18V', 'LITHIUM'], '#e07820', '#1a1a1a', '#1a1a1a'), { roughness: 0.5 })); battLbl.position.set(0.0265, -0.13, 0.095); battLbl.rotation.y = Math.PI / 2; inner.add(battLbl);
    for (let i = 0; i < 3; i++) inner.add(at(sph(0.003, mat(i < 2 ? 0x44ff66 : 0x224422, { emissive: i < 2 ? 0x22ff44 : 0x000000, emissiveIntensity: 1.2 }), 8, 6), -0.012 + i * 0.012, -0.112, 0.06)); // charge LEDs
    // ---- hands: palm on the grip's rear face (thumb up the rake), off hand cupped under the nose foot
    const gripAxis = V(0, Math.cos(RAKE), Math.sin(RAKE)).normalize();
    const R = buildHand({ side: 'R', grip: V(0, -0.058, 0.075), radius: 0.022, axis: gripAxis, curl: 0.95, trigger: V(0, -0.03, 0.036) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', mode: 'support', grip: V(0, -0.11, -0.15), radius: 0.026, axis: V(0, 0, -1), watch: true }).group);
    inner.add(off);
    g.add(inner);
    g.scale.setScalar(0.9); g.position.set(0.02, -0.075, -0.02); g.rotation.y = 0.26; g.rotation.z = -0.12; g.rotation.x = 0.06; // S1: floating weapon — the grip sits behind the bench // low-right, yawed in so the muzzle meets the crosshair and the left flank shows
    return finish(g, 'nailgun', -0.1, V(0, 0.0, -0.26), { pos: V(0.0, -0.13, -0.5), rotX: 0.0, rotY: -0.18 }, { trigger: R.trigger, offHand: off });
}

/** O5: shoulder-fired roller launcher as a hard-surface object: turned tube with a breech cap and muzzle bell, sight rail,
 *  vertical foregrip (left hand), raked pistol grip (right hand), stock to the shoulder, pressure tank below, roller rack. */
export function buildRollerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.06;
    const tubeM = alu(), dark = plastic(0x2a2e34, 0.6), darkL = metal(0x3a4048, 0.5);
    const TY = 0.02; // tube axis height
    // ---- tube, bands, breech cap, muzzle bell
    inner.add(at(alongZ(cyl(0.05, 0.05, 0.34, tubeM, 28)), 0, TY, -0.04));
    for (const z of [0.08, -0.02, -0.12]) inner.add(at(alongZ(cyl(0.053, 0.053, 0.014, darkL, 28)), 0, TY, z));
    const bell = lathe([[0.05, -0.2], [0.056, -0.23], [0.066, -0.255], [0.07, -0.265], [0.06, -0.265], [0.05, -0.245], [0.046, -0.2]], tubeM, 28); bell.rotation.x = Math.PI / 2; bell.position.set(0, TY, 0); inner.add(bell);
    inner.add(at(alongZ(cyl(0.044, 0.044, 0.06, texMat(napTex(), { roughness: 1 }), 24)), 0, TY, -0.235)); // the roller loaded in the bore
    const bellPaint = mat(0x2f62d8, { roughness: 0.12, emissive: 0x0f2a80, emissiveIntensity: 0.3 });
    for (const [a, len, r] of [[3.4, 0.035, 0.0035], [3.9, 0.06, 0.004], [4.4, 0.025, 0.003], [2.9, 0.045, 0.0032]]) { // T4: paint runs down from the bell lip
        const x = Math.cos(a) * 0.068, y = TY + Math.sin(a) * 0.068;
        inner.add(bar(V(x, y, -0.255), V(x, y - len, -0.25), r, r * 0.6, bellPaint, 6));
        const bead = sph(r * 1.5, bellPaint, 7, 5); bead.scale.set(1, 1.4, 1); bead.position.set(x, y - len, -0.25); inner.add(bead);
    }
    inner.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.004, 8, 28), bellPaint), 0, TY, -0.262)); // wet ring inside the bell lip
    const tubeLbl = box(0.002, 0.024, 0.07, texMat(labelTex(['ROLLER-MATIC', 'MK II · 90 PSI'], '#e8e0c8', '#1a1a1a', '#b02020'), { roughness: 0.55 })); tubeLbl.position.set(0.051, TY + 0.01, 0.0); tubeLbl.rotation.y = Math.PI / 2; inner.add(tubeLbl);
    inner.add(at(alongZ(cyl(0.054, 0.05, 0.03, darkL, 28)), 0, TY, 0.145)); // breech cap
    const bdome = sph(0.05, darkL, 28, 14); bdome.scale.set(1, 1, 0.35); bdome.position.set(0, TY, 0.16); inner.add(bdome); // domed
    inner.add(at(rbox(0.02, 0.012, 0.05, 0.003, metal(0x9aa0a8, 0.4)), 0.055, TY + 0.02, 0.12)); // latch lever
    inner.add(at(alongZ(cyl(0.056, 0.056, 0.012, rubberM(), 28)), 0, TY, 0.125)); // rubber ring
    // ---- sight rail with a ring sight and a blade
    inner.add(at(rbox(0.018, 0.01, 0.3, 0.003, dark), 0, TY + 0.06, -0.05));
    for (let i = 0; i < 8; i++) inner.add(at(box(0.02, 0.003, 0.012, plastic(0x14161a, 0.7)), 0, TY + 0.066, -0.18 + i * 0.036)); // rail slots
    inner.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0022, 8, 20), metal(0x9aa0a8, 0.4)), 0, TY + 0.085, 0.09));
    inner.add(at(box(0.003, 0.02, 0.003, metal(0x9aa0a8, 0.4)), 0, TY + 0.075, 0.09));
    inner.add(at(box(0.004, 0.016, 0.004, metal(0x9aa0a8, 0.4)), 0, TY + 0.078, -0.19));
    inner.add(at(sph(0.003, mat(0xff5030, { emissive: 0xff3010, emissiveIntensity: 1.5 }), 8, 6), 0, TY + 0.087, -0.19)); // fibre bead
    // ---- grips: vertical foregrip (left), raked pistol grip (right), trigger + guard
    const fore = rbox(0.03, 0.085, 0.034, 0.008, rubberM()); fore.position.set(0, TY - 0.085, -0.12); inner.add(fore);
    for (let i = 0; i < 4; i++) inner.add(at(rbox(0.032, 0.005, 0.036, 0.002, mat(0x3a3e44, { roughness: 0.9 })), 0, TY - 0.06 - i * 0.016, -0.12));
    inner.add(at(rbox(0.04, 0.02, 0.05, 0.005, dark), 0, TY - 0.045, -0.12)); // foregrip clamp to the tube
    const RAKE = -0.28;
    const gripB = rbox(0.034, 0.1, 0.044, 0.009, rubberM()); gripB.position.set(0, TY - 0.09, 0.075); gripB.rotation.x = RAKE; inner.add(gripB);
    for (let i = 0; i < 4; i++) { const grv = rbox(0.036, 0.006, 0.02, 0.002, mat(0x3a3e44, { roughness: 0.9 })); const y = TY - 0.062 - i * 0.017; grv.position.set(0, y, 0.075 - 0.02 + Math.sin(RAKE) * (y - (TY - 0.09))); grv.rotation.x = RAKE; inner.add(grv); }
    inner.add(at(rbox(0.05, 0.03, 0.09, 0.006, dark), 0, TY - 0.045, 0.06)); // receiver block under the tube
    const trig = new THREE.Mesh(loft([{ p: V(0, TY - 0.045, 0.04), rx: 0.006, ry: 0.004 }, { p: V(0, TY - 0.065, 0.036), rx: 0.006, ry: 0.004 }, { p: V(0, TY - 0.078, 0.042), rx: 0.005, ry: 0.003 }], 8, { up: V(0, 0, 1) }), metal(0x9aa0a8, 0.4)); inner.add(trig);
    inner.add(new THREE.Mesh(hose([V(0, TY - 0.05, 0.025), V(0, TY - 0.09, 0.02), V(0, TY - 0.105, 0.035), V(0, TY - 0.108, 0.055)], 0.0035, 16), metal(DARK, 0.5)));
    // ---- stock: back and right to the shoulder, rubber butt pad
    const stock = rbox(0.05, 0.06, 0.16, 0.012, grained(0x2a2e34, 0.62)); stock.position.set(0.05, TY - 0.12, 0.23); stock.rotation.set(0.5, -0.12, 0.05); inner.add(stock);
    inner.add(at(rbox(0.054, 0.07, 0.02, 0.006, rubberM()), 0.06, TY - 0.165, 0.3));
    const sbar = rbox(0.028, 0.028, 0.1, 0.006, darkL); sbar.position.set(0.02, TY - 0.04, 0.185); sbar.rotation.set(0.5, -0.1, 0); inner.add(sbar); // stock bar down and back from the breech
    // ---- tank under the tube, straps, label, gauge, valve, hose
    inner.add(at(alongZ(cyl(0.034, 0.034, 0.12, plastic(0xcc3322, 0.35), 20)), 0, TY - 0.075, -0.01));
    for (const z of [-0.05, 0.03]) inner.add(at(alongZ(cyl(0.036, 0.036, 0.01, rubberM(), 20)), 0, TY - 0.075, z));
    inner.add(at(alongZ(cyl(0.0345, 0.0345, 0.035, texMat(labelTex(['PRESSURE', 'CAUTION · 90 PSI'], '#f2e6c8', '#1a1a1a', '#b02020'), { roughness: 0.6 }), 20)), 0, TY - 0.075, -0.01));
    const gauge = cyl(0.014, 0.014, 0.01, metal(0xd8d0b8, 0.25), 14); gauge.rotation.z = Math.PI / 2; gauge.position.set(0.04, TY - 0.06, 0.04); inner.add(gauge);
    const gface = cyl(0.011, 0.011, 0.002, mat(0xf4f0e0, { roughness: 0.4 }), 14); gface.rotation.z = Math.PI / 2; gface.position.set(0.046, TY - 0.06, 0.04); inner.add(gface);
    const needle = box(0.002, 0.002, 0.014, mat(0xb02020)); needle.position.set(0.047, TY - 0.06, 0.044); needle.rotation.x = 0.6; inner.add(needle);
    inner.add(at(cyl(0.006, 0.006, 0.014, metal(BRASS, 0.3), 8), 0, TY - 0.035, 0.05));
    inner.add(new THREE.Mesh(hose([V(0.0, TY - 0.075, 0.06), V(0.03, TY - 0.1, 0.12), V(0.06, TY - 0.14, 0.2), V(0.08, TY - 0.17, 0.28)], 0.008), rubberM()));
    // ---- roller rack on the left flank: three spare rollers in spring clips
    for (let i = 0; i < 3; i++) {
        const z = -0.02 + i * 0.05;
        inner.add(at(alongZ(cyl(0.02, 0.02, 0.045, texMat(napTex(), { roughness: 1 }), 14)), -0.068, TY + 0.005, z));
        inner.add(at(alongZ(cyl(0.006, 0.006, 0.05, plastic(0x2f62d8, 0.4), 8)), -0.068, TY + 0.005, z));
        inner.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.002, 6, 16), metal(0x9aa0a8, 0.4)), -0.068, TY + 0.005, z));
    }
    // ---- hands: right on the raked grip, left on the vertical foregrip (thumb up the grip toward the tube)
    const gripAxis = V(0, Math.cos(RAKE), Math.sin(RAKE)).normalize();
    const R = buildHand({ side: 'R', grip: V(0, TY - 0.088, 0.075), radius: 0.022, axis: gripAxis, curl: 0.95, trigger: V(0, TY - 0.065, 0.038) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', grip: V(0, TY - 0.088, -0.12), radius: 0.018, axis: V(0, 1, 0), curl: 0.95, watch: true }).group);
    inner.add(off);
    g.add(inner);
    g.scale.setScalar(0.9); g.position.set(0.04, -0.075, -0.02); g.rotation.y = 0.2; g.rotation.z = -0.08; // S1: grip behind the bench
    return finish(g, 'roller', -0.08, V(0, 0.08, -0.31), { pos: V(0.0, -0.14, -0.5), rotX: 0.0, rotY: -0.2 }, { trigger: R.trigger, offHand: off });
}

/** O5: gravity-feed HVLP spray gun: cast aluminium body and grip, air cap with horns, knurled needle and fan knobs,
 *  translucent cup on top, long two-finger trigger, air fitting and coiled hose. Right hand on the grip, left cupped under the body. */
export function buildSprayerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); inner.position.y = 0.06;
    const aluM = alu(), steel = metal(0x8a929c, 0.4);
    // ---- body: rounded cast block, front air cap with horns, rear needle knob, side fan knob, air valve underneath
    inner.add(at(rbox(0.034, 0.05, 0.12, 0.009, aluM), 0, 0.0, -0.02));
    inner.add(at(rbox(0.03, 0.03, 0.03, 0.006, aluM), 0, 0.0, -0.09)); // fluid nozzle boss
    inner.add(at(alongZ(cyl(0.019, 0.019, 0.018, steel, 18)), 0, 0.0, -0.112)); // air cap ring
    for (const sx of [-1, 1]) inner.add(at(alongZ(cyl(0.006, 0.0055, 0.014, steel, 10)), sx * 0.015, 0.0, -0.126)); // horns
    inner.add(at(alongZ(cyl(0.0045, 0.003, 0.014, mat(0x88ff66, { emissive: 0x226611, emissiveIntensity: 0.6, roughness: 0.3 }), 8)), 0, 0, -0.128)); // fluid tip
    for (let i = 0; i < 6; i++) { const h = sph(0.0018, mat(0x0a0c10), 5, 4); const a = i / 6 * Math.PI * 2; h.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.121); inner.add(h); } // air holes
    const knob = cyl(0.0095, 0.0095, 0.016, steel, 14); knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.0, 0.048); inner.add(knob);
    for (let i = 0; i < 12; i++) { const k = box(0.0016, 0.004, 0.014, metal(0x5a6470, 0.5)); const a = i / 12 * Math.PI * 2; k.position.set(Math.cos(a) * 0.0095, Math.sin(a) * 0.0095, 0.048); k.rotation.z = a; inner.add(k); } // knurl
    inner.add(at(alongZ(cyl(0.006, 0.006, 0.01, steel, 10)), 0, 0.0, 0.062)); // needle knob stem
    const fan = cyl(0.0075, 0.0075, 0.012, steel, 12); fan.rotation.z = Math.PI / 2; fan.position.set(0.022, 0.006, -0.045); inner.add(fan);
    for (let i = 0; i < 8; i++) { const k = box(0.012, 0.0014, 0.003, metal(0x5a6470, 0.5)); const a = i / 8 * Math.PI * 2; k.position.set(0.022, 0.006 + Math.cos(a) * 0.0075, -0.045 + Math.sin(a) * 0.0075); k.rotation.x = a; inner.add(k); }
    const valve = cyl(0.007, 0.007, 0.012, steel, 12); valve.rotation.z = Math.PI / 2; valve.position.set(0.02, -0.02, 0.02); inner.add(valve);
    const sLbl = at(box(0.002, 0.02, 0.06, texMat(labelTex(['CARTEL', 'HVLP · 1.4'], '#3a3e44', '#e8e8ee', '#1a1a1a'), { roughness: 0.5 })), 0.0175, 0.008, -0.02); sLbl.rotation.y = Math.PI / 2; inner.add(sLbl);
    // ---- gravity cup on top: translucent green polymer, lid, vent, fill line
    const cupM = new THREE.MeshStandardMaterial({ color: 0x9fd08a, roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.85 });
    const cup = lathe([[0.008, 0.0], [0.022, 0.012], [0.032, 0.03], [0.036, 0.06], [0.036, 0.1], [0.033, 0.104], [0.0, 0.104]], cupM, 22); cup.position.set(0, 0.024, -0.035); inner.add(cup);
    inner.add(at(cyl(0.011, 0.011, 0.018, steel, 14), 0, 0.028, -0.035)); // cup neck
    inner.add(at(cyl(0.034, 0.034, 0.008, plastic(0x2a3a2a, 0.5), 22), 0, 0.132, -0.035)); // lid
    inner.add(at(cyl(0.0045, 0.0045, 0.012, steel, 8), 0.02, 0.14, -0.035)); // vent
    inner.add(at(cyl(0.0365, 0.0365, 0.002, mat(0x2a6a2a, { roughness: 0.6 }), 22), 0, 0.08, -0.035)); // fill line
    inner.add(at(cyl(0.0345, 0.0345, 0.04, mat(0x2f62d8, { roughness: 0.25, emissive: 0x0f2a80, emissiveIntensity: 0.3 }), 22), 0, 0.058, -0.035)); // paint inside
    const dripM = mat(0x2f62d8, { roughness: 0.12, emissive: 0x0f2a80, emissiveIntensity: 0.3 });
    for (const [a, len, r] of [[0.3, 0.05, 0.003], [1.4, 0.03, 0.0025], [2.6, 0.065, 0.0035], [4.1, 0.02, 0.002], [5.2, 0.045, 0.003]]) { // T3: dried paint runs down the cup from the rim
        const x = Math.cos(a) * 0.0365, z = -0.035 + Math.sin(a) * 0.0365;
        inner.add(bar(V(x, 0.128, z), V(x, 0.128 - len, z), r, r * 0.6, dripM, 6));
        const bead = sph(r * 1.5, dripM, 7, 5); bead.scale.set(1, 1.4, 1); bead.position.set(x, 0.128 - len, z); inner.add(bead);
    }
    for (let i = 0; i < 4; i++) { const sm = sph(0.004 + Math.random() * 0.003, dripM, 7, 5); sm.scale.set(1.5, 0.3, 1.2); sm.position.set(0.0175, 0.02 - i * 0.012, -0.02 - (i % 2) * 0.03); inner.add(sm); } // smears on the body flank
    inner.add(at(cyl(0.006, 0.009, 0.014, rubberM(), 10), 0, -0.114, 0.033)); // hose strain relief
    // ---- grip: cast aluminium, raked, with a rubber insert; long two-finger trigger; guard; air fitting; coiled hose
    const RAKE = -0.25;
    const gripB = rbox(0.028, 0.095, 0.036, 0.007, aluM); gripB.position.set(0, -0.055, 0.02); gripB.rotation.x = RAKE; inner.add(gripB);
    const insert = rbox(0.03, 0.06, 0.012, 0.003, rubberM()); insert.position.set(0, -0.06, 0.035); insert.rotation.x = RAKE; inner.add(insert);
    const trig = new THREE.Mesh(loft([{ p: V(0, -0.012, -0.012), rx: 0.006, ry: 0.003 }, { p: V(0, -0.04, -0.018), rx: 0.0065, ry: 0.003 }, { p: V(0, -0.062, -0.014), rx: 0.005, ry: 0.0025 }], 8, { up: V(0, 0, 1) }), steel); inner.add(trig);
    inner.add(at(box(0.012, 0.004, 0.02, steel), 0, -0.028, -0.032)); // trigger pivot arm
    inner.add(new THREE.Mesh(hose([V(0, -0.03, -0.035), V(0, -0.075, -0.03), V(0, -0.085, -0.012), V(0, -0.088, 0.004)], 0.003, 14), metal(DARK, 0.5))); // guard
    inner.add(at(cyl(0.008, 0.008, 0.018, metal(BRASS, 0.3), 10), 0, -0.107, 0.033)); // air fitting
    inner.add(new THREE.Mesh(hose([V(0, -0.115, 0.033), V(0.01, -0.14, 0.06), V(0.04, -0.16, 0.1), V(0.06, -0.2, 0.17), V(0.05, -0.25, 0.25)], 0.007), rubberM()));
    // ---- hands: right on the grip (index along the long trigger), left cupped under the body front
    const gripAxis = V(0, Math.cos(RAKE), Math.sin(RAKE)).normalize();
    const R = buildHand({ side: 'R', grip: V(0, -0.055, 0.02), radius: 0.019, axis: gripAxis, curl: 0.95, trigger: V(0, -0.035, -0.02) });
    inner.add(R.group);
    const off = new THREE.Group();
    off.add(buildHand({ side: 'L', mode: 'support', grip: V(0, -0.028, -0.07), radius: 0.024, axis: V(0, 0, -1), watch: true }).group);
    inner.add(off);
    g.add(inner);
    g.scale.setScalar(0.9); g.position.set(0.1, -0.105, -0.03); g.rotation.y = 0.24; // S1: grip behind the bench
    return finish(g, 'sprayer', -0.08, V(0, 0.0, -0.14), { pos: V(0.05, -0.08, -0.45), rotX: 0.0, rotY: -0.24 }, { trigger: R.trigger, offHand: off });
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
