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
    if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) return false;
    return true;
}

/**
 * Flatten `group` into as few meshes as possible. Returns a new Group with
 * the same position/rotation/scale as the input (the input is disposed of
 * where its geometry was consumed).
 */
export function bakeStatic(group) {
    group.updateMatrixWorld(true);
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
        // bake flat colour into a vertex colour attribute
        color.copy(o.material.color);
        const n = g.attributes.position.count;
        const cols = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        // drop attributes that differ between geometries and would block the merge
        for (const name of Object.keys(g.attributes))
            if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        const k = `${o.material.roughness.toFixed(2)}|${o.material.metalness.toFixed(2)}`;
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
        const [r, m] = k.split('|').map(Number);
        const mesh = new THREE.Mesh(merged, matFor(r, m));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        out.add(mesh);
    }
    // re-parent the un-mergeable meshes with their transform relative to the root
    for (const o of keep) {
        const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        o.removeFromParent();
        rel.decompose(o.position, o.quaternion, o.scale);
        out.add(o);
    }
    return out;
}
