/**
 * PROCEDURAL 3D MODELS — enemies, tables, pickups, weapon viewmodels, props.
 */
import * as THREE from 'three';

// original Fritos health-pickup art, ported from the 199X release
import fritosUrl from './assets/fritos.png';

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

const SKIN = 0xe8b890;
const SLEEVE = 0x9a8560; // Sandy's khaki work jacket
const SUIT_COLORS = { 0: 0x2244aa, 1: 0x666a70, 2: 0x1a1a22, boss: 0x8b0a1a };

let fritosTexture = null;
function getFritosTexture() {
    if (!fritosTexture) {
        fritosTexture = new THREE.TextureLoader().load(fritosUrl);
        fritosTexture.colorSpace = THREE.SRGBColorSpace;
        fritosTexture.magFilter = THREE.NearestFilter; // keep the pixel-art crunch
    }
    return fritosTexture;
}

/** Low-poly cartel employee. Returns group + animatable parts. */
export function buildEnemy(variant) {
    const g = new THREE.Group();
    const suit = SUIT_COLORS[variant] ?? SUIT_COLORS[0];
    const suitMat = mat(suit);
    const skinMat = mat(SKIN);
    const scale = variant === 'boss' ? 1.65 : 1.0;

    // legs (pants slightly darker)
    const pantsMat = mat(new THREE.Color(suit).multiplyScalar(0.6));
    const legL = box(0.09, 0.34, 0.1, pantsMat);
    const legR = box(0.09, 0.34, 0.1, pantsMat);
    legL.position.set(-0.07, 0.17, 0);
    legR.position.set(0.07, 0.17, 0);
    // pivot legs at hip: shift geometry down
    legL.geometry.translate(0, -0.17, 0); legL.position.y = 0.34;
    legR.geometry.translate(0, -0.17, 0); legR.position.y = 0.34;

    // torso + shirt + tie
    const torso = new THREE.Group();
    const body = box(0.3, 0.34, 0.16, suitMat);
    body.position.y = 0.17;
    const shirt = box(0.12, 0.3, 0.02, mat(0xf0f0e8));
    shirt.position.set(0, 0.18, 0.085);
    const tie = box(0.045, 0.2, 0.015, mat(variant === 'boss' ? 0xffd700 : 0xaa1122));
    tie.position.set(0, 0.16, 0.1);
    torso.add(body, shirt, tie);
    torso.position.y = 0.34;

    // arms — pivot at shoulder
    const armL = box(0.07, 0.3, 0.08, suitMat);
    const armR = box(0.07, 0.3, 0.08, suitMat);
    armL.geometry.translate(0, -0.13, 0);
    armR.geometry.translate(0, -0.13, 0);
    const handL = box(0.06, 0.06, 0.06, skinMat);
    const handR = box(0.06, 0.06, 0.06, skinMat);
    handL.position.y = -0.28; handR.position.y = -0.28;
    armL.add(handL); armR.add(handR);
    armL.position.set(-0.19, 0.31, 0);
    armR.position.set(0.19, 0.31, 0);
    torso.add(armL, armR);

    // head
    const headG = new THREE.Group();
    const head = box(0.16, 0.17, 0.15, skinMat);
    head.position.y = 0.085;
    headG.add(head);
    // hair
    const hair = box(0.17, 0.05, 0.16, mat(variant === 1 ? 0x999188 : 0x271a10));
    hair.position.y = 0.175;
    headG.add(hair);
    // eyes
    const eyeMat = mat(0x141414);
    for (const s of [-1, 1]) {
        const eye = box(0.025, 0.025, 0.01, eyeMat);
        eye.position.set(s * 0.04, 0.1, 0.078);
        headG.add(eye);
    }
    if (variant === 1) { // manager glasses
        const glassMat = mat(0x0a0a0a);
        const lens = box(0.13, 0.035, 0.012, glassMat);
        lens.position.set(0, 0.1, 0.082);
        headG.add(lens);
    }
    if (variant === 2 || variant === 'boss') { // hat
        const hatMat = mat(variant === 'boss' ? 0x550a14 : 0x111118);
        const brim = box(0.22, 0.02, 0.21, hatMat);
        brim.position.y = 0.18;
        const top = box(0.14, 0.09, 0.13, hatMat);
        top.position.y = 0.23;
        headG.add(brim, top);
    }
    headG.position.y = 0.52 + 0.34;
    // place head relative to torso top
    headG.position.set(0, 0.36, 0);
    torso.add(headG);

    if (variant === 'boss') {
        // cape
        const cape = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.55),
            mat(0x33060c, { side: THREE.DoubleSide })
        );
        cape.position.set(0, 0.05, -0.11);
        cape.rotation.x = 0.12;
        torso.add(cape);
        // golden scissors emblem
        const emblem = box(0.07, 0.07, 0.01, mat(0xffd700, { emissive: 0x806000, emissiveIntensity: 0.6 }));
        emblem.position.set(-0.09, 0.22, 0.085);
        emblem.rotation.z = Math.PI / 4;
        torso.add(emblem);
    }

    g.add(legL, legR, torso);
    g.scale.setScalar(scale);

    // collect suit materials for pain-flash
    const flashMats = [suitMat, pantsMat, skinMat];
    return { group: g, legL, legR, armL, armR, torso, headG, flashMats, height: 0.87 * scale };
}

/** Sandy's masterpiece table — the objective. */
export function buildTable() {
    const g = new THREE.Group();
    const wood = mat(0xa86a2c, { emissive: 0x331a00, emissiveIntensity: 0.45 });
    const top = box(0.52, 0.05, 0.36, wood);
    top.position.y = 0.3;
    g.add(top);
    const apron = box(0.44, 0.05, 0.28, wood);
    apron.position.y = 0.26;
    g.add(apron);
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.28, 8), wood);
            leg.position.set(sx * 0.21, 0.14, sz * 0.13);
            g.add(leg);
        }
    // golden halo ring
    const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.012, 8, 36),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.7 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.42;
    g.add(halo);
    g.userData.halo = halo;
    g.scale.setScalar(1.35);
    return g;
}

export function buildAmmo() {
    const g = new THREE.Group();
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.15, 12), mat(0xb8bcc4));
    bucket.position.y = 0.075;
    const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 12),
        mat(0x2266ff, { emissive: 0x0033aa, emissiveIntensity: 0.55 }));
    paint.position.y = 0.155;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.101, 0.095, 0.07, 12),
        mat(0x3377ee));
    label.position.y = 0.08;
    g.add(bucket, paint, label);
    g.scale.setScalar(1.55);
    return g;
}

/** Health — the legendary Fritos bag, straight from the original game.
 *  A camera-facing sprite, exactly like the 199X DOS billboards. */
export function buildHealth() {
    const g = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getFritosTexture(),
        transparent: true,
        alphaTest: 0.08,
    }));
    sprite.center.set(0.5, 0); // anchor at the bag's bottom edge
    sprite.scale.set(0.5, 0.56, 1);
    g.add(sprite);
    return g;
}

export function buildMoney() {
    const g = new THREE.Group();
    const coinMat = mat(0xffd24a, { emissive: 0x664400, emissiveIntensity: 0.5 });
    for (let i = 0; i < 3; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.018, 14), coinMat);
        coin.position.set((Math.random() - 0.5) * 0.06, 0.01 + i * 0.02, (Math.random() - 0.5) * 0.06);
        coin.rotation.y = Math.random() * Math.PI;
        g.add(coin);
    }
    const bill = box(0.14, 0.005, 0.07, mat(0x44aa55, { emissive: 0x114411, emissiveIntensity: 0.5 }));
    bill.position.set(0.05, 0.004, 0.04);
    bill.rotation.y = 0.5;
    g.add(bill);
    g.scale.setScalar(1.5);
    return g;
}

export function buildGoldBar() {
    const g = new THREE.Group();
    const goldMat = mat(0xffcc33, { emissive: 0x7a5500, emissiveIntensity: 0.7 });
    const bar1 = box(0.2, 0.06, 0.09, goldMat);
    bar1.position.y = 0.03;
    const bar2 = box(0.2, 0.06, 0.09, goldMat);
    bar2.position.set(0.04, 0.09, 0.01);
    bar2.rotation.y = 0.3;
    g.add(bar1, bar2);
    g.scale.setScalar(1.5);
    return g;
}

export function buildTableLegPickup() {
    const g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.5, 10),
        mat(0x8a5a2c, { emissive: 0x2a1500, emissiveIntensity: 0.4 }));
    leg.rotation.z = Math.PI / 2.4;
    leg.position.y = 0.2;
    g.add(leg);
    g.scale.setScalar(1.35);
    return g;
}

export function buildSprayerPickup() {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 12),
        mat(0xcc3322, { emissive: 0x441100, emissiveIntensity: 0.4 }));
    tank.position.y = 0.15;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 8), mat(0x333a44));
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(0.13, 0.2, 0);
    g.add(tank, nozzle);
    g.scale.setScalar(1.4);
    return g;
}

export function buildNailgunPickup() {
    const g = new THREE.Group();
    const body = box(0.24, 0.1, 0.09, mat(0xe07820, { emissive: 0x401c00, emissiveIntensity: 0.4 }));
    body.position.y = 0.2;
    const handle = box(0.05, 0.14, 0.07, mat(0x333a44));
    handle.position.set(-0.04, 0.11, 0);
    handle.rotation.z = 0.2;
    const nose = box(0.05, 0.12, 0.045, mat(0x8a929c));
    nose.position.set(0.12, 0.13, 0);
    g.add(body, handle, nose);
    g.scale.setScalar(1.4);
    return g;
}

export function buildRollerPickup() {
    const g = new THREE.Group();
    // a paint roller resting on its tray
    const tray = box(0.34, 0.04, 0.22, mat(0x4a525c));
    tray.position.y = 0.02;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12),
        mat(0xffaa22, { emissive: 0x553300, emissiveIntensity: 0.5 }));
    roll.rotation.z = Math.PI / 2;
    roll.position.y = 0.1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), mat(0x9aa2ac));
    stem.position.set(0.1, 0.2, 0.05);
    stem.rotation.x = 0.7;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8), mat(0x2266cc));
    grip.position.set(0.1, 0.3, 0.12);
    grip.rotation.x = 0.7;
    g.add(tray, roll, stem, grip);
    g.scale.setScalar(1.4);
    return g;
}

// ---------------- WEAPON VIEWMODELS ----------------

/**
 * Sandy's arm: khaki sleeve from off-screen up to a skin-tone hand at `gripAt`.
 * `fingerAxis` ('x'|'y'|'z') orients the curled fingers around the weapon handle.
 */
function buildArm({ gripAt, elbowAt, handleRadius = 0.02, fingerAxis = 'z' }) {
    const arm = new THREE.Group();
    const grip = new THREE.Vector3(...gripAt);
    const elbow = new THREE.Vector3(...elbowAt);
    const dir = new THREE.Vector3().subVectors(grip, elbow);
    const len = dir.length();

    // forearm sleeve, tapered toward the wrist
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.046, len, 10), mat(SLEEVE));
    fore.position.copy(elbow).addScaledVector(dir, 0.5);
    fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    arm.add(fore);

    // rolled-up cuff at the elbow end
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 10),
        mat(0x7d6b4d));
    cuff.position.copy(elbow).addScaledVector(dir, 0.12);
    cuff.quaternion.copy(fore.quaternion);
    arm.add(cuff);

    // bare wrist between cuff and hand
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.027, len * 0.3, 10), mat(SKIN));
    wrist.position.copy(elbow).addScaledVector(dir, 0.82);
    wrist.quaternion.copy(fore.quaternion);
    arm.add(wrist);

    // palm
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), mat(SKIN));
    hand.scale.set(1, 0.85, 1.2);
    hand.position.copy(grip);
    arm.add(hand);

    // curled fingers wrapped around the handle
    const fingers = new THREE.Mesh(
        new THREE.CylinderGeometry(handleRadius + 0.013, handleRadius + 0.013, 0.052, 10),
        mat(SKIN));
    if (fingerAxis === 'z') fingers.rotation.x = Math.PI / 2;
    else if (fingerAxis === 'x') fingers.rotation.z = Math.PI / 2;
    fingers.position.copy(grip);
    arm.add(fingers);
    arm.userData.fingers = fingers;

    // thumb hooked over the top
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.05, 8), mat(SKIN));
    thumb.position.copy(grip).add(new THREE.Vector3(-0.02, 0.022, 0));
    thumb.rotation.z = 0.9;
    arm.add(thumb);

    return arm;
}

export function buildBrushViewmodel() {
    // built along -Z so it points away from the camera, then tilted
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.017, 0.18, 10), mat(0x8a5a2e));
    handle.rotation.x = Math.PI / 2;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.016, 0.05, 10), mat(0xd8d5cc));
    ferrule.rotation.x = Math.PI / 2;
    ferrule.position.z = -0.115;
    const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 10),
        mat(0x4488ff, { emissive: 0x1133aa, emissiveIntensity: 0.5 }));
    bristles.rotation.x = -Math.PI / 2; // cone tip toward -Z
    bristles.position.z = -0.18;
    g.add(handle, ferrule, bristles);
    // Sandy's arm reaching in from the lower right, hand on the handle
    g.add(buildArm({
        gripAt: [0, -0.005, 0.05],
        elbowAt: [0.13, -0.3, 0.3],
        handleRadius: 0.015,
        fingerAxis: 'z',
    }));
    g.userData.bristles = bristles;
    g.userData.baseRotX = -0.18; // slight upward tilt like a held brush
    g.rotation.y = 0.14;         // angled slightly toward screen center
    g.scale.setScalar(0.9);
    return g;
}

export function buildLegViewmodel() {
    const g = new THREE.Group();
    // raised so the gripping hand stays on-screen
    const inner = new THREE.Group();
    inner.position.y = 0.08;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 10), mat(0x8a5a2c));
    leg.rotation.x = -Math.PI / 3;
    leg.position.set(0, 0.1, -0.1);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.1, 10), mat(0x444444));
    grip.rotation.x = -Math.PI / 3;
    grip.position.set(0, -0.06, -0.005);
    inner.add(leg, grip);
    // fist on the wrapped handle, arm reaching in from the lower right
    // (kept short so mid-swing the arm stays attached to the leg on screen)
    const arm = buildArm({
        gripAt: [0, -0.05, 0.0],
        elbowAt: [0.12, -0.21, 0.18],
        handleRadius: 0.052,
        fingerAxis: 'none',
    });
    // align the finger wrap with the leg's tilt
    arm.userData.fingers.rotation.x = -Math.PI / 3;
    inner.add(arm);
    g.add(inner);
    return g;
}

export function buildSprayerViewmodel() {
    const g = new THREE.Group();
    // raised so the trigger hand stays on-screen
    const inner = new THREE.Group();
    inner.position.y = 0.06;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), mat(0xcc3322));
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, 0.02, 0.02);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.2, 10), mat(0x333a44));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.12);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.03, 10),
        mat(0x88ff66, { emissive: 0x226611, emissiveIntensity: 0.6 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.05, -0.225);
    // pistol grip under the tank for Sandy to hold
    const gripStock = box(0.032, 0.085, 0.045, mat(0x2a2f38));
    gripStock.position.set(0, -0.04, 0.055);
    gripStock.rotation.x = 0.25;
    inner.add(tank, barrel, tip, gripStock);
    // trigger hand on the grip
    inner.add(buildArm({
        gripAt: [0, -0.05, 0.06],
        elbowAt: [0.16, -0.27, 0.28],
        handleRadius: 0.024,
        fingerAxis: 'y',
    }));
    // off-hand steadying the barrel from the left
    inner.add(buildArm({
        gripAt: [-0.015, 0.035, -0.09],
        elbowAt: [-0.26, -0.26, 0.22],
        handleRadius: 0.018,
        fingerAxis: 'z',
    }));
    g.add(inner);
    return g;
}

export function buildNailgunViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.05;
    // contractor-orange body
    const body = box(0.07, 0.085, 0.2, mat(0xe07820));
    body.position.set(0, 0.02, -0.04);
    const nose = box(0.034, 0.1, 0.05, mat(0x8a929c));
    nose.position.set(0, -0.01, -0.165);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), mat(0x444c56));
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.01, -0.21);
    // nail magazine slanting back under the body
    const mag = box(0.03, 0.07, 0.16, mat(0x39404a));
    mag.position.set(0, -0.045, -0.02);
    mag.rotation.x = -0.5;
    const gripStock = box(0.034, 0.09, 0.05, mat(0x333a44));
    gripStock.position.set(0, -0.05, 0.06);
    gripStock.rotation.x = 0.3;
    inner.add(body, nose, tip, mag, gripStock);
    inner.add(buildArm({
        gripAt: [0, -0.055, 0.065],
        elbowAt: [0.15, -0.27, 0.27],
        handleRadius: 0.022,
        fingerAxis: 'y',
    }));
    g.add(inner);
    g.userData.baseRotX = 0;
    return g;
}

export function buildRollerViewmodel() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = 0.06;
    // fat launcher tube
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.3, 12), mat(0x4a525c));
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.02, -0.07);
    const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.035, 12), mat(0xc9a227));
    muzzleRing.rotation.x = Math.PI / 2;
    muzzleRing.position.set(0, 0.02, -0.215);
    // loaded paint roller peeking out of the muzzle
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.085, 12),
        mat(0xffaa22, { emissive: 0x664400, emissiveIntensity: 0.5 }));
    roll.rotation.x = Math.PI / 2;
    roll.position.set(0, 0.02, -0.25);
    // pressure tank under the tube
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), mat(0xcc3322));
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, -0.045, 0.02);
    const gripStock = box(0.034, 0.09, 0.05, mat(0x2a2f38));
    gripStock.position.set(0, -0.06, 0.08);
    gripStock.rotation.x = 0.3;
    inner.add(tube, muzzleRing, roll, tank, gripStock);
    // trigger hand
    inner.add(buildArm({
        gripAt: [0, -0.065, 0.085],
        elbowAt: [0.15, -0.27, 0.28],
        handleRadius: 0.024,
        fingerAxis: 'y',
    }));
    // off-hand under the tube
    inner.add(buildArm({
        gripAt: [-0.01, -0.02, -0.13],
        elbowAt: [-0.25, -0.27, 0.2],
        handleRadius: 0.055,
        fingerAxis: 'z',
    }));
    g.add(inner);
    g.userData.baseRotX = 0;
    return g;
}

// ---------------- LEVEL PROPS ----------------
// Low-poly set dressing. Each builder returns a group sized to sit inside one
// grid cell (≈1 unit, wall height 1.35). `tall: true` props also block shots.

export function buildPlant() {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 10), mat(0xa0522d));
    pot.position.y = 0.09;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 10), mat(0x2a1c10));
    soil.position.y = 0.18;
    g.add(pot, soil);
    const leafMat = mat(0x2d7a35);
    for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 6), leafMat);
        const a = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.06, 0.38, Math.sin(a) * 0.06);
        leaf.rotation.z = Math.cos(a) * 0.55;
        leaf.rotation.x = -Math.sin(a) * 0.55;
        g.add(leaf);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), leafMat);
    crown.position.y = 0.45;
    g.add(crown);
    return g;
}

export function buildCooler() {
    const g = new THREE.Group();
    const body = box(0.26, 0.5, 0.26, mat(0xe8e4da));
    body.position.y = 0.25;
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.22, 10),
        mat(0x55aadd, { emissive: 0x113344, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }));
    bottle.position.y = 0.61;
    const tap = box(0.05, 0.04, 0.04, mat(0x4488cc));
    tap.position.set(0, 0.38, 0.15);
    g.add(body, bottle, tap);
    return g;
}

export function buildCabinet() {
    const g = new THREE.Group();
    const body = box(0.44, 0.86, 0.36, mat(0x8a8f96));
    body.position.y = 0.43;
    g.add(body);
    const seamMat = mat(0x5a5f66);
    for (let i = 0; i < 3; i++) {
        const seam = box(0.4, 0.012, 0.015, seamMat);
        seam.position.set(0, 0.2 + i * 0.25, 0.185);
        g.add(seam);
        const handle = box(0.1, 0.025, 0.02, mat(0x3a3f46));
        handle.position.set(0, 0.3 + i * 0.25, 0.19);
        g.add(handle);
    }
    return g;
}

export function buildCrate() {
    const g = new THREE.Group();
    const body = box(0.52, 0.52, 0.52, mat(0x9a6f3a));
    body.position.y = 0.26;
    g.add(body);
    const edgeMat = mat(0x6e4a20);
    for (const y of [0.04, 0.48]) {
        const e1 = box(0.56, 0.06, 0.56, edgeMat);
        e1.position.y = y;
        g.add(e1);
    }
    const brace = box(0.07, 0.62, 0.015, edgeMat);
    brace.position.set(0, 0.26, 0.27);
    brace.rotation.z = Math.PI / 4;
    g.add(brace);
    return g;
}

export function buildBarrel() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.56, 12), mat(0x4a5a66));
    body.position.y = 0.28;
    g.add(body);
    const ringMat = mat(0x2c3640);
    for (const y of [0.12, 0.44]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 12), ringMat);
        ring.position.y = y;
        g.add(ring);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), mat(0x66767f));
    lid.position.y = 0.57;
    g.add(lid);
    return g;
}

export function buildShelf() {
    const g = new THREE.Group();
    const frameMat = mat(0x6e5638);
    for (const x of [-0.32, 0.32]) {
        const side = box(0.05, 1.1, 0.3, frameMat);
        side.position.set(x, 0.55, 0);
        g.add(side);
    }
    const boxMat1 = mat(0xb09a6a), boxMat2 = mat(0x8a8276);
    for (let i = 0; i < 4; i++) {
        const board = box(0.69, 0.035, 0.3, frameMat);
        board.position.y = 0.12 + i * 0.31;
        g.add(board);
        // clutter on each shelf except the top
        if (i < 3) {
            const n = 2 + (i % 2);
            for (let j = 0; j < n; j++) {
                const bw = 0.12 + (j % 3) * 0.03;
                const item = box(bw, 0.16, 0.2, j % 2 ? boxMat1 : boxMat2);
                item.position.set(-0.2 + j * 0.2, 0.12 + i * 0.31 + 0.1, 0);
                g.add(item);
            }
        }
    }
    return g;
}

export function buildDesk() {
    const g = new THREE.Group();
    const deskMat = mat(0xb8a888);
    const top = box(0.8, 0.04, 0.5, deskMat);
    top.position.y = 0.42;
    g.add(top);
    for (const x of [-0.37, 0.37]) {
        const side = box(0.04, 0.42, 0.46, deskMat);
        side.position.set(x, 0.21, 0);
        g.add(side);
    }
    // CRT monitor
    const crt = box(0.24, 0.2, 0.2, mat(0xd8d2c0));
    crt.position.set(-0.12, 0.55, -0.05);
    const screen = box(0.17, 0.13, 0.01, mat(0x1a2a3a, { emissive: 0x224466, emissiveIntensity: 0.8 }));
    screen.position.set(-0.12, 0.555, 0.052);
    const keyb = box(0.26, 0.02, 0.1, mat(0xc8c2b0));
    keyb.position.set(0.12, 0.45, 0.08);
    g.add(crt, screen, keyb);
    // office chair tucked in front
    const seat = box(0.26, 0.04, 0.26, mat(0x333a44));
    seat.position.set(0, 0.24, 0.42);
    const back = box(0.26, 0.3, 0.04, mat(0x333a44));
    back.position.set(0, 0.4, 0.55);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), mat(0x222222));
    pole.position.set(0, 0.12, 0.42);
    g.add(seat, back, pole);
    return g;
}

export function buildBench() {
    const g = new THREE.Group();
    const woodMat = mat(0x8a5a30);
    const seat = box(0.85, 0.05, 0.32, woodMat);
    seat.position.y = 0.26;
    g.add(seat);
    const back = box(0.85, 0.28, 0.05, woodMat);
    back.position.set(0, 0.43, -0.15);
    back.rotation.x = -0.12;
    g.add(back);
    const legMat = mat(0x4a4a52);
    for (const x of [-0.36, 0.36]) {
        const leg = box(0.05, 0.26, 0.28, legMat);
        leg.position.set(x, 0.13, 0);
        g.add(leg);
    }
    return g;
}

export function buildPallet() {
    const g = new THREE.Group();
    const woodMat = mat(0x9a7a4a);
    for (let i = 0; i < 5; i++) {
        const slat = box(0.7, 0.03, 0.1, woodMat);
        slat.position.set(0, 0.1, -0.28 + i * 0.14);
        g.add(slat);
    }
    for (const x of [-0.28, 0, 0.28]) {
        const runner = box(0.1, 0.08, 0.66, woodMat);
        runner.position.set(x, 0.05, 0);
        g.add(runner);
    }
    // flat-pack boxes stacked on top
    const fp1 = box(0.5, 0.09, 0.55, mat(0xc8b088));
    fp1.position.y = 0.17;
    const fp2 = box(0.44, 0.09, 0.48, mat(0xb89c70));
    fp2.position.set(0.02, 0.26, -0.02);
    fp2.rotation.y = 0.15;
    g.add(fp1, fp2);
    return g;
}

export function buildStatue() {
    const g = new THREE.Group();
    const goldMat = mat(0xd4af37, { emissive: 0x5a4408, emissiveIntensity: 0.5 });
    const base = box(0.34, 0.16, 0.34, mat(0x2a2a30));
    base.position.y = 0.08;
    const plinth = box(0.26, 0.4, 0.26, mat(0x3a3a42));
    plinth.position.y = 0.36;
    g.add(base, plinth);
    // a golden table — what else would the cartel idolize?
    const ttop = box(0.3, 0.035, 0.2, goldMat);
    ttop.position.y = 0.75;
    g.add(ttop);
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.17, 8), goldMat);
            tleg.position.set(sx * 0.12, 0.65, sz * 0.07);
            g.add(tleg);
        }
    return g;
}

export function buildMachine() {
    const g = new THREE.Group();
    const body = box(0.7, 0.85, 0.55, mat(0x55606a));
    body.position.y = 0.425;
    g.add(body);
    const panel = box(0.3, 0.22, 0.02, mat(0x2a3038));
    panel.position.set(-0.12, 0.6, 0.285);
    g.add(panel);
    const lampOn = box(0.05, 0.05, 0.03, mat(0xff4422, { emissive: 0xaa1100, emissiveIntensity: 1 }));
    lampOn.position.set(0.18, 0.66, 0.285);
    const lampOk = box(0.05, 0.05, 0.03, mat(0x44ff66, { emissive: 0x00aa22, emissiveIntensity: 1 }));
    lampOk.position.set(0.26, 0.66, 0.285);
    g.add(lampOn, lampOk);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10), mat(0x3c454e));
    pipe.position.set(0.22, 1.05, -0.1);
    g.add(pipe);
    const vent = box(0.4, 0.12, 0.02, mat(0x1e242a));
    vent.position.set(0, 0.2, 0.285);
    g.add(vent);
    return g;
}

export function buildCounter() {
    const g = new THREE.Group();
    const body = box(0.9, 0.5, 0.42, mat(0x7a5a32));
    body.position.y = 0.25;
    const top = box(0.98, 0.05, 0.5, mat(0x9a7442));
    top.position.y = 0.52;
    const kick = box(0.9, 0.08, 0.02, mat(0x3a2a16));
    kick.position.set(0, 0.04, 0.21);
    g.add(body, top, kick);
    // little brass register on one end
    const register = box(0.16, 0.12, 0.14, mat(0x8a8276));
    register.position.set(0.3, 0.6, 0);
    const keys = box(0.12, 0.02, 0.1, mat(0x3a3f46));
    keys.position.set(0.3, 0.665, 0.01);
    g.add(register, keys);
    return g;
}

export function buildSofa() {
    const g = new THREE.Group();
    const fabric = mat(0x7a3a30);
    const seat = box(0.85, 0.18, 0.4, fabric);
    seat.position.y = 0.21;
    const back = box(0.85, 0.32, 0.12, fabric);
    back.position.set(0, 0.4, -0.16);
    g.add(seat, back);
    for (const x of [-0.39, 0.39]) {
        const arm = box(0.1, 0.16, 0.4, fabric);
        arm.position.set(x, 0.36, 0);
        g.add(arm);
    }
    const baseMat = mat(0x2c1c12);
    const base = box(0.82, 0.1, 0.36, baseMat);
    base.position.y = 0.07;
    g.add(base);
    // throw cushion
    const cushion = box(0.2, 0.14, 0.08, mat(0xc9a227));
    cushion.position.set(-0.22, 0.36, -0.1);
    cushion.rotation.z = 0.2;
    g.add(cushion);
    return g;
}

/** FRITOS® vending machine — the cartel keeps the good stuff locked up. */
export function buildVending() {
    const g = new THREE.Group();
    const body = box(0.55, 1.15, 0.45, mat(0xb02818));
    body.position.y = 0.575;
    g.add(body);
    // glowing front panel with the goods
    const panel = box(0.4, 0.62, 0.02, mat(0x18242e, { emissive: 0x0c1620, emissiveIntensity: 0.8 }));
    panel.position.set(-0.04, 0.74, 0.23);
    g.add(panel);
    // rows of little chip bags behind the glass
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
            const bag = box(0.09, 0.13, 0.015,
                mat(c % 2 ? 0xe8a020 : 0xcc4422, { emissive: 0x442200, emissiveIntensity: 0.5 }));
            bag.position.set(-0.16 + c * 0.12, 0.52 + r * 0.19, 0.245);
            g.add(bag);
        }
    // marquee
    const marquee = box(0.45, 0.14, 0.03, mat(0xffd24a, { emissive: 0x806000, emissiveIntensity: 0.9 }));
    marquee.position.set(0, 1.05, 0.235);
    g.add(marquee);
    // coin slot + dispenser
    const slotCol = box(0.1, 0.4, 0.02, mat(0x6a6a72));
    slotCol.position.set(0.2, 0.74, 0.23);
    const tray = box(0.34, 0.12, 0.04, mat(0x1a1a20));
    tray.position.set(-0.04, 0.22, 0.22);
    g.add(slotCol, tray);
    return g;
}

export function buildFridge() {
    const g = new THREE.Group();
    const body = box(0.5, 1.05, 0.45, mat(0xd8d4ca));
    body.position.y = 0.525;
    const seam = box(0.5, 0.015, 0.46, mat(0x8a867c));
    seam.position.y = 0.72;
    g.add(body, seam);
    for (const [y, h] of [[0.85, 0.18], [0.45, 0.3]]) {
        const handle = box(0.03, h, 0.03, mat(0x9a968c));
        handle.position.set(0.2, y, 0.24);
        g.add(handle);
    }
    return g;
}

export function buildFloorLamp() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 10), mat(0x3a3026));
    base.position.y = 0.02;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.85, 8), mat(0x8a7a52));
    pole.position.y = 0.46;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.18, 10),
        mat(0xf2e2b8, { emissive: 0xaa8844, emissiveIntensity: 0.9 }));
    shade.position.y = 0.95;
    g.add(base, pole, shade);
    return g;
}

/** Big banquet table — for conference rooms and reading rooms. */
export function buildBigTable() {
    const g = new THREE.Group();
    const wood = mat(0x8a5a2c);
    const top = box(1.3, 0.06, 0.7, wood);
    top.position.y = 0.42;
    g.add(top);
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const leg = box(0.07, 0.4, 0.07, wood);
            leg.position.set(sx * 0.56, 0.2, sz * 0.27);
            g.add(leg);
        }
    const runner = box(0.5, 0.012, 0.66, mat(0x6a1f1a));
    runner.position.y = 0.455;
    g.add(runner);
    return g;
}

export function buildLumberStack() {
    const g = new THREE.Group();
    for (let layer = 0; layer < 4; layer++) {
        const n = 4 - (layer % 2);
        for (let i = 0; i < n; i++) {
            const plank = box(0.16, 0.09, 0.95,
                mat(0x9a7442 + (((layer + i) % 3) * 0x60300)));
            plank.position.set(-0.27 + i * 0.18 + (layer % 2) * 0.09, 0.05 + layer * 0.1, 0);
            g.add(plank);
        }
    }
    return g;
}

export function buildCopier() {
    const g = new THREE.Group();
    const body = box(0.55, 0.62, 0.45, mat(0xd0ccc0));
    body.position.y = 0.31;
    const deck = box(0.58, 0.07, 0.48, mat(0xb8b4a8));
    deck.position.y = 0.65;
    const lid = box(0.4, 0.03, 0.32, mat(0x8a867c));
    lid.position.set(-0.02, 0.7, 0);
    lid.rotation.z = 0.06;
    const panel = box(0.16, 0.02, 0.12, mat(0x2a3a2a, { emissive: 0x1a4a2a, emissiveIntensity: 0.8 }));
    panel.position.set(0.19, 0.665, 0.16);
    const tray = box(0.3, 0.02, 0.18, mat(0xe8e4da));
    tray.position.set(-0.05, 0.42, 0.3);
    tray.rotation.x = -0.15;
    g.add(body, deck, lid, panel, tray);
    return g;
}

/**
 * Prop registry: { build, tall, hp, height, radius }.
 * tall props block shots/sight · hp = smash resistance ·
 * height = how high shots can hit it · radius = walk-around collision circle.
 */
export const PROP_BUILDERS = {
    plant:     { build: buildPlant,      tall: false, hp: 20,  height: 0.85, radius: 0.24 },
    cooler:    { build: buildCooler,     tall: false, hp: 30,  height: 0.75, radius: 0.26 },
    cabinet:   { build: buildCabinet,    tall: true,  hp: 60,  height: 0.9,  radius: 0.32 },
    crate:     { build: buildCrate,      tall: false, hp: 30,  height: 0.6,  radius: 0.34 },
    barrel:    { build: buildBarrel,     tall: false, hp: 40,  height: 0.62, radius: 0.28 },
    shelf:     { build: buildShelf,      tall: true,  hp: 60,  height: 1.15, radius: 0.38 },
    desk:      { build: buildDesk,       tall: false, hp: 40,  height: 0.72, radius: 0.42 },
    bench:     { build: buildBench,      tall: false, hp: 35,  height: 0.6,  radius: 0.4 },
    pallet:    { build: buildPallet,     tall: false, hp: 25,  height: 0.35, radius: 0.4 },
    statue:    { build: buildStatue,     tall: false, hp: 80,  height: 0.85, radius: 0.28 },
    machine:   { build: buildMachine,    tall: true,  hp: 100, height: 1.3,  radius: 0.42 },
    counter:   { build: buildCounter,    tall: false, hp: 45,  height: 0.7,  radius: 0.45 },
    sofa:      { build: buildSofa,       tall: false, hp: 40,  height: 0.6,  radius: 0.44 },
    vending:   { build: buildVending,    tall: true,  hp: 80,  height: 1.25, radius: 0.34 },
    fridge:    { build: buildFridge,     tall: true,  hp: 70,  height: 1.1,  radius: 0.32 },
    floorLamp: { build: buildFloorLamp,  tall: false, hp: 15,  height: 1.05, radius: 0.16 },
    bigTable:  { build: buildBigTable,   tall: false, hp: 40,  height: 0.5,  radius: 0.5 },
    lumber:    { build: buildLumberStack, tall: false, hp: 25, height: 0.45, radius: 0.42 },
    copier:    { build: buildCopier,     tall: false, hp: 50,  height: 0.95, radius: 0.34 },
};

// ---------------- WALL & FLOOR DECOR (non-blocking) ----------------

let paintingTextures = null;
function getPaintingTextures() {
    if (paintingTextures) return paintingTextures;
    paintingTextures = [];
    const motifs = [
        (ctx, w, h) => { // proud table portrait
            ctx.fillStyle = '#27415f';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#0f1d2e';
            ctx.fillRect(0, h * 0.62, w, h * 0.38);
            ctx.fillStyle = '#b07a3a';
            ctx.fillRect(w * 0.2, h * 0.42, w * 0.6, h * 0.08);
            ctx.fillRect(w * 0.26, h * 0.5, w * 0.07, h * 0.26);
            ctx.fillRect(w * 0.67, h * 0.5, w * 0.07, h * 0.26);
            ctx.fillStyle = '#ffd76a';
            ctx.beginPath(); ctx.arc(w * 0.78, h * 0.2, w * 0.09, 0, 7); ctx.fill();
        },
        (ctx, w, h) => { // paint splat abstract
            ctx.fillStyle = '#e8e0cc';
            ctx.fillRect(0, 0, w, h);
            for (const col of ['#c0392b', '#2980b9', '#f1c40f']) {
                ctx.fillStyle = col;
                const x = w * (0.25 + Math.random() * 0.5), y = h * (0.25 + Math.random() * 0.5);
                ctx.beginPath(); ctx.arc(x, y, w * (0.1 + Math.random() * 0.12), 0, 7); ctx.fill();
                for (let i = 0; i < 5; i++) {
                    const a = Math.random() * Math.PI * 2, d = w * 0.18;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, w * 0.03, 0, 7);
                    ctx.fill();
                }
            }
        },
        (ctx, w, h) => { // mountain landscape
            ctx.fillStyle = '#8aa8c8';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#54708e';
            ctx.beginPath();
            ctx.moveTo(0, h * 0.8); ctx.lineTo(w * 0.35, h * 0.3); ctx.lineTo(w * 0.62, h * 0.8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#3c5470';
            ctx.beginPath();
            ctx.moveTo(w * 0.4, h * 0.8); ctx.lineTo(w * 0.72, h * 0.4); ctx.lineTo(w, h * 0.8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(0, h * 0.78, w, h * 0.22);
            ctx.fillStyle = '#f5e6b8';
            ctx.beginPath(); ctx.arc(w * 0.2, h * 0.22, w * 0.08, 0, 7); ctx.fill();
        },
    ];
    for (const paint of motifs) {
        const c = document.createElement('canvas');
        c.width = 96; c.height = 72;
        paint(c.getContext('2d'), 96, 72);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        paintingTextures.push(t);
    }
    return paintingTextures;
}

/** Framed painting that hangs flat on a wall face. */
export function buildPainting(variant = 0) {
    const g = new THREE.Group();
    const texList = getPaintingTextures();
    const frame = box(0.56, 0.44, 0.03, mat(0x6a4a22));
    const canvas = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.36),
        new THREE.MeshLambertMaterial({ map: texList[variant % texList.length] })
    );
    canvas.position.z = 0.018;
    g.add(frame, canvas);
    return g;
}

/** Flat area rug — pure decor, no collision. */
export function buildRug(color = 0x7a2a22) {
    const g = new THREE.Group();
    const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.0),
        new THREE.MeshLambertMaterial({ color })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.008;
    const border = new THREE.Mesh(
        new THREE.PlaneGeometry(1.62, 1.12),
        new THREE.MeshLambertMaterial({ color: 0xc8a86a })
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.005;
    g.add(border, rug);
    return g;
}
