/**
 * CHARACTERS — MODERN (GOAL_LOOP M4.1)
 *
 * Cartel staff rebuilt at 2007-era fidelity, 100 % procedural, and returned
 * with exactly the interface the classic AI animates:
 *   { group, legL, legR, armL, armR, torso, headG, flashMats, height }
 * Limb groups pivot at hip / shoulder like classic; the AI still writes
 * rotation.x on limbs, torso rotation x/z, headG rotation y, group rotation
 * for the death fall, and emissive on flashMats for the pain flash.
 *
 * Ranks (classic colours): 0 guard blue, 1 manager gray + glasses,
 * 2 executive black + hat, 'boss' oxblood + cape + gold scissors emblem.
 * §5-D default: office weapons that fire paint — stapler, tape gun, paint
 * pistol, and the Head Designer's golden shears — held in the right hand.
 *
 * Each limb / torso / head is baked to one vertex-coloured mesh (own material
 * per character so the pain flash is per-enemy); emissive bits stay separate.
 */
import * as THREE from 'three';
import { bakeStatic } from './bake.js';

const SKIN = 0xe8b890, SKIN_DARK = 0xd4a27c;
const SUIT_COLORS = { 0: 0x2244aa, 1: 0x666a70, 2: 0x1a1a22, boss: 0x8b0a1a };
const SHIRT = 0xf0f0e8, SHOE = 0x16120f, BELT = 0x1a1410;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0, ...opts });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
const sph = (r, m, w = 10, h = 8) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

function darker(hex, k) { return new THREE.Color(hex).multiplyScalar(k).getHex(); }

/** a simple hand: palm + curled finger block + thumb; gripAxis 'z' wraps a handle pointing forward */
function hand(skin, grip = false) {
    const g = new THREE.Group();
    g.add(at(sph(0.036, skin, 10, 8), 0, 0, 0)).children[0].scale.set(1, 0.8, 1.15);
    if (grip) {
        g.add(at(cyl(0.03, 0.03, 0.045, skin, 10), 0, -0.03, 0.02)); // fingers wrapped around the handle
        g.add(at(cyl(0.011, 0.012, 0.035, skin, 8), 0.028, -0.005, 0.01)).children.at(-1).rotation.z = 0.8; // thumb
    } else {
        g.add(at(box(0.05, 0.03, 0.045, skin), 0, -0.035, 0.012)); // relaxed fingers
        g.add(at(box(0.016, 0.03, 0.016, skin), 0.03, -0.01, 0.01));
    }
    return g;
}

// ---------------------------------------------------------------- office weapons (fire paint)

function stapler() {
    const g = new THREE.Group();
    g.add(at(box(0.04, 0.026, 0.15, mat(0x9aa0a8, { roughness: 0.4, metalness: 0.6 })), 0, 0.0, 0.06));       // base
    g.add(at(box(0.036, 0.024, 0.14, mat(0x1e2a5a, { roughness: 0.5 })), 0, 0.03, 0.055));                      // arm
    g.add(at(box(0.04, 0.02, 0.02, mat(0x2b3038, { roughness: 0.5, metalness: 0.5 })), 0, 0.02, -0.01));       // hinge
    g.add(at(sph(0.018, mat(0x3a6acc, { roughness: 0.3, emissive: 0x102040, emissiveIntensity: 0.4 })), 0, 0.052, 0.02)); // paint reservoir
    return g;
}
function tapeGun() {
    const g = new THREE.Group();
    g.add(at(box(0.03, 0.09, 0.04, mat(0x2b3038, { roughness: 0.8 })), 0, -0.03, 0.02));                        // grip
    g.add(at(box(0.034, 0.03, 0.16, mat(0x8a929c, { roughness: 0.4, metalness: 0.6 })), 0, 0.02, 0.08));       // frame
    const roll = at(cyl(0.048, 0.048, 0.03, mat(0xc9a227, { roughness: 0.6 }), 14), 0, 0.06, 0.05); roll.rotation.z = Math.PI / 2; g.add(roll);
    const core = at(cyl(0.022, 0.022, 0.034, mat(0x3a3a3c, { roughness: 0.8 }), 12), 0, 0.06, 0.05); core.rotation.z = Math.PI / 2; g.add(core);
    g.add(at(box(0.03, 0.006, 0.03, mat(0xd8d8d0, { roughness: 0.3, metalness: 0.7 })), 0, 0.04, 0.16));       // blade
    return g;
}
function paintPistol() {
    const g = new THREE.Group();
    g.add(at(box(0.034, 0.04, 0.17, mat(0x14161a, { roughness: 0.35, metalness: 0.5 })), 0, 0.03, 0.07));      // slide
    g.add(at(box(0.03, 0.085, 0.04, mat(0x2b3038, { roughness: 0.8 })), 0, -0.03, 0.02));                       // grip
    const barrel = at(cyl(0.009, 0.009, 0.05, mat(0x444c56, { roughness: 0.4, metalness: 0.7 }), 8), 0, 0.035, 0.17); barrel.rotation.x = Math.PI / 2; g.add(barrel);
    g.add(at(cyl(0.018, 0.018, 0.04, mat(0xcc3322, { roughness: 0.4 }), 10), 0, -0.005, 0.1));                 // paint can under the slide
    return g;
}
function goldenShears() {
    const g = new THREE.Group();
    const gold = mat(0xffd700, { roughness: 0.25, metalness: 0.8, emissive: 0x604000, emissiveIntensity: 0.35 });
    const a = at(box(0.022, 0.008, 0.34, gold), 0.012, 0.0, 0.17); a.rotation.y = 0.08; g.add(a);
    const b = at(box(0.022, 0.008, 0.34, gold), -0.012, 0.008, 0.17); b.rotation.y = -0.08; g.add(b);
    for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 14), gold); ring.position.set(sx * 0.03, 0, -0.03); ring.rotation.y = Math.PI / 2; g.add(ring); }
    return g;
}
const WEAPON_FOR = { 0: stapler, 1: tapeGun, 2: paintPistol, boss: goldenShears };

// ---------------------------------------------------------------- builder

/** Cartel employee. Returns the classic animation interface. */
export function buildEnemy(variant) {
    const g = new THREE.Group();
    const suit = SUIT_COLORS[variant] ?? SUIT_COLORS[0];
    const isBoss = variant === 'boss';
    const scale = isBoss ? 1.65 : 1.0;
    const suitMat = mat(suit, { roughness: 0.75 });
    const pantsMat = mat(darker(suit, 0.6), { roughness: 0.8 });
    const skinMat = mat(SKIN, { roughness: 0.6 });
    const skinDark = mat(SKIN_DARK, { roughness: 0.65 });
    const shirtMat = mat(SHIRT, { roughness: 0.7 });
    const tieMat = mat(isBoss ? 0xffd700 : variant === 2 ? 0x5a0e16 : 0xaa1122, { roughness: 0.5 });
    const shoeMat = mat(SHOE, { roughness: 0.35, metalness: 0.1 });

    // ---- legs: pivot at the hip, thigh → shin → shoe
    const leg = (side) => {
        const L = new THREE.Group();
        L.position.set(side * 0.07, 0.40, 0);
        L.add(at(box(0.1, 0.2, 0.11, pantsMat), 0, -0.1, 0));
        L.add(at(box(0.088, 0.19, 0.098, pantsMat), 0, -0.29, 0.004));
        L.add(at(box(0.03, 0.04, 0.03, pantsMat), 0, -0.2, 0.05)); // knee
        L.add(at(box(0.1, 0.05, 0.17, shoeMat), 0, -0.395, 0.03));
        L.add(at(box(0.1, 0.02, 0.05, mat(0x2a2320)), 0, -0.41, -0.03)); // heel
        return L;
    };
    const legL = leg(-1), legR = leg(1);

    // ---- torso: jacket, lapels, shirt, tie, belt, collar, shoulders
    const torso = new THREE.Group();
    torso.position.y = 0.40;
    torso.add(at(box(0.32, 0.36, 0.18, suitMat), 0, 0.18, 0));
    torso.add(at(box(0.34, 0.06, 0.2, suitMat), 0, 0.33, 0));                    // shoulders
    torso.add(at(box(0.12, 0.3, 0.02, shirtMat), 0, 0.19, 0.088));                // shirt front
    for (const s of [-1, 1]) {                                                    // lapels
        const lap = at(box(0.07, 0.24, 0.012, mat(darker(suit, 0.8))), s * 0.075, 0.2, 0.094); lap.rotation.z = s * 0.25; torso.add(lap);
    }
    torso.add(at(box(0.045, 0.2, 0.012, tieMat), 0, 0.17, 0.1));                 // tie
    torso.add(at(box(0.05, 0.03, 0.014, tieMat), 0, 0.29, 0.1));                 // knot
    torso.add(at(box(0.14, 0.03, 0.05, shirtMat), 0, 0.33, 0.07));               // collar
    torso.add(at(box(0.33, 0.035, 0.19, mat(BELT, { roughness: 0.5 })), 0, 0.005, 0)); // belt
    torso.add(at(box(0.03, 0.025, 0.01, mat(0xc9a227, { roughness: 0.3, metalness: 0.7 })), 0, 0.005, 0.1)); // buckle
    torso.add(at(box(0.05, 0.05, 0.01, mat(0x1a1410)), 0.11, 0.2, 0.09));        // pocket square line (dark)
    if (variant === 1) torso.add(at(box(0.05, 0.04, 0.008, mat(0xd8d8d0)), 0.1, 0.12, 0.092)); // manager name badge
    if (variant === 0) torso.add(at(box(0.06, 0.02, 0.008, mat(0xc9a227, { roughness: 0.3, metalness: 0.6 })), -0.1, 0.27, 0.092)); // guard badge
    if (isBoss) {
        const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.6), mat(0x33060c, { side: THREE.DoubleSide, roughness: 0.9 }));
        cape.position.set(0, 0.06, -0.11); cape.rotation.x = 0.14; torso.add(cape);
        const emblem = at(box(0.08, 0.08, 0.012, mat(0xffd700, { emissive: 0x806000, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.7 })), -0.1, 0.24, 0.095);
        emblem.rotation.z = Math.PI / 4; torso.add(emblem);
    }

    // ---- arms: pivot at the shoulder, upper → forearm → hand (+ weapon in the right)
    const arm = (side) => {
        const A = new THREE.Group();
        A.position.set(side * 0.2, 0.31, 0);
        A.add(at(box(0.078, 0.17, 0.085, suitMat), 0, -0.085, 0));
        A.add(at(box(0.07, 0.16, 0.076, suitMat), 0, -0.245, 0.004));
        A.add(at(box(0.074, 0.02, 0.08, shirtMat), 0, -0.325, 0.004));         // cuff
        const h = hand(skinMat, side === 1);
        h.position.set(0, -0.36, 0.01);
        A.add(h);
        if (side === 1) { // right hand holds the office weapon, pointing forward
            const w = WEAPON_FOR[variant]();
            w.position.set(0, -0.37, 0.05);
            A.add(w);
        }
        return A;
    };
    const armL = arm(-1), armR = arm(1);
    torso.add(armL, armR);

    // ---- head: skull, jaw, ears, hair, eyes, brows, nose, mouth, rank kit
    const headG = new THREE.Group();
    headG.position.set(0, 0.36, 0);
    headG.add(at(box(0.16, 0.17, 0.155, skinMat), 0, 0.095, 0));
    headG.add(at(box(0.13, 0.05, 0.14, skinDark), 0, 0.02, 0.005));             // jaw
    headG.add(at(box(0.04, 0.05, 0.02, skinDark), 0, 0.005, 0));                // neck
    for (const s of [-1, 1]) headG.add(at(box(0.018, 0.04, 0.03, skinDark), s * 0.087, 0.09, 0));  // ears
    const hairCol = variant === 1 ? 0x999188 : isBoss ? 0x2a1a14 : variant === 2 ? 0x111014 : 0x271a10;
    const hairMat = mat(hairCol, { roughness: 0.9 });
    headG.add(at(box(0.17, 0.05, 0.16, hairMat), 0, 0.185, -0.005));            // top
    headG.add(at(box(0.17, 0.09, 0.03, hairMat), 0, 0.14, -0.075));             // back
    if (variant === 0) headG.add(at(box(0.17, 0.03, 0.05, hairMat), 0, 0.17, 0.06));   // guard fringe
    if (variant === 1) headG.add(at(box(0.05, 0.03, 0.05, hairMat), 0.06, 0.2, 0.02));  // manager comb-over
    for (const s of [-1, 1]) {
        headG.add(at(box(0.034, 0.024, 0.01, mat(0xffffff, { roughness: 0.3 })), s * 0.04, 0.105, 0.08));   // eye whites
        headG.add(at(box(0.014, 0.014, 0.012, mat(0x141414)), s * 0.04, 0.104, 0.082));                        // pupils
        headG.add(at(box(0.04, 0.012, 0.01, hairMat), s * 0.04, 0.13, 0.08)).children.at(-1).rotation.z = s * (isBoss ? -0.25 : 0.1); // brows
    }
    headG.add(at(box(0.022, 0.03, 0.02, skinDark), 0, 0.085, 0.085));           // nose
    headG.add(at(box(0.05, 0.008, 0.01, mat(0x6a2a24)), 0, 0.05, 0.08));        // mouth
    if (variant === 1) { // glasses
        const frame = mat(0x0a0a0a, { roughness: 0.4, metalness: 0.4 });
        for (const s of [-1, 1]) headG.add(at(box(0.05, 0.036, 0.008, mat(0x88aacc, { transparent: true, opacity: 0.35, roughness: 0.1 })), s * 0.04, 0.105, 0.088));
        headG.add(at(box(0.13, 0.006, 0.006, frame), 0, 0.122, 0.088));
        headG.add(at(box(0.02, 0.005, 0.006, frame), 0, 0.105, 0.088));
    }
    if (variant === 2 || isBoss) { // hat
        const hatMat = mat(isBoss ? 0x550a14 : 0x111118, { roughness: 0.85 });
        headG.add(at(box(0.24, 0.02, 0.23, hatMat), 0, 0.205, 0));
        headG.add(at(box(0.15, 0.1, 0.14, hatMat), 0, 0.26, 0));
        headG.add(at(box(0.152, 0.02, 0.142, mat(isBoss ? 0xffd700 : 0x3a3a44)), 0, 0.225, 0)); // band
    }
    if (variant === 2) headG.add(at(box(0.11, 0.024, 0.012, mat(0x0a0a0a, { roughness: 0.2, metalness: 0.5 })), 0, 0.105, 0.09)); // executive shades
    torso.add(headG);

    g.add(legL, legR, torso);
    g.scale.setScalar(scale);

    // ---- bake each animated part to as few meshes as possible (own materials per character)
    const bakedLegL = bakePart(legL), bakedLegR = bakePart(legR);
    const bakedArmL = bakePart(armL), bakedArmR = bakePart(armR);
    const bakedHead = bakePart(headG);
    // torso keeps its children arms/head groups: bake only its own meshes
    const torsoOwn = new THREE.Group(); torsoOwn.position.copy(torso.position);
    for (const c of [...torso.children]) if (c.isMesh) torsoOwn.add(c);
    const bakedTorso = bakePart(torsoOwn);
    torso.clear();
    torso.add(...bakedTorso.children, bakedArmL, bakedArmR, bakedHead);
    g.clear();
    g.add(bakedLegL, bakedLegR, torso);

    // pain flash: every baked (vertex-coloured) material on this character
    const flashMats = [];
    g.traverse(o => { if (o.isMesh && o.material.vertexColors) flashMats.push(o.material); });
    return { group: g, legL: bakedLegL, legR: bakedLegR, armL: bakedArmL, armR: bakedArmR, torso, headG: bakedHead, flashMats, height: 0.87 * scale };
}

/** bake a limb group in place: same pivot transform, merged children, fresh (per-character) materials */
function bakePart(part) {
    const baked = bakeStatic(part, { fresh: true, quantize: 0.5 });
    baked.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return baked;
}
