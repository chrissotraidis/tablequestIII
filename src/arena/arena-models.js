import * as THREE from 'three';
import { poseEnemy, poseDeath } from '../enemyanim.js';
import {
    buildEnemy,
    buildBrushViewmodel,
    buildLegViewmodel,
    buildSprayerViewmodel,
    buildNailgunViewmodel,
    buildRollerViewmodel,
} from '../models.js';

// Grip positions include the legacy builders' inner-group offsets.
const TOOLS = {
    paintbrush: [buildBrushViewmodel, [0, -0.005, 0.05]],
    tableLeg: [buildLegViewmodel, [0, 0.03, 0]],
    sprayer: [buildSprayerViewmodel, [0, 0.01, 0.06]],
    nailgun: [buildNailgunViewmodel, [0, -0.005, 0.065]],
    roller: [buildRollerViewmodel, [0, -0.005, 0.085]],
};

// These builders allocate resources per instance; detached visuals are owned here.
function disposeVisual(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(object => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        for (const material of [].concat(object.material)) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
}

/** Release one staff member and its attached tool when its room slot goes away. */
export function disposeArenaBody(body) {
    body.group.removeFromParent();
    disposeVisual(body.group);
}

/**
 * Build an independently colorized staff body. variant: 0, 1, 2 or 'boss'.
 * color accepts a THREE.Color, CSS color or hex number; omitted keeps rank colors.
 * Returns the existing { group, legL, legR, armL, armR, torso, headG,
 * flashMats, height } interface plus weapon (initially null).
 * The caller owns placement, scale and final geometry/material disposal.
 */
export function buildArenaBody({ variant = 0, color } = {}) {
    if (![0, 1, 2, 'boss'].includes(variant)) {
        throw new RangeError(`Unknown staff variant: ${variant}`);
    }
    const body = buildEnemy(variant);
    if (color !== undefined) {
        // Suit and pants are per-body materials; leave skin and rank details intact.
        body.flashMats[0].color.set(color);
        body.flashMats[1].color.copy(body.flashMats[0].color).multiplyScalar(0.6);
    }
    body.group.name = 'arena-staff';
    body.group.traverse(object => {
        if (object.isMesh) object.castShadow = object.receiveShadow = true;
    });
    body.weapon = null;
    // Campaign posing uses a 0.40 torso baseline; retain this rig's authored rest.
    body.arenaPose = { torsoY: body.torso.position.y, enemy: {} };
    updateArenaBodyPose(body);
    return body;
}

/**
 * Build a detached, arm-free tool Group for world or camera placement.
 * Supports paintbrush, tableLeg, sprayer, nailgun and roller.
 * The grip is at the origin, with identity root transforms and forward along -Z
 * (the table leg retains its authored tilt). The caller owns placement/disposal.
 */
export function buildArenaTool(weapon) {
    if (!Object.hasOwn(TOOLS, weapon)) {
        throw new RangeError(`Unknown Arena tool: ${weapon}`);
    }
    const [build, grip] = TOOLS[weapon];
    const visual = build();
    // Legacy buildArm marks its root with userData.fingers. Remove complete
    // arms, including off-hands, without relying on child indices or colors.
    const arms = [];
    visual.traverse(object => { if (object.userData.fingers) arms.push(object); });
    for (const arm of arms) {
        arm.removeFromParent();
        disposeVisual(arm);
    }
    visual.rotation.set(0, 0, 0);
    visual.scale.setScalar(1);
    visual.position.set(-grip[0], -grip[1], -grip[2]);
    const tool = new THREE.Group();
    tool.name = `arena-tool-${weapon}`;
    tool.userData.weapon = weapon;
    tool.add(visual);
    tool.traverse(object => {
        if (object.isMesh) object.castShadow = object.receiveShadow = true;
    });
    return tool;
}

export function setArenaToolPaint(tool, color) {
    if(!tool)return;
    tool.traverse(object=>{
        const bristles=object.userData.bristles;
        if(!bristles)return;
        bristles.material.color.set(color);
        bristles.material.emissive.copy(bristles.material.color).multiplyScalar(.25);
    });
}

/**
 * Attach a tool to the body's right hand in the scene graph (never to a camera).
 * weapon: paintbrush, tableLeg, sprayer, nailgun, roller; null unequips.
 * Returns the attached Group, or null. Replacing a tool disposes its resources;
 * repeated attachment of the same tool reuses the existing visual.
 */
export function attachArenaWeapon(body, weapon = 'paintbrush') {
    if (weapon !== null && !Object.hasOwn(TOOLS, weapon)) {
        throw new RangeError(`Unknown Arena tool: ${weapon}`);
    }
    if (body.weapon?.userData.weapon === weapon) return body.weapon;

    let attachment = null;
    if (weapon !== null) {
        attachment = buildArenaTool(weapon);
        setArenaToolPaint(attachment,body.flashMats[0].color);
        // Local -Y follows the raised arm; legacy tools point down local -Z.
        attachment.rotation.x = -Math.PI / 2;
        attachment.position.set(0, -0.28, 0);
    }
    if (body.weapon) {
        body.weapon.removeFromParent();
        disposeVisual(body.weapon);
    }
    body.weapon = attachment;
    if (attachment) body.armR.add(attachment);
    return attachment;
}

/**
 * Apply an absolute presentation pose, with no clock, input or simulation access.
 * yaw/pitch: radians, yaw=0 faces +Z, positive pitch looks up.
 * movement: normalized speed [0,1]; phase: caller-provided walk-cycle radians.
 * time: optional presentation seconds; defaults to phase / 7.5 (legacy caller).
 * fireT: remaining shot-recoil seconds [0,0.18]; windUp: pre-attack pose.
 * flinchT: remaining hit-reaction seconds [0,0.3]. These are presentation cues,
 * not inferred attacks: the caller must supply them from confirmed events.
 * alive: 0/false hides the body unless deathT is supplied. deathT is campaign
 * death progress [0,1.2], held at the supplied pose; deathSide is -1 or 1.
 * Nonfinite numeric inputs fall back to idle. Root position/scale are untouched;
 * callers displaying death must also allow dead bodies to remain visible.
 */
export function updateArenaBodyPose(body, {
    yaw = 0, pitch = 0, movement = 0, phase = 0, alive = 1,
    time, fireT = 0, swingT = 0, windUp = false, flinchT = 0, deathT, deathSide = 1,
} = {}) {
    const finite = value => Number.isFinite(value) ? value : 0;
    const active = alive === true || (Number.isFinite(alive) && alive > 0);
    const aim = THREE.MathUtils.clamp(finite(pitch), -Math.PI / 2, Math.PI / 2);
    const speed = THREE.MathUtils.clamp(finite(movement), 0, 1);
    const dying = !active && Number.isFinite(deathT);
    const state = body.arenaPose ??= { torsoY: body.torso.position.y, enemy: {} };
    const e = state.enemy;
    // Absolute poses can be replayed or scrubbed without accumulating rotations.
    body.group.visible = active || dying;
    body.group.rotation.set(0, finite(yaw), 0);
    body.torso.rotation.set(0, 0, 0);
    body.torso.position.y = state.torsoY;
    for (const part of [body.headG, body.legL, body.legR, body.armL, body.armR]) {
        part.rotation.set(0, 0, 0);
    }
    if (dying) {
        e.deathT = THREE.MathUtils.clamp(deathT, 0, 1.2);
        e.deathSide = deathSide < 0 ? -1 : 1;
        e.freezeDeath = true;
        const rootY = body.group.position.y;
        poseDeath(e, body, 0);
        body.group.position.y = rootY;
        body.torso.position.y += state.torsoY - 0.40;
    } else if (active) {
        e.walkPhase = finite(phase);
        e.state = 'chase';
        e.aimBlend = 1;
        e.fireT = THREE.MathUtils.clamp(finite(fireT), 0, 0.18);
        e.flinchT = THREE.MathUtils.clamp(finite(flinchT), 0, 0.3);
        poseEnemy(e, body, {
            dt: 0, time: Number.isFinite(time) ? time : finite(phase) / 7.5,
            isMoving: speed > 0.02, speedFrac: speed,
            aiming: true, playerRel: 0, windUp: Boolean(windUp),
        });
        // Fade the campaign's full walk stride in at low speeds to avoid skating.
        const strideBlend = Math.min(1, speed / 0.25);
        if (speed > 0.02) {
            body.legL.rotation.x *= strideBlend;
            body.legR.rotation.x *= strideBlend;
            body.torso.rotation.z *= strideBlend;
        } else {
            // Aiming flattens campaign breathing; retain a subtle ready-stance rise.
            body.torso.position.y += Math.sin((Number.isFinite(time) ? time : finite(phase) / 7.5) * 1.8 + finite(phase)) * 0.004;
        }
        body.torso.position.y += state.torsoY - 0.40;
        body.headG.rotation.x -= aim;
        body.armR.rotation.x -= aim;
        // Confirmed table-leg attacks get the same wind-up / strike / recovery
        // proportions as the local campaign club, rather than a gun recoil.
        if (body.weapon?.userData.weapon === 'tableLeg' && swingT > 0) {
            const p = THREE.MathUtils.clamp(1 - finite(swingT) / 0.46, 0, 1);
            const q = THREE.MathUtils.smoothstep(p < 0.2 ? p / 0.2 : p < 0.68 ? (p - 0.2) / 0.48 : (p - 0.68) / 0.32, 0, 1);
            const swing = p < 0.2 ? 0.62 * q : p < 0.68 ? THREE.MathUtils.lerp(0.62, -1.05, q) : -1.05 * (1 - q);
            body.armR.rotation.y = swing;
            body.armR.rotation.x -= Math.abs(swing) * 0.18;
            body.torso.rotation.y = swing * 0.18;
        }
    }
    return body;
}
