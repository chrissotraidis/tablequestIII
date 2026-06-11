/**
 * PROCEDURAL 3D MODELS — enemies, tables, pickups, weapon viewmodels.
 */
import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

const SKIN = 0xe8b890;
const SUIT_COLORS = { 0: 0x2244aa, 1: 0x666a70, 2: 0x1a1a22, boss: 0x8b0a1a };

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
    return g;
}

export function buildHealth() {
    const g = new THREE.Group();
    const kit = box(0.2, 0.13, 0.14, mat(0xf2f0e8));
    kit.position.y = 0.065;
    const crossMat = mat(0xdd2222, { emissive: 0x550000, emissiveIntensity: 0.5 });
    const c1 = box(0.1, 0.035, 0.145, crossMat);
    const c2 = box(0.035, 0.1, 0.145, crossMat);
    c1.position.y = 0.065; c2.position.y = 0.065;
    g.add(kit, c1, c2);
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
    return g;
}

export function buildTableLegPickup() {
    const g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.5, 10),
        mat(0x8a5a2c, { emissive: 0x2a1500, emissiveIntensity: 0.4 }));
    leg.rotation.z = Math.PI / 2.4;
    leg.position.y = 0.2;
    g.add(leg);
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
    return g;
}

// ---------------- WEAPON VIEWMODELS ----------------

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
    // Sandy's hand gripping the handle
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), mat(0xe8b890));
    hand.scale.set(1, 0.85, 1.25);
    hand.position.set(0, -0.008, 0.05);
    g.add(handle, ferrule, bristles, hand);
    g.userData.bristles = bristles;
    g.userData.baseRotX = -0.18; // slight upward tilt like a held brush
    g.rotation.y = 0.14;         // angled slightly toward screen center
    g.scale.setScalar(0.9);
    return g;
}

export function buildLegViewmodel() {
    const g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 10), mat(0x8a5a2c));
    leg.rotation.x = -Math.PI / 3;
    leg.position.set(0, 0.1, -0.1);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.1, 10), mat(0x444444));
    grip.rotation.x = -Math.PI / 3;
    grip.position.set(0, -0.06, -0.005);
    g.add(leg, grip);
    return g;
}

export function buildSprayerViewmodel() {
    const g = new THREE.Group();
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
    g.add(tank, barrel, tip);
    return g;
}
