/**
 * ENEMY ANIMATION LAYERS — MODERN (GOAL_LOOP M4.2)
 *
 * The classic AI (game.js updateEnemies) decides state, movement, facing,
 * attacks, and damage exactly as before; this module only poses the rig it
 * hands over. Layers, blended additively on top of each other:
 *   locomotion  idle (breathe, weight shift, glance) → walk → run by speed
 *   aim         weapon arm up, head tracking Sandy, off hand bracing
 *   fire        arm kick + torso twist for 0.18 s after a shot
 *   flinch      torso/head jerk for 0.3 s after any hit
 *   stagger     0.6 s knee-dip and lurch after a hit ≥ 30 % of max health
 *   hop         the classic startled jump (kept)
 *   death       knees buckle → fall (random side) → settle with a small bounce
 * Timers live on the enemy record (fireT, flinchT, staggerT, deathT, deathSide)
 * and are set by game.js at the events.
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

/**
 * @param e     enemy record
 * @param m     model interface { group, legL, legR, armL, armR, torso, headG }
 * @param ctx   { dt, time, isMoving, speedFrac (0..1 of moveSpeed), aiming, playerRel (radians the player is off the enemy's facing), windUp (bool) }
 * Returns the vertical bounce to apply to the group (game.js sets position).
 */
export function poseEnemy(e, m, ctx) {
    const { dt, time, isMoving, speedFrac, aiming, playerRel, windUp, peekSide = 0, advancing = false } = ctx;
    // ---- timers
    e.fireT = Math.max(0, (e.fireT || 0) - dt);
    e.flinchT = Math.max(0, (e.flinchT || 0) - dt);
    e.staggerT = Math.max(0, (e.staggerT || 0) - dt);
    if (e.hopT > 0) e.hopT -= dt;

    // ---- locomotion: walk → run blend by speed fraction
    const run = clamp01((speedFrac - 0.45) / 0.55);          // 0 walk … 1 run
    const stride = isMoving ? 0.6 + run * 0.5 : 0;            // leg swing amplitude
    const swing = Math.sin(e.walkPhase);
    let legL = isMoving ? swing * stride : 0;
    let legR = isMoving ? -swing * stride : 0;
    let armL = isMoving ? -swing * (0.5 + run * 0.6) : 0;
    let armR = isMoving ? swing * (0.5 + run * 0.6) : 0;
    let torsoX = isMoving ? 0.06 + run * 0.16 : 0;            // lean into the run
    let torsoZ = isMoving ? swing * (0.05 + run * 0.05) : 0;  // shoulder roll
    let headY = 0, headX = 0;
    let bounce = isMoving ? Math.abs(swing) * (0.03 + run * 0.035) : 0;
    let groupDrop = 0;

    if (!isMoving) {
        // idle: breathe, shift weight, glance around when unaware
        const b = Math.sin(time * 1.8 + e.walkPhase);
        torsoX = b * 0.022;
        torsoZ = Math.sin(time * 0.6 + e.walkPhase) * 0.03; // weight shift
        armL = b * 0.05; armR = -b * 0.05;
        legL = Math.sin(time * 0.6 + e.walkPhase) * 0.03; legR = -legL;
        headY = e.state === 'idle' ? Math.sin(time * 0.7 + e.walkPhase * 2) * 0.45 : 0;
    }

    // ---- aim: weapon arm forward, head on the target, off hand braces
    e.aimBlend = (e.aimBlend || 0) + (((aiming || windUp) ? 1 : 0) - (e.aimBlend || 0)) * Math.min(1, dt * 8);
    const a = e.aimBlend;
    if (a > 0.001) {
        const aimArm = -Math.PI / 2 + Math.sin(time * 5 + e.walkPhase) * 0.03; // small hold sway
        armR = armR * (1 - a) + aimArm * a;
        armL = armL * (1 - a) + (-0.55) * a;                   // off hand braces forward
        torsoX = torsoX * (1 - a) + (-0.04) * a;
        headY = headY * (1 - a) + Math.max(-0.6, Math.min(0.6, playerRel)) * a;
    }
    // classic wind-up: rear back right before the shot
    if (windUp) { armR = Math.min(armR, -1.9); torsoX = Math.min(torsoX, -0.08); }

    // ---- fire kick
    if (e.fireT > 0) {
        const k = e.fireT / 0.18;
        armR -= 0.45 * k;
        torsoX -= 0.06 * k;
        torsoZ += 0.05 * k * (e.strafeSign || 1);
    }

    // ---- flinch: jerk back, head snaps
    if (e.flinchT > 0) {
        const k = e.flinchT / 0.3;
        torsoX -= 0.28 * k;
        headX = -0.35 * k;
        armL -= 0.5 * k; armR -= 0.3 * k * (1 - a);
    }

    // ---- stagger: knees dip, lurch sideways, arms out
    if (e.staggerT > 0) {
        const k = Math.sin(clamp01(e.staggerT / 0.6) * Math.PI); // 0→1→0
        groupDrop -= 0.09 * k;
        legL += 0.35 * k; legR -= 0.15 * k;
        torsoZ += 0.22 * k * (e.staggerSide || 1);
        torsoX += 0.12 * k;
        armL -= 0.7 * k; armR -= 0.4 * k * (1 - a);
    }

    // ---- cover-peek: lean out from behind a tall prop while the cooldown runs
    e.peekBlend = (e.peekBlend || 0) + ((peekSide ? 1 : 0) - (e.peekBlend || 0)) * Math.min(1, dt * 5);
    if (e.peekBlend > 0.001) {
        const side = peekSide || e.peekLast || 1; e.peekLast = side;
        const k = e.peekBlend;
        torsoZ += 0.3 * k * side;
        groupDrop -= 0.05 * k;
        headY += 0.15 * k * side;
        legL += 0.12 * k; legR -= 0.12 * k;
    }
    // ---- suppress-and-advance: a hunched, weapon-forward run right after firing
    if (advancing) {
        torsoX += 0.14;
        groupDrop -= 0.03;
        armR = Math.min(armR, -1.1);
    }

    // ---- startled hop (classic)
    if (e.hopT > 0) bounce += Math.sin(Math.max(0, 1 - e.hopT / 0.3) * Math.PI) * 0.12;

    m.legL.rotation.x = legL;
    m.legR.rotation.x = legR;
    m.armL.rotation.x = armL;
    m.armR.rotation.x = armR;
    m.torso.rotation.x = torsoX;
    m.torso.rotation.z = torsoZ;
    m.headG.rotation.y += (headY - m.headG.rotation.y) * Math.min(1, dt * 10);
    m.headG.rotation.x = headX;
    m.torso.position.y = 0.40 + groupDrop; // torso rides down on a knee dip
    return bounce + groupDrop * 0.5;
}

/**
 * Death: 0–0.3 knees buckle and the body drops, 0.3–0.85 falls over to a
 * random side, then settles with a small bounce. game.js advances deathT.
 */
export function poseDeath(e, m, dt) {
    if (e.deathT >= 1.2 && !e.freezeDeath) return;
    if (!e.freezeDeath) e.deathT = Math.min(1.2, e.deathT + dt * 1.6); // harness: freezeDeath pins a phase
    if (e.deathSide === undefined) e.deathSide = Math.random() < 0.5 ? -1 : 1;
    const t = e.deathT;
    const buckle = easeIn(clamp01(t / 0.3));
    const fall = easeOut(clamp01((t - 0.25) / 0.6));
    const settle = t > 0.85 ? Math.sin(clamp01((t - 0.85) / 0.35) * Math.PI) * 0.08 : 0;
    // buckle: legs fold, torso sinks and slumps, arms drop, head lolls
    m.legL.rotation.x = 0.9 * buckle;
    m.legR.rotation.x = 0.6 * buckle;
    m.torso.position.y = 0.40 - 0.2 * buckle;
    m.torso.rotation.x = 0.35 * buckle;
    m.armL.rotation.x = 0.4 * buckle; m.armR.rotation.x = 0.2 * buckle;
    m.headG.rotation.x = 0.5 * buckle;
    m.headG.rotation.z = 0.3 * buckle * e.deathSide;
    // fall: over onto the side/back with a little overshoot, then rest
    const angle = (Math.PI / 2) * (fall + settle);
    m.group.rotation.x = -angle * 0.35;
    m.group.rotation.z = angle * 0.95 * e.deathSide;
    m.group.position.y = 0.02 + 0.04 * fall;
}
