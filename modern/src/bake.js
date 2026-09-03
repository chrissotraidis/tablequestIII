/**
 * STATIC BAKE — MODERN (GOAL_LOOP M1.2 / §3.2-4 draw-call budget)
 *
 * Procedural props are built as groups of many small box meshes, each with
 * its own flat-colour material — up to a dozen draw calls per prop, twice
 * that with the shadow pass. Props never animate, so we flatten each one
 * into a single vertex-coloured MeshStandardMaterial mesh.
 *
 * Meshes that would lose something in the merge are left as-is:
 *   - textured (map), emissive, transparent, or double-sided materials
 *   - non-Standard materials (e.g. the Fritos sprite's MeshBasic)
 *
 * The result keeps the prop's outer transform, so callers position and
 * rotate it exactly as before.
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const bakedMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0.0,
});
const bakedMatCache = new Map(); // "rough|metal" -> material

function matFor(roughness, metalness) {
    const k = `${roughness.toFixed(2)}|${metalness.toFixed(2)}`;
    let m = bakedMatCache.get(k);
    if (!m) {
        m = bakedMat.clone();
        m.roughness = roughness; m.metalness = metalness;
        m.userData.shared = true; // owned by this cache: world/prop disposal must skip it
        bakedMatCache.set(k, m);
    }
    return m;
}

function mergeable(mesh) {
    const m = mesh.material;
    if (!m || Array.isArray(m) || !m.isMeshStandardMaterial) return false;
    if (m.map || m.transparent || m.side !== THREE.FrontSide) return false;
    return true; // emissive meshes merge too: they get their own bucket per emissive colour/intensity
}
const emissiveKey = (m) => (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) ? `|e${m.emissive.getHex().toString(16)}:${m.emissiveIntensity.toFixed(2)}` : '';

/**
 * Flatten `group` into as few meshes as possible. Returns a new Group with
 * the same position/rotation/scale as the input (the input is disposed of
 * where its geometry was consumed).
 */
export function bakeStatic(group, { fresh = false, quantize = 0, single = false } = {}) {
    group.updateMatrixWorld(true);
    // quantize: snap roughness/metalness to a grid so near-identical finishes
    // share one bucket (characters: 0.25 → ~3 buckets per limb instead of ~10)
    const q = (v) => quantize ? Math.round(v / quantize) * quantize : v;
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map(); // roughness|metal -> geometries
    const keep = [];
    const color = new THREE.Color();

    group.traverse((o) => {
        if (!o.isMesh) return;
        if (!mergeable(o)) { keep.push(o); return; }
        const g = o.geometry.clone();
        // bake transform relative to the group root
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        // bake flat colour into a vertex colour attribute (R3.1: a mesh that already carries
        // vertex colours with vertexColors on keeps them, tinted by the material colour)
        color.copy(o.material.color);
        const n = g.attributes.position.count;
        const cols = new Float32Array(n * 3);
        const pre = o.material.vertexColors && g.attributes.color ? g.attributes.color.array : null;
        for (let i = 0; i < n; i++) {
            cols[i * 3] = color.r * (pre ? pre[i * 3] : 1); cols[i * 3 + 1] = color.g * (pre ? pre[i * 3 + 1] : 1); cols[i * 3 + 2] = color.b * (pre ? pre[i * 3 + 2] : 1);
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        // drop attributes that differ between geometries and would block the merge
        for (const name of Object.keys(g.attributes))
            if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        // single: one bucket per emissive state regardless of finish (characters: one mesh per limb, M7.2)
        const k = single ? `0.55|0.10${emissiveKey(o.material)}` : `${q(o.material.roughness).toFixed(2)}|${q(o.material.metalness).toFixed(2)}${emissiveKey(o.material)}`;
        (buckets.get(k) || buckets.set(k, []).get(k)).push(g);
    });

    const out = new THREE.Group();
    out.position.copy(group.position);
    out.rotation.copy(group.rotation);
    out.scale.copy(group.scale);
    out.userData = group.userData;

    for (const [k, geos] of buckets) {
        const merged = BufferGeometryUtils.mergeGeometries(geos, false);
        geos.forEach(g => g.dispose());
        if (!merged) continue;
        const [rs, ms, es] = k.split('|');
        const r = Number(rs), m = Number(ms);
        // fresh: an uncached material owned by this object (characters flash their own)
        let material = fresh ? Object.assign(bakedMat.clone(), { roughness: r, metalness: m }) : matFor(r, m);
        if (es) { // emissive bucket: own material carrying the emissive (vertex colour still tints the base)
            const [hex, inten] = es.slice(1).split(':');
            material = Object.assign(bakedMat.clone(), { roughness: r, metalness: m, emissive: new THREE.Color(parseInt(hex, 16)), emissiveIntensity: Number(inten) });
            material.userData.shared = false;
        }
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        out.add(mesh);
    }
    // un-mergeable meshes: clone into the output with their transform relative to the root
    // (clones share geometry/material with the source, so the source group stays intact)
    for (const o of keep) {
        const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const c = o.clone();
        rel.decompose(c.position, c.quaternion, c.scale);
        c.userData.cloneOf = o;
        // userData references to a kept mesh (e.g. a pickup's animated halo) follow the clone
        for (const [k, v] of Object.entries(out.userData)) if (v === o) out.userData[k] = c;
        out.add(c);
    }
    return out;
}
