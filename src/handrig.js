/**
 * HAND RIG — MODERN (Round 7, L2–L4)
 *
 * Real skinned hands: the WebXR input-profiles `generic-hand` left/right
 * models (MIT, Amazon 2019; see src/assets/hands/LICENSE.md), 25 joints each,
 * inlined into the single-file build as data URLs. The rig
 *   - detects the model's own frame numerically (finger direction, curl
 *     direction) so the mapping into a tool's grip frame is exact,
 *   - places the wrist joint at the tool's grip frame and poses the finger
 *     joints per tool (grip wrap by handle radius, index on the trigger,
 *     support poses for off hands, thumb over),
 *   - animates the skeleton every frame (trigger squeeze, relax, fidget, grip
 *     adjust, recoil wrist flex).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import leftUrl from './assets/hands/left.glb?url';
import rightUrl from './assets/hands/right.glb?url';
import { skinMaterial, buildSleeve } from './hands.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const PHAL = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal'];

let models = null; // { L: scene, R: scene }
let loading = null;

/** load both hands once; resolves to { L, R } template scenes */
export function loadHandModels() {
    if (models) return Promise.resolve(models);
    if (loading) return loading;
    const loader = new GLTFLoader();
    loading = Promise.all([loader.loadAsync(leftUrl), loader.loadAsync(rightUrl)]).then(([l, r]) => {
        models = { L: l.scene, R: r.scene };
        return models;
    });
    return loading;
}

function jointMap(root) {
    const m = {}; root.traverse(o => { if (o.isBone || o.isObject3D) { if (o.name) m[o.name] = o; } }); return m;
}

/**
 * Detect the model's rest frame: wrist position, finger direction F, curl direction C (palm-ward),
 * and the local bend axis sign per joint (so +angle always curls toward the palm).
 */
function analyse(root) {
    root.updateMatrixWorld(true);
    const J = jointMap(root);
    const wp = J['wrist'].getWorldPosition(new THREE.Vector3());
    const tipM = J['middle-finger-tip'].getWorldPosition(new THREE.Vector3());
    const F = tipM.clone().sub(wp).normalize();
    // palm direction: the hand's thickness axis (smallest extent of the mesh), signed toward the thumb's base
    let mesh = null; root.traverse(o => { if (!mesh && (o.isSkinnedMesh || o.isMesh)) mesh = o; });
    mesh.geometry.computeBoundingBox(); const bb = mesh.geometry.boundingBox; const ext = bb.max.clone().sub(bb.min);
    const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)]; const ei = [ext.x, ext.y, ext.z];
    let ti = 0; for (let i = 1; i < 3; i++) if (ei[i] < ei[ti]) ti = i;
    const thick = axes[ti].clone().applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
    thick.sub(F.clone().multiplyScalar(thick.dot(F))).normalize();
    const tm = J['thumb-metacarpal'].getWorldPosition(new THREE.Vector3()).sub(wp);
    const palm = thick.clone().multiplyScalar(Math.sign(tm.dot(thick)) || 1);
    // bend axis: of the joint's local X/Y/Z, the one whose rotation moves the fingertip toward the palm
    const jp = J['index-finger-phalanx-proximal'], tip = J['index-finger-tip'];
    const restQ = jp.quaternion.clone();
    let best = { axis: V(1, 0, 0), score: -1, sign: 1 };
    for (const axis of [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)]) {
        const before = tip.getWorldPosition(new THREE.Vector3());
        jp.quaternion.copy(restQ).multiply(new THREE.Quaternion().setFromAxisAngle(axis, 0.6)); root.updateMatrixWorld(true);
        const move = tip.getWorldPosition(new THREE.Vector3()).sub(before);
        jp.quaternion.copy(restQ); root.updateMatrixWorld(true);
        const d = move.dot(palm); const score = Math.abs(d);
        if (score > best.score) best = { axis, score, sign: d >= 0 ? 1 : -1 };
    }
    const side = V().crossVectors(F, palm).normalize();
    return { wrist: wp, F, palm, side, bendAxis: best.axis, bendSign: best.sign };
}

/** the generic-hand skeletons are flat (every joint a child of the armature); re-parent them into
 *  anatomical chains so a bend at one joint carries the joints beyond it (world transforms preserved) */
function chainJoints(root) {
    root.updateMatrixWorld(true);
    const J = jointMap(root);
    const chains = FINGERS.map(f => ['wrist', `${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]);
    chains.push(['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']);
    for (const chain of chains) for (let i = 1; i < chain.length; i++) { const p = J[chain[i - 1]], c = J[chain[i]]; if (p && c && c.parent !== p) p.attach(c); }
    root.updateMatrixWorld(true);
}

const _q = new THREE.Quaternion();
function bend(joint, rest, angle, sign, axis) { joint.quaternion.copy(rest).multiply(_q.setFromAxisAngle(axis, angle * sign)); }

/**
 * Create a posed hand for a tool. spec: { side, grip, radius, axis, out, mode, trigger, curl }
 * Returns a Group (add it to the viewmodel) with userData.rig for animation.
 */
export function makeHand(spec) {
    const s = spec.side === 'R' ? 1 : -1;
    const tpl = models[spec.side];
    const root = skeletonClone(tpl);
    chainJoints(root);
    const info = analyse(root);
    const J = jointMap(root);
    // skin material with the game's procedural skin maps
    root.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.material = skinMaterial(); o.material.vertexColors = false; o.material.color.set(0xb89a88); o.material.roughness = 0.78; o.material.envMapIntensity = 0.25; o.material.normalScale.set(0.55, 0.55); o.frustumCulled = false; o.layers.set(1); o.castShadow = true; o.receiveShadow = true; } });
    // ---- frame in tool space. A: handle axis pointing toward the thumb side (up a pistol grip, forward
    //      along a fore-end). out: from the handle axis through the palm to the back of the hand.
    //      Z (fingers at the knuckles, before the curl) = s · (A × out): the fingers leave the knuckles
    //      tangentially and wrap the handle with the thumb on the +A side. Y = out. X = Y × Z.
    const A = spec.axis.clone().normalize();
    let out;
    if (spec.out) out = spec.out.clone();
    else if (spec.mode === 'support') out = V(0, -1, 0);                  // palm up under the tool
    else out = V(s * 0.92, 0, 0.38);                                        // pistol grip: back of the hand outward and a little back
    out.sub(A.clone().multiplyScalar(out.dot(A))).normalize();
    const Z = V().crossVectors(A, out).multiplyScalar(s).normalize();
    const Y = out.clone(), X = V().crossVectors(Y, Z).normalize();
    // model basis: Fm = finger direction, Pm = palm-ward, Sm = F × P
    const Fm = info.F, Pm = info.palm, Sm = V().crossVectors(Fm, Pm).normalize();
    const mModel = new THREE.Matrix4().makeBasis(Sm, Pm.clone().negate(), Fm);   // model: (side, back, fingers)
    const mTool = new THREE.Matrix4().makeBasis(X, Y, Z);
    const rot = new THREE.Matrix4().multiplyMatrices(mTool, mModel.clone().invert());
    const pivot = new THREE.Group();
    pivot.quaternion.setFromRotationMatrix(rot);
    if (spec.wristRoll) pivot.quaternion.premultiply(_q.setFromAxisAngle(Z, spec.wristRoll));
    // wrist joint = grip + out·(radius + palm depth) − Z·(wrist→knuckle distance); measured on the model:
    // the knuckles are 0.088 from the wrist joint, the palm skin ~0.017 below it
    const support = spec.mode === 'support';
    const dOut = spec.dOut ?? (support ? 0.016 : 0.013), dz = spec.dz ?? (support ? -0.052 : -0.078); // support: the tool rests mid-palm
    const origin = spec.grip.clone().addScaledVector(out, spec.radius + dOut).addScaledVector(Z, dz);
    root.position.copy(info.wrist).negate();               // wrist at the pivot origin
    pivot.add(root); pivot.position.copy(origin);
    const scale = spec.scale ?? 0.92;
    pivot.scale.setScalar(scale);
    // ---- rest quaternions and the pose
    const rest = {}; for (const n of Object.keys(J)) rest[n] = J[n].quaternion.clone();
    const curls = spec.curls || gripCurls(spec.radius / scale, spec);
    const rig = { J, rest, curls, sign: info.bendSign, axis: info.bendAxis, spreadAxis: info.bendAxis.x ? V(0, 0, 1) : V(1, 0, 0), side: spec.side, mode: spec.mode || 'grip', sq: 0, relax: 0, fid: 0, grip: 0, wristFlex: 0 };
    applyPose(rig);
    const hand = new THREE.Group();
    hand.add(pivot);
    hand.userData.rig = rig;
    // ---- sleeve: from the shoulder anchor to the wrist ring (the mesh is open there; ring 0.052 × 0.037 × scale)
    // forearm direction (tool space): default straight off the back of the hand; a spec.forearm bends the wrist
    const foreDir = spec.forearm ? spec.forearm.clone().normalize() : Z.clone().negate();
    if (!spec.noSleeve) hand.add(buildSleeve({ side: spec.side, wrist: origin, X, Y, Z, foreDir, shoulder: spec.shoulder || null, ringX: 0.026 * scale + 0.002, ringY: 0.0185 * scale + 0.002, watch: !!spec.watch }));
    return hand;
}

/** per-joint curl angles from a handle radius: fingers wrap so the three phalanges cover the arc */
export function gripCurls(radius, spec = {}) {
    const lens = [[0.041, 0.027, 0.021], [0.044, 0.029, 0.023], [0.041, 0.027, 0.022], [0.032, 0.022, 0.019]];
    const k = spec.mode === 'support' ? 0.72 : 0.62 * (0.85 + (spec.curl ?? 0.9) * 0.35);
    const f = lens.map((L, i) => L.map((len, j) => Math.max([0.2, 0.3, 0.2][j], Math.min(1.4, (len / (radius + 0.009)) * k))));
    if (spec.trigger) f[0] = [0.12, 0.55, 0.3];   // index along the trigger: straight at the knuckle, bent at the middle joint
    const thumb = spec.mode === 'support' ? [0.2, 0.35, 0.25] : [0.25, 0.5, 0.45];
    return { f, thumb, spread: spec.mode === 'support' ? 0.06 : 0.04 };
}

/** write the pose into the joints from base curls plus the live animation channels */
export function applyPose(rig) {
    const { J, rest, curls, sign, axis } = rig;
    const relax = 1 - rig.relax * 0.45;
    FINGERS.forEach((fn, i) => {
        const extraSq = i === 0 ? rig.sq * [0.35, 0.45, 0.3][0] : 0;
        const fid = (i >= 2 ? rig.fid * (i === 3 ? 0.3 : 0.2) : 0);
        PHAL.forEach((ph, j) => {
            const joint = J[`${fn}-${ph}`]; if (!joint) return;
            const sqj = i === 0 ? rig.sq * [0.35, 0.45, 0.3][j] : 0;
            const a = (curls.f[i][j] + fid) * relax + sqj - rig.grip * 0.12 * (j === 0 ? 1 : 0.5);
            bend(joint, rest[`${fn}-${ph}`], a, sign, axis);
            if (j === 0 && curls.spread) joint.quaternion.multiply(_q.setFromAxisAngle(rig.spreadAxis, (i - 1.5) * curls.spread * (rig.side === 'R' ? 1 : -1)));
        });
    });
    ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal'].forEach((n, j) => {
        const joint = J[n]; if (!joint) return;
        bend(joint, rest[n], (curls.thumb[j] * relax - rig.grip * 0.25 * (j === 0 ? 1 : 0.4)), sign, axis);
    });
    const wrist = J['wrist']; if (wrist && rig.wristFlex) bend(wrist, rest['wrist'], rig.wristFlex, sign, axis); else if (wrist) wrist.quaternion.copy(rest['wrist']);
}
