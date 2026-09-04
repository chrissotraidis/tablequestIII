/**
 * HAND MESH — MODERN (Round 5, J1/J2)
 *
 * One manifold hand surface per pose, built by extruding fingers and a thumb
 * out of a palm cage and smoothing with two levels of Loop subdivision.
 * Faces carry a material tag (skin / leather glove) through subdivision;
 * per-vertex ambient occlusion comes from concavity. Morph targets are built
 * from the same cage with different curls, so topology matches 1:1.
 *
 *   buildHandMesh(pose, side) → { mesh (with morph targets), nails: [{ pos, dir }] }
 *   pose: { curl: [[p,m,d]×4] (radians per joint, index→little), spread, thumb: [meta, p, d], twist }
 *
 * Hand frame: origin at the palm centre; +Z toward the fingertips (before curl),
 * +Y the back of the hand, -Y the palm; +X toward the little finger for a
 * right hand (mirrored for the left).
 */
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- quad cage with extrude

class Cage {
    constructor() { this.v = []; this.f = []; this.tag = []; }
    add(p) { this.v.push(p.clone()); return this.v.length - 1; }
    quad(a, b, c, d, tag = 0) { this.f.push([a, b, c, d]); this.tag.push(tag); return this.f.length - 1; }
    /** extrude face fi along `dir` by `len`, taper the cap toward its centre by `taper`, rotate the cap about `pivot`/`axis` by `angle` */
    extrude(fi, { dir, len, taper = 1, pivot = null, axis = null, angle = 0, tag = null }) {
        const [a, b, c, d] = this.f[fi];
        const src = [a, b, c, d].map(i => this.v[i]);
        const centre = src.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(0.25);
        const moved = src.map(p => {
            const q = p.clone().addScaledVector(dir, len);
            const c2 = centre.clone().addScaledVector(dir, len);
            q.sub(c2).multiplyScalar(taper).add(c2);
            if (angle && pivot && axis) q.sub(pivot).applyAxisAngle(axis, angle).add(pivot);
            return q;
        });
        const n = moved.map(p => this.add(p));
        const t = tag ?? this.tag[fi];
        // side walls (outward winding consistent with the cap)
        const old = [a, b, c, d];
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(old[i], old[j], n[j], n[i], t); }
        this.f[fi] = [n[0], n[1], n[2], n[3]]; this.tag[fi] = t; // the cap replaces the original face
        return fi;
    }
    /** move a face's vertices (bend without extrusion): rotate about pivot/axis */
    bendFace(fi, pivot, axis, angle) { for (const i of this.f[fi]) this.v[i].sub(pivot).applyAxisAngle(axis, angle).add(pivot); }
    triangles() { const tris = [], tags = []; for (let i = 0; i < this.f.length; i++) { const [a, b, c, d] = this.f[i]; tris.push([a, b, c], [a, c, d]); tags.push(this.tag[i], this.tag[i]); } return { pos: this.v.map(p => p.clone()), tris, tags }; }
}

/** palm block: a lattice box with `cols` columns across the knuckle line and `rows` along the palm */
function palmCage(w, h, len, cols = 4, rows = 3, shape = {}) {
    const c = new Cage();
    const { wristW = 0.72, heel = 1.25, arch = 0.08 } = shape;
    // lattice corner positions, with a narrower wrist and a slight arch on the back
    const P = (i, j, k) => { // i: 0..cols across (x), j: 0..rows along (z), k: 0 bottom / 1 top
        const tz = j / rows; const width = w * (wristW + (1 - wristW) * tz);
        const x = (i / cols - 0.5) * width;
        const z = (tz - 0.5) * len;
        const thick = h * (k ? 1 : 1) * (tz < 0.3 ? heel : 1) * (1 - Math.abs(i / cols - 0.5) * 0.35);
        const y = k ? thick * 0.5 + arch * Math.sin(tz * Math.PI) * 0.3 : -thick * 0.5;
        return V(x, y, z);
    };
    const idx = {}; const key = (i, j, k) => `${i},${j},${k}`;
    const get = (i, j, k) => { const kk = key(i, j, k); if (!(kk in idx)) idx[kk] = c.add(P(i, j, k)); return idx[kk]; };
    // top (back of hand): winding CCW seen from +Y
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) c.quad(get(i, j, 1), get(i, j + 1, 1), get(i + 1, j + 1, 1), get(i + 1, j, 1), 1);
    // bottom (palm)
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) c.quad(get(i, j, 0), get(i + 1, j, 0), get(i + 1, j + 1, 0), get(i, j + 1, 0), 1);
    // knuckle face (j = rows), one quad per column, facing +Z
    const knuckleFaces = [];
    for (let i = 0; i < cols; i++) knuckleFaces.push(c.quad(get(i, rows, 0), get(i + 1, rows, 0), get(i + 1, rows, 1), get(i, rows, 1), 0));
    // wrist cap (j = 0), facing -Z
    for (let i = 0; i < cols; i++) c.quad(get(i, 0, 1), get(i + 1, 0, 1), get(i + 1, 0, 0), get(i, 0, 0), 1);
    // sides: x = 0 (thumb side, -X) and x = cols (+X)
    const sideL = [], sideR = [];
    for (let j = 0; j < rows; j++) { sideL.push(c.quad(get(0, j, 0), get(0, j + 1, 0), get(0, j + 1, 1), get(0, j, 1), 1)); sideR.push(c.quad(get(cols, j, 1), get(cols, j + 1, 1), get(cols, j + 1, 0), get(cols, j, 0), 1)); }
    return { c, knuckleFaces, sideL, sideR };
}

// ---------------------------------------------------------------- Loop subdivision (tags follow faces)

function loopSubdivide(pos, tris, tags) {
    const n = pos.length;
    const edges = new Map(); const ekey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
    const nb = Array.from({ length: n }, () => new Set());
    for (const [a, b, c] of tris) {
        for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) {
            const k = ekey(x, y); const e = edges.get(k) || { a: Math.min(x, y), b: Math.max(x, y), opp: [] }; e.opp.push(z); edges.set(k, e);
            nb[x].add(y); nb[x].add(z);
        }
    }
    const newPos = [];
    // even vertices
    for (let i = 0; i < n; i++) {
        const ring = [...nb[i]]; const k = ring.length;
        const beta = k > 3 ? 3 / (8 * k) : 3 / 16;
        const p = pos[i].clone().multiplyScalar(1 - k * beta);
        for (const j of ring) p.addScaledVector(pos[j], beta);
        newPos.push(p);
    }
    // odd (edge) vertices
    const edgeIdx = new Map();
    for (const [k, e] of edges) {
        const p = e.opp.length === 2
            ? pos[e.a].clone().add(pos[e.b]).multiplyScalar(3 / 8).addScaledVector(pos[e.opp[0]], 1 / 8).addScaledVector(pos[e.opp[1]], 1 / 8)
            : pos[e.a].clone().add(pos[e.b]).multiplyScalar(0.5);
        edgeIdx.set(k, newPos.length); newPos.push(p);
    }
    const newTris = [], newTags = [];
    tris.forEach(([a, b, c], t) => {
        const ab = edgeIdx.get(ekey(a, b)), bc = edgeIdx.get(ekey(b, c)), ca = edgeIdx.get(ekey(c, a));
        newTris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); newTags.push(tags[t], tags[t], tags[t], tags[t]);
    });
    return { pos: newPos, tris: newTris, tags: newTags };
}

// ---------------------------------------------------------------- build a posed cage

const FINGER = { len: [[0.041, 0.027, 0.021], [0.044, 0.029, 0.023], [0.041, 0.027, 0.022], [0.032, 0.022, 0.019]], w: [0.0195, 0.02, 0.0185, 0.016] };

function buildCage(pose, s) {
    const { curl, spread = 1, thumb = [0.3, 0.5, 0.4], twist = 0 } = pose;
    const { c, knuckleFaces, sideL } = palmCage(0.084, 0.03, 0.09, 4, 3);
    // fingers: three extrusions each; the cap bends about the knuckle joint axis (X) by the joint's curl
    for (let i = 0; i < 4; i++) {
        let fi = knuckleFaces[i];
        const fw = FINGER.w[i];
        // pre-scale the knuckle face toward the finger width (columns are 0.021 wide)
        const [a, b, cc, d] = c.f[fi]; const centre = [a, b, cc, d].reduce((q, k) => q.add(c.v[k]), V(0, 0, 0)).multiplyScalar(0.25);
        for (const k of [a, b, cc, d]) { const p = c.v[k]; p.sub(centre); p.x *= fw / 0.021; p.y *= 0.9; p.add(centre); }
        let dir = V(Math.sin((i - 1.5) * 0.09 * spread), 0, Math.cos((i - 1.5) * 0.09 * spread)).normalize();
        let pivot = centre.clone();
        for (let j = 0; j < 3; j++) {
            const len = FINGER.len[i][j];
            fi = c.extrude(fi, { dir, len, taper: j === 2 ? 0.72 : 0.9, tag: j === 0 ? 1 : 0 });
            // bend: rotate the new cap about the joint (pivot) around the local X axis by the curl
            const axis = V().crossVectors(V(0, 1, 0), dir).normalize();
            const ang = curl[i][j];
            c.bendFace(fi, pivot, axis, ang);
            dir = dir.clone().applyAxisAngle(axis, ang);
            const capC = c.f[fi].reduce((q, k) => q.add(c.v[k]), V(0, 0, 0)).multiplyScalar(0.25);
            pivot = capC;
        }
    }
    // thumb from the lower side face on the thumb side: metacarpal outward-forward, then two segments
    let fi = sideL[0];
    { const [a, b, cc, d] = c.f[fi]; const centre = [a, b, cc, d].reduce((q, k) => q.add(c.v[k]), V(0, 0, 0)).multiplyScalar(0.25); for (const k of [a, b, cc, d]) { const p = c.v[k]; p.sub(centre).multiplyScalar(0.85).add(centre); } }
    let dir = V(-0.62, -0.5, 0.6).normalize();
    let pivot = c.f[fi].reduce((q, k) => q.add(c.v[k]), V(0, 0, 0)).multiplyScalar(0.25);
    const tl = [0.04, 0.034, 0.028];
    for (let j = 0; j < 3; j++) {
        fi = c.extrude(fi, { dir, len: tl[j], taper: j === 2 ? 0.72 : 0.92, tag: j === 0 ? 1 : 0 });
        const axis = V().crossVectors(V(0, 1, 0), dir).normalize(); // thumb curls toward the palm
        const ang = thumb[j];
        c.bendFace(fi, pivot, axis, ang);
        dir = dir.clone().applyAxisAngle(axis, ang);
        pivot = c.f[fi].reduce((q, k) => q.add(c.v[k]), V(0, 0, 0)).multiplyScalar(0.25);
    }
    const out = c.triangles();
    if (s < 0) { for (const p of out.pos) p.x = -p.x; for (const t of out.tris) { const b = t[1]; t[1] = t[2]; t[2] = b; } } // mirror for the left hand
    if (twist) for (const p of out.pos) p.applyAxisAngle(V(0, 0, 1), twist);
    return out;
}

// ---------------------------------------------------------------- geometry assembly

function toGeometry(base, morphs, levels = 2) {
    let b = base; let ms = morphs.map(m => m);
    for (let l = 0; l < levels; l++) { b = loopSubdivide(b.pos, b.tris, b.tags); ms = ms.map(m => loopSubdivide(m.pos, m.tris, m.tags)); }
    const n = b.pos.length;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    b.pos.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; uv[i * 2] = p.x * 12 + 0.5; uv[i * 2 + 1] = p.z * 12 + p.y * 6; });
    const index = new Uint32Array(b.tris.length * 3); b.tris.forEach((t, i) => { index[i * 3] = t[0]; index[i * 3 + 1] = t[1]; index[i * 3 + 2] = t[2]; });
    // sort triangles by tag into two material groups
    const order = b.tris.map((_, i) => i).sort((x, y) => b.tags[x] - b.tags[y]);
    const sortedIndex = new Uint32Array(index.length); order.forEach((ti, k) => { sortedIndex[k * 3] = index[ti * 3]; sortedIndex[k * 3 + 1] = index[ti * 3 + 1]; sortedIndex[k * 3 + 2] = index[ti * 3 + 2]; });
    const nSkin = b.tags.filter(t => t === 0).length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(sortedIndex, 1));
    g.addGroup(0, nSkin * 3, 0); g.addGroup(nSkin * 3, (b.tris.length - nSkin) * 3, 1);
    g.computeVertexNormals();
    // ambient occlusion from concavity: darker where the normal opposes the mean neighbour direction
    const nrm = g.attributes.normal; const nb = Array.from({ length: n }, () => new Set());
    for (const [a, bb, c] of b.tris) { nb[a].add(bb); nb[a].add(c); nb[bb].add(a); nb[bb].add(c); nb[c].add(a); nb[c].add(bb); }
    const col = new Float32Array(n * 3); const tmp = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
        tmp.set(0, 0, 0); for (const j of nb[i]) tmp.add(b.pos[j]); tmp.multiplyScalar(1 / Math.max(1, nb[i].size)).sub(b.pos[i]);
        nn.fromBufferAttribute(nrm, i);
        const concave = Math.max(0, tmp.normalize().dot(nn)); // neighbours ahead of the surface → crease
        const warm = Math.max(0, b.pos[i].z * 6 + 0.2);         // knuckles and tips warmer
        const ao = 1 - concave * 0.55;
        col[i * 3] = ao; col[i * 3 + 1] = ao * (1 - warm * 0.08); col[i * 3 + 2] = ao * (1 - warm * 0.14);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // morph targets (positions only; normals recomputed by three from the base)
    g.morphAttributes.position = ms.map(m => { const a = new Float32Array(n * 3); m.pos.forEach((p, i) => { a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; }); return new THREE.BufferAttribute(a, 3); });
    return g;
}

/** nail attachment points: fingertip centres and directions in hand space (from the cage, pre-subdivision) */
function nailSites(pose, s) {
    const sites = [];
    const { curl, spread = 1, thumb = [0.3, 0.5, 0.4] } = pose;
    for (let i = 0; i < 4; i++) {
        let dir = V(Math.sin((i - 1.5) * 0.09 * spread), 0, Math.cos((i - 1.5) * 0.09 * spread)).normalize();
        let p = V(((i + 0.5) / 4 - 0.5) * 0.084, 0.006, 0.045);
        let up = V(0, 1, 0);
        for (let j = 0; j < 3; j++) { const axis = V().crossVectors(V(0, 1, 0), dir).normalize(); dir = dir.clone().applyAxisAngle(axis, curl[i][j]); up = up.clone().applyAxisAngle(axis, curl[i][j]); p.addScaledVector(dir, FINGER.len[i][j]); }
        sites.push({ pos: p.addScaledVector(up, FINGER.w[i] * 0.45 * 0.9).addScaledVector(dir, -0.006), dir, up, r: FINGER.w[i] * 0.42 });
    }
    { let dir = V(-0.62, -0.5, 0.6).normalize(); let p = V(-0.042, -0.006, -0.03); let up = V(0, 1, 0); const tl = [0.04, 0.034, 0.028];
      for (let j = 0; j < 3; j++) { const axis = V().crossVectors(V(0, 1, 0), dir).normalize(); dir = dir.clone().applyAxisAngle(axis, thumb[j]); up = up.clone().applyAxisAngle(axis, thumb[j]); p.addScaledVector(dir, tl[j]); }
      sites.push({ pos: p.addScaledVector(up, 0.006).addScaledVector(dir, -0.006), dir, up, r: 0.0075 }); }
    if (s < 0) for (const st of sites) { st.pos.x = -st.pos.x; st.dir.x = -st.dir.x; st.up.x = -st.up.x; }
    return sites;
}

/**
 * Build a posed hand with morph targets [trigger, relax, fidget, thumbLift].
 * side: +1 right, -1 left. Returns { geometry, nails }.
 */
export function buildHandMesh(pose, side = 1) {
    const base = buildCage(pose, side);
    const alt = (fn) => { const p = JSON.parse(JSON.stringify(pose)); fn(p); return buildCage(p, side); };
    const morphs = [
        alt(p => { p.curl[0] = p.curl[0].map((a, j) => Math.min(1.5, a + [0.35, 0.45, 0.3][j])); }),           // trigger squeeze
        alt(p => { p.curl = p.curl.map(f => f.map(a => a * 0.55)); p.thumb = p.thumb.map(a => a * 0.7); }),  // relax / open
        alt(p => { p.curl[2] = p.curl[2].map(a => Math.min(1.5, a + 0.2)); p.curl[3] = p.curl[3].map(a => Math.min(1.5, a + 0.3)); }), // fidget
        alt(p => { p.thumb = p.thumb.map(a => a * 0.5); }),                                                   // thumb lift
    ];
    return { geometry: toGeometry(base, morphs, 2), nails: nailSites(pose, side) };
}

/** a grip pose from a handle radius: fingers wrap so the three segments cover the arc; curlScale eases the wrap */
export function gripPose(radius, { curlScale = 1, spread = 0.9, trigger = false, thumb = null } = {}) {
    const curl = FINGER.len.map((L, i) => {
        const r = radius + FINGER.w[i] * 0.5;
        return L.map((len, j) => Math.max([0.3, 0.38, 0.28][j], Math.min(1.45, (len / r) * 0.62 * curlScale))); // never dead straight
    });
    if (trigger) curl[0] = [0.25, 0.35, 0.2];
    return { curl, spread, thumb: thumb || [0.55 * curlScale, 0.85 * curlScale, 0.6 * curlScale] };
}
