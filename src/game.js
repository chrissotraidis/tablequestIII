/**
 * GAME — core play-session logic: player, enemies, combat, pickups.
 */
import * as THREE from 'three';
import {
    WEAPONS, SCORE_VALUES, ENEMY_STATS, CELL,
    EYE_HEIGHT, PLAYER_RADIUS, PLAYER_SPEED, PLAYER_SPRINT, PLAYER_ACCEL,
    TURN_SPEED, MAX_PITCH, MAX_HEALTH, PROJECTILE_SPEED, ENEMY_PROJECTILE_SPEED,
    PACK_ALERT_RADIUS,
} from './config.js';
import { LEVELS } from './levels.js';
import { World } from './world.js';
import { input, fireHeld } from './input.js';
import { playSound, startSong, setMix, musicSwell, resetMix } from './audio.js';
import { bakeStatic } from './bake.js';
import { loadHandModels, makeHand, applyPose } from './handrig.js';
import { hud } from './hud.js';
import { buildEnemy } from './characters.js'; // MODERN M4.1
import { poseEnemy, poseDeath } from './enemyanim.js'; // MODERN M4.2
import { Barks, rankName } from './barks.js'; // MODERN M4.3
import {
    buildTable, buildAmmo, buildHealth, buildMoney,
    buildGoldBar, buildTableLegPickup, buildSprayerPickup,
    buildNailgunPickup, buildRollerPickup,
} from './models.js';
import { buildViewmodels } from './viewmodels.js';
import { MuzzleFlash } from './gunfx.js';
import { getRig } from './lighting.js';
import { Effects, getSplatTextures } from './effects.js';
import { setShadow } from './lighting.js';

const ENEMY_CHAR = { g: 0, m: 1, x: 2, D: -1, G: 'boss' };

let shadowTexture = null;
function getShadowTexture() {
    if (shadowTexture) return shadowTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(c);
    return shadowTexture;
}

export class Game {
    constructor(scene, camera, callbacks) {
        this.scene = scene;
        this.camera = camera;
        this.cb = callbacks;
        this.effects = new Effects(scene);
        this.weaponDefs = WEAPONS;

        this.player = null;
        this.world = null;
        this.level = null;
        this.levelIndex = 0;
        this.enemies = [];
        this.pickups = [];
        this.projectiles = [];
        this.boss = null;
        this.time = 0;
        this.levelStartTime = 0;
        this.killsThisLevel = 0;
        this.transitioning = false;

        // controls feel
        this.vel = new THREE.Vector2(0, 0);     // smoothed planar velocity
        this.pitch = 0;
        this.sens = Number(localStorage.getItem('tq3d-sens') || 0.0028);
        this.invertY = localStorage.getItem('tq3d-invert') === '1';           // MODERN option
        this.baseFov = Number(localStorage.getItem('tq3d-fov') || camera.fov); // MODERN option
        // R5: handling options (presentation of input only; PLAYER_* constants untouched)
        this.lookSmooth = Number(localStorage.getItem('tq3d-smooth') ?? 0.35); // 0 raw … 1 heavy
        this.adsSens = Number(localStorage.getItem('tq3d-adssens') ?? 0.7);    // look scale while aimed
        this.adsToggle = localStorage.getItem('tq3d-adstoggle') === '1';
        this.sprintToggle = localStorage.getItem('tq3d-sprinttoggle') === '1';
        this.bobAmount = Number(localStorage.getItem('tq3d-bob') ?? 1);        // 0 off, 0.5 low, 1 full
        this.landDip = 0;
        camera.fov = this.baseFov; camera.updateProjectionMatrix();
        this.shake = 0;

        // player light follows camera
        // MODERN: the classic 'flashlight' fill is dimmed — real shadows and
        // fixture pools do the reading now; this only keeps Sandy's hands lit
        this.playerLight = new THREE.PointLight(0xffe0b0, 2.4, 6, 1.6);
        scene.add(this.playerLight);

        // muzzle flash light (brief spike when firing)
        this.muzzleLight = new THREE.PointLight(0xffffff, 0, 6, 1.8);
        this.muzzleLight.position.set(0.15, -0.05, -0.5);
        camera.add(this.muzzleLight);

        // Pooled projectile lights. Adding/removing lights mid-fight forces
        // three.js to recompile every shader (visible hitch), so a fixed set
        // lives in the scene permanently and gets parked under the floor.
        this.lightPool = [];
        for (let i = 0; i < 5; i++) {
            const l = new THREE.PointLight(0xffffff, 0, 4, 1.8);
            l.position.set(0, -50, 0);
            scene.add(l);
            this.lightPool.push(l);
        }
        // Pooled projectile meshes — avoids per-shot geometry/material allocs (GC stutter)
        this.projGeos = new Map(); // radius -> shared geometry
        this.projMeshPool = [];

        // weapon viewmodels (MODERN: two-handed, baked; see viewmodels.js)
        // vmRoot carries the whole-arm motion (bob, sway, sprint lower, swap,
        // inspect); each weapon group carries only its own recoil.
        this.vmRoot = new THREE.Group();
        this.vmRoot.position.set(0.12, -0.06, -0.40); // O4: tools low-right, hands in the lower third above the bench
        camera.add(this.vmRoot);
        this.viewmodels = buildViewmodels();
        for (const vm of Object.values(this.viewmodels)) {
            vm.visible = false;
            this.vmRoot.add(vm);
        }
        this.vmAnim = { swapT: 0, swapPhase: 'idle', pending: null, lower: 0, inspect: 0, breathe: 0, topT: 0, topPuff: false };
        this.flash = new MuzzleFlash(this.vmRoot); // MODERN: muzzle flash sprites
        // L2/L3: real skinned hands arrive asynchronously and are posed into each tool's grip frames
        loadHandModels().then(() => {
            // O3: shoulder anchors live in camera space (below and beside the eye, a little behind the lens) and are
            // converted into each tool's local frame, so sleeves leave the frame downward whatever the tool's pose
            const SHOULDER = { R: new THREE.Vector3(0.15, -0.46, 0.12), L: new THREE.Vector3(-0.15, -0.46, 0.12) };
            this.vmRoot.updateMatrix();
            for (const vm of Object.values(this.viewmodels)) {
                vm.updateMatrix();
                const toLocal = new THREE.Matrix4().multiplyMatrices(this.vmRoot.matrix, vm.matrix).invert();
                for (const spec of vm.userData.handSpecs || []) {
                    const shoulder = (spec.shoulderCam || SHOULDER[spec.side]).clone().applyMatrix4(toLocal);
                    const hand = makeHand({ ...spec, shoulder }); vm.add(hand); vm.userData.rigs.push(hand.userData.rig);
                }
            }
            this.handsReady = true;
        }).catch(e => console.error('hand models failed to load', e));
        // G3.2: camera-space key and rim lights on layer 1 — they light only the viewmodel meshes
        this.vmKey = new THREE.PointLight(0xffffff, 0.15, 3, 2); this.vmKey.position.set(0.35, 0.45, 0.1); this.vmKey.layers.set(1); camera.add(this.vmKey);
        this.vmRim = new THREE.PointLight(0xc8d8ff, 0.5, 3, 2); this.vmRim.position.set(-0.5, 0.2, -0.3); this.vmRim.layers.set(1); camera.add(this.vmRim);
        // N2: a shadow-casting key in camera space so hands and tools shade each other (contact shadows)
        this.vmSun = new THREE.DirectionalLight(0xfff4e8, 1.1); this.vmSun.position.set(0.45, 0.7, 0.25);
        this.vmSun.target = new THREE.Object3D(); this.vmSun.target.position.set(0, -0.15, -0.55); camera.add(this.vmSun.target);
        this.vmSun.castShadow = true; this.vmSun.shadow.mapSize.set(1024, 1024);
        const sc = this.vmSun.shadow.camera; sc.left = -0.5; sc.right = 0.5; sc.top = 0.45; sc.bottom = -0.45; sc.near = 0.01; sc.far = 2.5; sc.layers.set(1);
        this.vmSun.shadow.bias = -0.0006; this.vmSun.shadow.normalBias = 0.004; this.vmSun.layers.set(1); camera.add(this.vmSun);
        this.vmFill = new THREE.HemisphereLight(0xe8eef4, 0x4a4038, 0.25); this.vmFill.layers.set(1); camera.add(this.vmFill);
        camera.layers.set(0); // the world camera draws layer 0; PostFX renders layer 1 through the viewmodel camera
        // MODERN M2.4: recoil presentation per weapon. Camera kick is a visual
        // spring that fully recovers, so aim is never displaced (balance §2.2).
        //   pitch/yaw: peak camera kick (rad); roll: camera roll; vm: viewmodel
        //   recoil multiplier; climb: extra pitch that builds while auto-firing
        this.RECOIL = {
            paintbrush: { pitch: 0.010, yaw: 0.006, roll: 0.012, vm: 0.8, climb: 0 , kin: { back: 0.06, up: 0.03, pitch: -0.9, roll: 0.35, stiff: 220, damp: 12 } },
            tableLeg:   { pitch: 0.018, yaw: 0.010, roll: 0.03,  vm: 1.0, climb: 0 , kin: { back: 0.1, up: -0.06, pitch: 0.9, roll: 0.5, stiff: 140, damp: 11 } },
            nailgun:    { pitch: 0.012, yaw: 0.005, roll: 0.004, vm: 0.7, climb: 0.004 , kin: { back: 0.22, up: 0.08, pitch: 1.3, roll: 0.18, stiff: 420, damp: 20 } },
            roller:     { pitch: 0.055, yaw: 0.014, roll: 0.02,  vm: 1.6, climb: 0 , kin: { back: 0.4, up: 0.14, pitch: 1.8, roll: 0.45, stiff: 150, damp: 12 } },
            sprayer:    { pitch: 0.007, yaw: 0.006, roll: 0.003, vm: 0.5, climb: 0.006 , kin: { back: 0.06, up: 0.02, pitch: 0.35, roll: 0.2, stiff: 500, damp: 18 } },
        };
        this.kick = { pitch: 0, yaw: 0, roll: 0, vPitch: 0, vYaw: 0, vRoll: 0, climb: 0 };
        this.aim = 0;               // MODERN: 0 hip … 1 down the sights
        this.quick = { t: 0, struck: false, cd: 0 }; // MODERN M2.6: quick melee state
        this.barks = new Barks(); // MODERN M4.3: staff callouts
        this.ADS_FOV_DROP = 15;      // degrees
        this.ADS_SPREAD = 0.45;      // spread multiplier while aimed (hip-fire spread unchanged)
        this.recoil = 0;
        this.bobPhase = 0;
        this.lastStepTime = 0;
        this.elevatorTriggered = false;
        this.godmode = false;
        this.moving = false;

        // controls feel: smoothed look + camera lean state
        this.smDX = 0;
        this.smDY = 0;
        this.turnVel = 0;
        this.lean = 0;
        this.lastFullHint = -10;
        this.lastHeartbeat = -10;
        // jump state: height above the floor + vertical velocity
        this.jumpZ = 0;
        this.jumpVel = 0;
    }

    newPlayer() {
        return {
            x: 0, y: 0, rot: 0,
            health: MAX_HEALTH, ammo: 30,
            tables: 0, score: 0,
            weapons: ['paintbrush'], currentWeapon: 0,
            cooldown: 0, lastHurtTime: -10, alive: true,
        };
    }

    /** R5.2: sprint from the held key, or the Alt toggle while moving forward (option) */
    sprintHeld() {
        if (input.sprint) return true;
        if (this.sprintToggle && input.sprintToggled) { if (!input.forward) input.sprintToggled = false; return input.forward; }
        return false;
    }

    adjustSensitivity(delta) {
        this.sens = Math.min(0.008, Math.max(0.001, this.sens + delta));
        localStorage.setItem('tq3d-sens', String(this.sens));
        hud.toast(`MOUSE SENSITIVITY: ${(this.sens * 1000).toFixed(1)}`, 1200);
    }

    loadLevel(index, { keepStats = true, silent = false } = {}) {
        // tear down old
        if (this.world) this.world.dispose();
        // MODERN: free per-level GPU resources (classic only removed them)
        const disposeTree = (obj) => obj.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material && !o.material.map) { // keep shared sprite textures (Fritos)
                const ms = Array.isArray(o.material) ? o.material : [o.material];
                ms.forEach(m => { if (!m.userData.shared) m.dispose(); });
            }
        });
        for (const e of this.enemies) {
            this.scene.remove(e.model.group);
            disposeTree(e.model.group);
            if (e.shadow) { this.scene.remove(e.shadow); e.shadow.geometry.dispose(); e.shadow.material.dispose(); }
        }
        for (const p of this.pickups) { this.scene.remove(p.mesh); disposeTree(p.mesh); }
        for (const pr of this.projectiles) this.removeProjectileMesh(pr);
        this.effects.clear();
        this.barks?.clear();
        this.enemies = [];
        this.pickups = [];
        this.projectiles = [];
        this.boss = null;
        this.killsThisLevel = 0;
        this.elevatorTriggered = false;
        this.transitioning = false;
        this.vel.set(0, 0);
        this.pitch = 0;
        this.lean = 0;
        this.smDX = 0;
        this.smDY = 0;
        this.jumpZ = 0;
        this.jumpVel = 0;
        this.camera.rotation.z = 0;

        this.levelIndex = index;
        this.level = LEVELS[index];
        this.world = new World(this.scene, this.level, index);
        this.world.effects = this.effects; // MODERN M5.5: dressing sparks/steam use the particle pools

        const prev = this.player;
        this.player = this.newPlayer();
        if (keepStats && prev) {
            this.player.score = prev.score;
            this.player.weapons = [...prev.weapons];
            this.player.currentWeapon = prev.currentWeapon;
            this.player.ammo = Math.max(prev.ammo, 25);
            this.player.health = Math.max(prev.health, 60);
        }
        this.player.x = this.world.spawn.x;
        this.player.y = this.world.spawn.y;
        this.player.rot = this.findSpawnFacing();
        this.player.tables = 0;

        this.requiredTables = 0;
        for (const ent of this.world.entities) this.spawnEntity(ent);
        this.enemiesAlive = this.enemies.filter(e => e.alive).length;
        this.levelStartTime = this.time;

        this.quick.t = 0; this.quick.cd = 0;
        this.updateViewmodel(true);
        this.vmAnim.swapPhase = 'idle'; this.vmAnim.pending = null;
        this.spawnGrace = 3; // seconds before staff start noticing the intruder
        resetMix(); // MODERN M6.4: fresh mix state per floor
        this.world.group.traverse(o => { if (o.isLight) o.layers.enable(1); }); // M2: the floor's lights light the hands and tools too
        if (!silent) { // MODERN: the menu loads Floor 1 as a live backdrop without music/card
            startSong(this.level.music);
            hud.floorCard(index + 1, this.level.name, this.level.subtitle);
        }
    }

    findSpawnFacing() {
        const { x, y } = this.world.spawn;
        const dirs = [[1, 0, 0], [0, 1, Math.PI / 2], [-1, 0, Math.PI], [0, -1, -Math.PI / 2]];
        let best = 0, bestD = -1;
        for (const [dx, dy, rot] of dirs) {
            let d = 0;
            while (d < 12 && !this.world.isSolidCell(Math.floor(x + dx * (d + 1)), Math.floor(y + dy * (d + 1)))) d++;
            if (d > bestD) { bestD = d; best = rot; }
        }
        return best;
    }

    spawnEntity({ char, x, y, drop = false }) {
        if (ENEMY_CHAR[char] !== undefined) {
            let variant = ENEMY_CHAR[char];
            if (variant === -1) variant = Math.floor(Math.random() * 3);
            const stats = ENEMY_STATS[variant];
            const model = buildEnemy(variant);
            model.group.position.set(x, 0, y);
            setShadow(model.group);
            this.scene.add(model.group);

            const shadow = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial({
                    map: getShadowTexture(), transparent: true, depthWrite: false,
                })
            );
            shadow.rotation.x = -Math.PI / 2;
            shadow.material.opacity = 0.45; // real shadows carry most of the grounding now
            const shScale = variant === 'boss' ? 1.1 : 0.62;
            shadow.scale.set(shScale, shScale, 1);
            shadow.position.set(x, 0.012, y);
            this.scene.add(shadow);

            const rec = {
                x, y, variant, model, shadow,
                health: stats.health, maxHealth: stats.health,
                state: 'idle', alive: true,
                stateTimer: 0, attackTimer: 0.5 + Math.random() * 1.5,
                meleeTimer: 0,
                patrolTimer: Math.random() * 2, patrolDir: Math.random() * Math.PI * 2,
                patrolMove: true, hopT: 0,
                strafeSign: Math.random() < 0.5 ? 1 : -1, strafeTimer: 1 + Math.random() * 1.5,
                walkPhase: Math.random() * 6, painT: 0, deathT: 0,
                lostSightTimer: 0, phase2: false,
            };
            this.enemies.push(rec);
            if (variant === 'boss') this.boss = rec;
            return;
        }
        const builders = {
            T: ['table', buildTable], A: ['ammo', buildAmmo], H: ['health', buildHealth],
            $: ['money', buildMoney], Z: ['goldBar', buildGoldBar],
            L: ['weapon:tableLeg', buildTableLegPickup], P: ['weapon:sprayer', buildSprayerPickup],
            N: ['weapon:nailgun', buildNailgunPickup], R: ['weapon:roller', buildRollerPickup],
        };
        const b = builders[char];
        if (!b) return;
        const [kind, build] = b;
        // objectives and weapons cast; small consumables hover and don't need to
        // M7.2: pickups bake to one or two meshes each (the Fritos sprite stays a sprite)
        const mesh = setShadow(bakeStatic(build(), { quantize: 0.25 }), { receive: false, cast: kind === 'table' || kind.startsWith('weapon:') });
        mesh.position.set(x, 0, y);
        this.scene.add(mesh);
        if (kind === 'table') this.requiredTables++;
        const item = { kind, x, y, mesh, active: true, bobOff: Math.random() * 6 };
        if (drop) { item.dropT = 0; item.dropFrom = (this.world.H || 1.35) - 0.25; mesh.position.y = item.dropFrom; }
        this.pickups.push(item);
    }

    // ------------------------------------------------------------ UPDATE

    update(dt, time) {
        this.time = time;
        const p = this.player;
        if (!p.alive) {
            this.effects.update(dt);
            return;
        }

        this.spawnGrace = Math.max(0, (this.spawnGrace || 0) - dt);
        this.updatePlayer(dt);
        this.world.update(dt, p.x, p.y);
        this.updatePickups(dt, time);
        this.updateEnemies(dt);
        // MODERN M6.4: the score ducks while staff are actively hunting Sandy and muffles when she is nearly out
        setMix({ combat: this.enemies.some(e => e.alive && e.state === 'chase'), lowHealth: p.health <= 25 });
        this.updateProjectiles(dt);
        this.effects.update(dt);
        this.updateCameraAndViewmodel(dt, time);
        this.barks.update(time, this.camera); // MODERN M4.3
        this.checkElevator();
    }

    updatePlayer(dt) {
        const p = this.player;

        // --- look: lightly smoothed mouse + eased keyboard turn ---
        const lookBlend = 1 - Math.exp(-dt * (60 - this.lookSmooth * 44)); // R5.1: raw at 0, ~1 frame at 0.35 (default), heavy at 1
        this.smDX += (input.mouseDX - this.smDX) * lookBlend;
        this.smDY += (input.mouseDY - this.smDY) * lookBlend;
        const turnTarget = (input.turnR ? 1 : 0) - (input.turnL ? 1 : 0);
        this.turnVel += (turnTarget - this.turnVel) * Math.min(1, dt * 11);
        const rotBefore = p.rot;
        p.rot += this.turnVel * TURN_SPEED * dt;
        const adsScale = 1 - this.aim * (1 - this.adsSens); // R5.1: steadier on the sights
        p.rot += this.smDX * this.sens * adsScale;
        this.yawRate = dt > 0 ? (p.rot - rotBefore) / dt : 0; // rad/s, for post-FX motion blur
        this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - this.smDY * this.sens * adsScale * (this.invertY ? -1 : 1)));

        // low-health heartbeat
        if (p.health > 0 && p.health <= 25 && this.time - this.lastHeartbeat > 0.85) {
            this.lastHeartbeat = this.time;
            playSound('heartbeat');
        }

        // --- move: smoothed velocity for snappy-but-not-instant feel ---
        const sprintHeld = this.sprintHeld();
        const speed = sprintHeld ? PLAYER_SPRINT : PLAYER_SPEED;
        this.sprinting = sprintHeld; // R2.2: the portrait huffs while sprinting and moving
        let mx = 0, my = 0;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        if (input.forward) { mx += c; my += s; }
        if (input.back) { mx -= c; my -= s; }
        if (input.strafeL) { mx += s; my -= c; }
        if (input.strafeR) { mx -= s; my += c; }
        const len = Math.hypot(mx, my);
        if (len > 0.001) { mx /= len; my /= len; }

        const blend = 1 - Math.exp(-PLAYER_ACCEL * dt);
        this.vel.x += (mx * speed - this.vel.x) * blend;
        this.vel.y += (my * speed - this.vel.y) * blend;

        const speedNow = this.vel.length();
        this.moving = speedNow > 0.4;
        if (this.moving) {
            const nx = p.x + this.vel.x * dt;
            const ny = p.y + this.vel.y * dt;
            [p.x, p.y] = this.world.collide(nx, ny, PLAYER_RADIUS);
            if (this.jumpZ <= 0) { // feet only work on the ground
                this.bobPhase += dt * (3.2 + speedNow * 1.6);
                if (performance.now() - this.lastStepTime > 1150 / speedNow) {
                    playSound('step');
                    this.lastStepTime = performance.now();
                }
            }
        }

        // --- jump: a quick hop ---
        if (input.jump && this.jumpZ <= 0.001 && this.jumpVel === 0) {
            this.jumpVel = 2.7;
            playSound('jump');
        }
        if (this.jumpZ > 0 || this.jumpVel !== 0) {
            this.jumpZ += this.jumpVel * dt;
            this.jumpVel -= 10.5 * dt;
            if (this.jumpZ <= 0) {
                this.jumpZ = 0;
                this.jumpVel = 0;
                this.landDip = 1; // R5.2: camera dips on landing
                playSound('land');
                this.shake = Math.max(this.shake, 0.06);
            }
        }

        // --- interact ---
        if (input.interact) {
            if (this.world.tryOpenDoor(p.x, p.y, p.rot)) playSound('door_open');
        }

        // --- weapons ---
        if (input.cycleWeapon !== 0 && p.weapons.length > 1) {
            const n = p.weapons.length;
            p.currentWeapon = (p.currentWeapon + input.cycleWeapon % n + n) % n;
            playSound('weapon_switch');
            this.updateViewmodel();
            this.cb.onHUD();
        }
        p.cooldown = Math.max(0, p.cooldown - dt);
        if (input.melee) this.startQuickMelee();
        if (input.regrip && this.vmAnim.swapPhase === 'idle' && this.quick.t <= 0) this.topUp(true); // R5.3: R re-grips the tool
        this.updateQuickMelee(dt);
        const w = WEAPONS[p.weapons[p.currentWeapon]];
        const wantFire = input.fire || (w.auto && fireHeld());
        if (wantFire && p.cooldown <= 0 && this.quick.t <= 0) this.fireWeapon(w);
    }

    fireWeapon(w) {
        const p = this.player;
        if (w.type === 'ranged' && p.ammo < w.ammoCost) {
            playSound('empty');
            p.cooldown = 0.3;
            return;
        }
        p.cooldown = w.cooldown;
        p.ammo -= w.ammoCost;
        this.recoil = 1;
        { // H4.1: spring impulse per tool
            const ki = (this.RECOIL[p.weapons[p.currentWeapon]] || this.RECOIL.paintbrush).kin || {};
            const sp = this.kin; if (sp) { sp.vz += ki.back ?? 1.2; sp.vy += ki.up ?? 0.4; sp.vpx += ki.pitch ?? 6; sp.vrz += (Math.random() < 0.5 ? -1 : 1) * (ki.roll ?? 1.5); }
        }
        // MODERN M2.4: camera kick impulse (recovers via spring in updateCameraAndViewmodel)
        {
            const rc = this.RECOIL[p.weapons[p.currentWeapon]] || this.RECOIL.paintbrush;
            const k = this.kick;
            const aimMul = 1 - 0.35 * this.aim; // sights steady the kick a little
            k.climb = Math.min(rc.climb * 6, k.climb + rc.climb);
            k.vPitch += (rc.pitch + k.climb) * aimMul * 60;
            k.vYaw += (Math.random() - 0.5) * 2 * rc.yaw * aimMul * 60;
            k.vRoll += (Math.random() < 0.5 ? -1 : 1) * rc.roll * 60;
        }

        if (w.type === 'melee') {
            playSound('swing');
            this.meleeStrike(w);
        } else {
            playSound(w.sound || (w === WEAPONS.sprayer ? 'spray' : 'shoot'));
            const spreadMul = 1 - (1 - this.ADS_SPREAD) * this.aim; // ADS tightens the cone
            const spread = (w.spread || 0) * spreadMul * (Math.random() - 0.5) * 2;
            const ang = p.rot + spread;
            const color = w.fixedColor !== undefined
                ? new THREE.Color(w.fixedColor)
                : new THREE.Color().setHSL(Math.random(), 1, 0.55);
            this.muzzleColor = color;
            const speed = w.speed || PROJECTILE_SPEED;
            const wkey = p.weapons[p.currentWeapon];
            this.spawnProjectile({
                x: p.x + Math.cos(ang) * 0.3,
                y: p.y + Math.sin(ang) * 0.3,
                z: EYE_HEIGHT - 0.06 + this.jumpZ,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                owner: 'player',
                damage: w.damage,
                color,
                size: w.size,
                light: !!w.light,
                splash: w.splash,
                splashDamage: w.splashDamage,
                tracer: wkey === 'nailgun' || wkey === 'sprayer',   // MODERN: streaks
                trail: wkey === 'paintbrush' || wkey === 'roller',  // MODERN: paint arcs
                kind: wkey === 'nailgun' ? 'nail' : 'paint',
            });
            // MODERN: muzzle flash sprite + light, ejection at the muzzle
            const vm = this.viewmodels[wkey];
            this.muzzleBoost = this.flash.fire(wkey, vm, color);
            const mz = this.muzzleWorld(vm);
            if (mz) {
                const fwd = new THREE.Vector3(Math.cos(p.rot), 0, Math.sin(p.rot));
                const right = new THREE.Vector3(-Math.sin(p.rot), 0, Math.cos(p.rot));
                if (wkey === 'nailgun') {
                    // strip fragment kicks out to the right; exhaust puffs up from the cap (R4.2)
                    this.effects.burst(mz, new THREE.Color(0xc8ccd4), 2, 1.6, 0.45, { size: 0.03, gravity: 9, dir: right, dirW: 1.2 });
                    this.effects.burst(mz.clone().addScaledVector(fwd, -0.18).add(new THREE.Vector3(0, 0.08, 0)), new THREE.Color(0xd8dce0), 4, 0.9, 0.3, { size: 0.05, gravity: -0.6, drag: 3, dir: new THREE.Vector3(0, 1, 0), dirW: 0.6 });
                } else if (wkey === 'paintbrush') {
                    this.effects.burst(mz, color, 5, 1.8, 0.4, { size: 0.035, gravity: 7, dir: fwd, dirW: 0.9 });
                } else if (wkey === 'sprayer') {
                    this.effects.burst(mz, color, 4, 3.0, 0.22, { size: 0.03, gravity: 2, drag: 3, dir: fwd, dirW: 1.4 });
                } else if (wkey === 'roller') {
                    this.effects.burst(mz, color, 10, 1.6, 0.5, { size: 0.05, gravity: 3, drag: 2, dir: fwd, dirW: 0.5 });
                    // tank hiss: a steam puff off the pressure tank behind the muzzle (R4.2)
                    this.effects.burst(mz.clone().addScaledVector(fwd, -0.3).addScaledVector(right, 0.06).add(new THREE.Vector3(0, -0.06, 0)), new THREE.Color(0xe8ecf0), 6, 1.2, 0.35, { size: 0.06, gravity: -1, drag: 3, dir: right, dirW: 0.8 });
                }
            }
        }
        this.cb.onHUD();
    }

    /**
     * MODERN M4.5: a paint splat stuck to the struck body part. The decal is
     * a small quad in the part's local space (so it rides the animation),
     * capped per enemy; the colour is remembered for death drips and pool.
     */
    paintEnemy(e, hx, hz, hy, color, size = 0.18) {
        const m = e.model;
        if (!m) return;
        e.lastPaint = color.clone ? color.clone() : new THREE.Color(color);
        e.paintCount = (e.paintCount || 0) + 1;
        if (e.paintCount > 10) return; // suit is saturated
        const scale = e.variant === 'boss' ? 1.65 : 1;
        const localZ = hz / scale;                       // height on the un-scaled rig
        const part = localZ < 0.42 ? (Math.random() < 0.5 ? m.legL : m.legR) : localZ > 0.78 ? m.headG : m.torso;
        // outward direction from the enemy axis to the hit, in model space (undo the group yaw)
        const dx = hx - e.x, dy = hy - e.y;
        const yaw = m.group.rotation.y;
        const lx = Math.cos(-yaw) * dx - Math.sin(-yaw) * dy;
        const lz = Math.sin(-yaw) * dx + Math.cos(-yaw) * dy;
        const len = Math.hypot(lx, lz) || 1;
        const nx = lx / len, nz = lz / len;
        const radius = part === m.headG ? 0.085 : part === m.torso ? 0.1 : 0.06;
        const texs = getSplatTextures();
        const mat = new THREE.MeshBasicMaterial({ map: texs[Math.floor(Math.random() * texs.length)], color: e.lastPaint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        // part-local placement: parts pivot at hip/shoulder/neck; convert the world height to part space
        part.updateWorldMatrix(true, false);
        const local = part.worldToLocal(new THREE.Vector3(e.x, hz, e.y));
        quad.position.set(local.x + nx * radius, local.y, local.z + nz * radius);
        quad.lookAt(quad.position.clone().add(new THREE.Vector3(nx, 0, nz)));
        quad.rotateZ(Math.random() * Math.PI * 2);
        quad.renderOrder = 3;
        part.add(quad);
    }

    /** the table leg's hit resolution (classic numbers: 50 dmg, 1.8 range, 90° arc, wrecks props) */
    meleeStrike(w) {
        const p = this.player;
        let hit = false;
        for (const e of this.enemies) {
            if (!e.alive) continue;
            const dx = e.x - p.x, dy = e.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > w.range) continue;
            let ang = Math.atan2(dy, dx) - p.rot;
            while (ang > Math.PI) ang -= Math.PI * 2;
            while (ang < -Math.PI) ang += Math.PI * 2;
            if (Math.abs(ang) < w.arc / 2) {
                this.damageEnemy(e, w.damage);
                hit = true;
            }
        }
        // the table leg also wrecks furniture
        for (const reach of [0.7, 1.3]) {
            const fx = Math.floor(p.x + Math.cos(p.rot) * reach);
            const fy = Math.floor(p.y + Math.sin(p.rot) * reach);
            const res = this.world.damageProp(fx, fy, w.damage);
            if (res) {
                this.onPropHit(res, fx + 0.5, 0.45, fy + 0.5);
                hit = true;
                break;
            }
        }
        if (hit) {
            playSound('hit');
            playSound('hitmark');
            hud.hitMarker();
            this.shake = Math.max(this.shake, 0.12);
        }
        return hit;
    }

    /**
     * MODERN M2.6: quick melee on V. Needs the table leg in the arsenal. The
     * leg is shown for one swing (0.5 s) and the current weapon comes back;
     * the strike lands 0.14 s in. Same damage/range/arc as slot 2, no paint.
     */
    startQuickMelee() {
        const p = this.player;
        if (!p.weapons.includes('tableLeg') || this.quick.t > 0 || this.quick.cd > 0) return false;
        if (p.weapons[p.currentWeapon] === 'tableLeg') { // already holding it: just swing
            if (p.cooldown <= 0) this.fireWeapon(WEAPONS.tableLeg);
            return true;
        }
        if (this.vmAnim.swapPhase !== 'idle') return false;
        this.quick.t = 0.5; this.quick.struck = false; this.quick.cd = 0.65;
        for (const [k, vm] of Object.entries(this.viewmodels)) vm.visible = k === 'tableLeg';
        this.aim = 0;
        playSound('swing');
        this.recoil = 1;
        const rc = this.RECOIL.tableLeg, k = this.kick;
        k.vPitch += rc.pitch * 60; k.vRoll += rc.roll * 60;
        return true;
    }

    updateQuickMelee(dt) {
        const q = this.quick;
        q.cd = Math.max(0, q.cd - dt);
        if (q.t <= 0) return;
        q.t -= dt;
        if (q.t < 1e-4) q.t = 0; // no float residue keeping the leg on screen
        if (!q.struck && q.t <= 0.36) { q.struck = true; this.meleeStrike(WEAPONS.tableLeg); }
        if (q.t <= 0) {
            q.t = 0;
            const key = this.player.weapons[this.player.currentWeapon];
            for (const [k, vm] of Object.entries(this.viewmodels)) vm.visible = k === key;
        }
    }

    /** world-space muzzle of the visible viewmodel (for ejection particles) */
    muzzleWorld(vm) {
        if (!vm?.userData.muzzle) return null;
        const v = vm.userData.muzzle.clone().applyMatrix4(vm.matrix).applyMatrix4(this.vmRoot.matrix);
        this.camera.updateMatrixWorld();
        return v.applyMatrix4(this.camera.matrixWorld);
    }

    /** which surface family a wall cell is, for impact FX */
    surfaceAt(cx, cy) {
        const w = this.world;
        const t = w.cellRaw(cx, cy);
        if (t === CELL.DOOR || t === CELL.GATE) return 'metal';
        if (w.windows && w.isWindowCell?.(cx, cy)) return 'glass';
        const tex = this.level.wallChar;
        return { '#': 'stone', 'W': 'wood', 'B': 'stone', 'M': 'metal', 'O': 'office', 'C': 'concrete' }[
            { [CELL.BRICK]: '#', [CELL.WOOD]: 'W', [CELL.STONE]: 'B', [CELL.CONCRETE]: 'C', [CELL.OFFICE]: 'O', [CELL.METAL]: 'M' }[t] || tex] || 'concrete';
    }

    switchWeapon(slot) {
        const p = this.player;
        if (slot - 1 >= 0 && slot - 1 < p.weapons.length && slot - 1 !== p.currentWeapon) {
            p.currentWeapon = slot - 1;
            playSound('weapon_switch');
            this.updateViewmodel();
            this.cb.onHUD();
        }
    }

    updateViewmodel(instant = false) {
        if (this.quick.t > 0 && !instant) return; // the leg is mid-swing; visibility restores after
        const key = this.player.weapons[this.player.currentWeapon];
        const shown = Object.keys(this.viewmodels).find(k => this.viewmodels[k].visible);
        if (instant || !shown || shown === key) {
            for (const [k, vm] of Object.entries(this.viewmodels)) vm.visible = k === key;
            return;
        }
        // MODERN: lower the old weapon, then raise the new one
        const a = this.vmAnim;
        a.pending = key;
        if (a.swapPhase === 'idle' || a.swapPhase === 'raise') { a.swapPhase = 'lower'; a.swapT = a.swapPhase === 'raise' ? 1 - a.swapT : 0; }
    }

    /** whole-arm animation: swap, sprint lowering, inspect, breathing */
    updateViewmodelAnim(dt) {
        const a = this.vmAnim;
        const SWAP = 0.2;
        if (a.swapPhase === 'lower') {
            a.swapT = Math.min(1, a.swapT + dt / SWAP);
            if (a.swapT >= 1) {
                for (const [k, vm] of Object.entries(this.viewmodels)) vm.visible = k === a.pending;
                a.pending = null; a.swapPhase = 'raise'; a.swapT = 0;
                this.topUp(false); // MODERN M2.5: settle the tool as it comes up (cosmetic)
            }
        } else if (a.swapPhase === 'raise') {
            a.swapT = Math.min(1, a.swapT + dt / SWAP);
            if (a.swapT >= 1) a.swapPhase = 'idle';
        }
        const swapDrop = a.swapPhase === 'lower' ? a.swapT : a.swapPhase === 'raise' ? 1 - a.swapT : 0;
        // sprint: weapon drops and tilts away while running
        const sprinting = this.sprintHeld() && this.moving && this.vel.length() > PLAYER_SPEED * 0.9;
        a.lower += ((sprinting ? 1 : 0) - a.lower) * Math.min(1, dt * 9);
        // inspect: hold F to turn the weapon toward the camera
        const wantInspect = input.inspect && !fireHeld() && this.player.cooldown <= 0.01 && this.aim < 0.1;
        a.inspect += ((wantInspect ? 1 : 0) - a.inspect) * Math.min(1, dt * 5);
        // aim down sights: right mouse, aimable weapons only, not mid-swap or sprinting
        const vm = this.viewmodels[this.player.weapons[this.player.currentWeapon]];
        const canAim = !!vm?.userData.ads && a.swapPhase === 'idle' && !sprinting;
        const wantAim = canAim && (input.aimHeld || (this.adsToggle && input.aimToggled));
        if (!canAim) input.aimToggled = false;
        this.aim += ((wantAim ? 1 : 0) - this.aim) * Math.min(1, dt * 11);
        if (this.aim < 0.001) this.aim = 0;
        hud.setAim(this.aim);
        if (wantAim) a.lower = 0;
        a.breathe = this.time;
        // top-up flourish: 0→1 over 0.45 s; a paint puff at the muzzle on the way back up
        let top = 0;
        if (a.topT > 0) {
            a.topT = Math.max(0, a.topT - dt / 0.45);
            top = Math.sin((1 - a.topT) * Math.PI); // dip and return
            if (a.topPuff && a.topT < 0.45) {
                a.topPuff = false;
                const key = this.player.weapons[this.player.currentWeapon];
                const mz = this.muzzleWorld(this.viewmodels[key]);
                if (mz && WEAPONS[key].type === 'ranged')
                    this.effects.burst(mz, new THREE.Color(0x3a6acc), 6, 1.2, 0.35, { size: 0.03, gravity: 6 });
            }
        }
        return { swapDrop: swapDrop * swapDrop, lower: a.lower, inspect: a.inspect, top };
    }

    /**
     * MODERN M2.5 (§5-C default): purely cosmetic "top-up" — the tool dips
     * toward the paint can and comes back. No magazine, no reload window,
     * no change to the 99-cap paint pool or per-shot costs.
     */
    topUp(withPuff = true) {
        const a = this.vmAnim;
        if (a.topT > 0.2) return;
        a.topT = 1;
        a.topPuff = withPuff;
    }

    acquireLight(color) {
        const l = this.lightPool.find(l => !l.userData.inUse);
        if (!l) return null; // pool exhausted: shot just flies unlit
        l.userData.inUse = true;
        l.color.set(color);
        l.intensity = 2.2;
        return l;
    }

    releaseLight(l) {
        if (!l) return;
        l.userData.inUse = false;
        l.intensity = 0;
        l.position.set(0, -50, 0);
    }

    getProjGeo(size, shape = 'sphere') {
        const key = shape + ':' + size;
        let g = this.projGeos.get(key);
        if (!g) {
            if (shape === 'tracer') {
                // streak along -Z, so lookAt(target) points it down the flight path
                g = new THREE.CylinderGeometry(size * 0.5, size * 0.9, 0.42, 6);
                g.rotateX(Math.PI / 2);
            } else if (shape === 'trail') {
                g = new THREE.CylinderGeometry(size * 0.35, size, 0.22, 8);
                g.rotateX(Math.PI / 2);
            } else {
                g = new THREE.SphereGeometry(size, 8, 8);
            }
            this.projGeos.set(key, g);
        }
        return g;
    }

    spawnProjectile(opts) {
        const size = opts.size || (opts.owner === 'player' ? 0.05 : 0.065);
        let mesh = this.projMeshPool.pop();
        if (!mesh) mesh = new THREE.Mesh(this.getProjGeo(size), new THREE.MeshBasicMaterial({ transparent: true }));
        const shape = opts.tracer ? 'tracer' : opts.trail ? 'trail' : 'sphere';
        mesh.geometry = this.getProjGeo(size, shape);
        mesh.material.color.set(opts.color);
        // tracers glow (bloom picks them up); paint stays diffuse
        mesh.material.blending = opts.tracer ? THREE.AdditiveBlending : THREE.NormalBlending;
        mesh.material.toneMapped = !opts.tracer;
        mesh.material.opacity = opts.tracer ? 0.9 : 1;
        mesh.material.needsUpdate = true;
        mesh.position.set(opts.x, opts.z, opts.y);
        if (shape !== 'sphere') mesh.lookAt(opts.x + opts.vx, opts.z, opts.y + opts.vy);
        this.scene.add(mesh);
        const light = opts.light ? this.acquireLight(opts.color) : null;
        if (light) light.position.set(opts.x, opts.z, opts.y);
        this.projectiles.push({ ...opts, mesh, pLight: light, life: 3 });
    }

    removeProjectileMesh(pr) {
        this.scene.remove(pr.mesh);
        this.projMeshPool.push(pr.mesh);
        this.releaseLight(pr.pLight);
        pr.pLight = null;
    }

    updateProjectiles(dt) {
        const p = this.player;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            pr.life -= dt;
            const nx = pr.x + pr.vx * dt;
            const ny = pr.y + pr.vy * dt;
            let dead = pr.life <= 0;

            // furniture hit → smash it up
            if (!dead) {
                const prop = this.world.propAt(Math.floor(nx), Math.floor(ny));
                if (prop && pr.z < prop.def.height) {
                    dead = true;
                    const res = this.world.damageProp(Math.floor(nx), Math.floor(ny), pr.damage);
                    this.onPropHit(res, nx, pr.z, ny);
                }
            }

            // wall hit → splat
            if (!dead && this.world.isStructureSolid(Math.floor(nx), Math.floor(ny))) {
                dead = true;
                const pos = new THREE.Vector3(pr.x, pr.z, pr.y);
                const cellX = Math.floor(nx);
                const prevCellX = Math.floor(pr.x);
                let normal;
                if (cellX !== prevCellX) normal = new THREE.Vector3(-Math.sign(pr.vx), 0, 0);
                else normal = new THREE.Vector3(0, 0, -Math.sign(pr.vy));
                if (pr.owner === 'player') {
                    this.effects.impact(pos, normal, this.surfaceAt(cellX, Math.floor(ny)), pr.color, pr.kind || 'paint');
                    playSound(pr.kind === 'nail' ? 'wood_hit' : 'splat');
                } else {
                    this.effects.splat(pos, normal, pr.color, 0.26 + Math.random() * 0.18);
                    this.effects.burst(pos, pr.color, 8, 1.4, 0.35);
                    playSound('splat');
                }
            }

            if (!dead) {
                if (pr.owner === 'enemy') {
                    const d = Math.hypot(p.x - nx, p.y - ny);
                    if (d < 0.32) {
                        dead = true;
                        this.hurtPlayer(pr.damage, nx - pr.vx, ny - pr.vy, pr.color);
                        this.effects.burst(new THREE.Vector3(nx, pr.z, ny), pr.color, 10, 1.6, 0.4);
                    }
                } else {
                    for (const e of this.enemies) {
                        if (!e.alive) continue;
                        const rad = e.variant === 'boss' ? 0.55 : 0.34;
                        if (Math.hypot(e.x - nx, e.y - ny) < rad) {
                            dead = true;
                            this.paintEnemy(e, nx, pr.z, ny, pr.color); // MODERN M4.5: paint on the suit
                            this.damageEnemy(e, pr.damage);
                            this.effects.burst(new THREE.Vector3(nx, pr.z, ny), pr.color, 12, 1.8, 0.45);
                            playSound('hit');
                            if (e.alive) { playSound('hitmark'); hud.hitMarker(); }
                            break;
                        }
                    }
                }
            }

            if (dead) {
                if (pr.splash) this.explodeSplash(pr);
                this.removeProjectileMesh(pr);
                this.projectiles.splice(i, 1);
            } else {
                pr.x = nx; pr.y = ny;
                pr.mesh.position.set(nx, pr.z, ny);
                if (pr.pLight) pr.pLight.position.set(nx, pr.z, ny);
            }
        }
    }

    /** Roller impact: paint everything, hurt everyone standing in the coat. */
    explodeSplash(pr) {
        playSound('roller_boom');
        const pos = new THREE.Vector3(pr.x, pr.z, pr.y);
        this.effects.burst(pos, pr.color, 26, 3.4, 0.6);
        this.effects.splat(
            new THREE.Vector3(pr.x, 0.02, pr.y),
            new THREE.Vector3(0, 1, 0),
            pr.color, 0.9 + Math.random() * 0.4);
        let hitAny = false;
        for (const e of this.enemies) {
            if (!e.alive) continue;
            const d = Math.hypot(e.x - pr.x, e.y - pr.y);
            if (d < pr.splash) {
                this.paintEnemy(e, pr.x + (e.x - pr.x) * 0.7, 0.5, pr.y + (e.y - pr.y) * 0.7, pr.color, 0.28); // MODERN M4.5
                this.damageEnemy(e, pr.splashDamage * (1 - 0.6 * d / pr.splash));
                hitAny = true;
            }
        }
        // the blast wrecks nearby furniture too
        for (const rec of this.world.propsInRadius(pr.x, pr.y, pr.splash)) {
            const res = this.world.damageProp(rec.x, rec.y, pr.splashDamage * 0.8);
            if (res) this.onPropHit(res, rec.x + 0.5, 0.4, rec.y + 0.5);
        }
        if (hitAny) hud.hitMarker();
        const pd = Math.hypot(this.player.x - pr.x, this.player.y - pr.y);
        if (pd < 3) this.shake = Math.max(this.shake, 0.3 * (1 - pd / 3));
    }

    /** Feedback for furniture damage: knocks, splinters, and the odd cash stash. */
    onPropHit(res, x, z, y) {
        if (!res) return;
        const wood = new THREE.Color(0x9a7442);
        if (res.destroyed) {
            playSound('wood_break');
            this.effects.burst(new THREE.Vector3(res.x, 0.45, res.y), wood, 22, 3.0, 0.6);
            this.effects.burst(new THREE.Vector3(res.x, 0.2, res.y), new THREE.Color(0x6e5436), 12, 2.0, 0.5);
            this.effects.debris(new THREE.Vector3(res.x, 0.35, res.y), wood, 18, 2.8); // MODERN: physical splinters
            this.player.score += 5; // demolition bonus
            // the cartel hides cash in the furniture
            if (Math.random() < 0.12) this.spawnEntity({ char: '$', x: res.x, y: res.y });
            this.cb.onHUD();
        } else {
            playSound('wood_hit');
            this.effects.burst(new THREE.Vector3(x, z, y), wood, 6, 1.4, 0.3);
            this.effects.debris(new THREE.Vector3(x, z, y), wood, 4, 1.6);
        }
    }

    hurtPlayer(dmg, fromX, fromY, color = null) {
        const p = this.player;
        if (this.godmode || !p.alive) return;
        // brief mercy window, slightly longer when nearly dead (pity rule)
        if (this.time - p.lastHurtTime < (p.health <= 30 ? 0.45 : 0.25)) return;
        p.health -= dmg;
        p.lastHurtTime = this.time;
        playSound('pain');
        hud.damageFlash(0.55);
        if (color) hud.setSplat('#' + (color.isColor ? color.getHex() : color).toString(16).padStart(6, '0')); // R2.2
        // MODERN M2.4: wedge toward the source, relative to facing (0 = ahead, +cw)
        if (fromX !== undefined) {
            let rel = Math.atan2(fromY - p.y, fromX - p.x) - p.rot;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            hud.damageDir(rel);
        }
        this.shake = Math.max(this.shake, 0.32);
        this.cb.onHUD();
        if (p.health <= 0) {
            p.health = 0;
            p.alive = false;
            this.cb.onDeath();
        }
    }

    damageEnemy(e, dmg) {
        if (!e.alive) return;
        e.health -= dmg;
        if (e.painT <= 0 && e.health > 0) playSound('enemy_pain'); // grunt (throttled by painT)
        e.painT = 0.22;
        // MODERN M4.2: flinch on any hit; stagger on a heavy one (≥ 30 % of max)
        e.flinchT = 0.3;
        if (dmg >= e.maxHealth * 0.3 && e.health > 0) { e.staggerT = 0.6; e.staggerSide = Math.random() < 0.5 ? -1 : 1; }
        if (e.state === 'idle' || e.state === 'alert') {
            e.state = 'chase'; // getting shot wakes them up
            this.packAlert(e);
        }
        if (e.health <= 0) {
            e.alive = false;
            e.state = 'dead';
            e.deathT = 0; e.deathSide = undefined;
            for (const mat of e.model.flashMats) mat.emissive?.setRGB(0, 0, 0);
            // they go down in a spray of paint
            this.effects.burst(new THREE.Vector3(e.x, 0.5, e.y),
                new THREE.Color().setHSL(Math.random(), 0.9, 0.55), 18, 2.6, 0.55);
            this.killsThisLevel++;
            this.enemiesAlive = this.enemies.filter(en => en.alive).length;
            playSound('enemy_death');
            playSound('killmark');
            { // MODERN M4.3: a colleague within earshot calls it
                const mate = this.enemies.find(o => o !== e && o.alive && o.state !== 'idle' && Math.hypot(o.x - e.x, o.y - e.y) < 7);
                if (mate) this.barks.bark(mate, 'mandown', { name: rankName(e) }, this.time);
            }
            hud.hitMarker(true); // MODERN: red kill marker
            const stats = ENEMY_STATS[e.variant];
            this.player.score += stats.score;
            this.cb.onHUD();
            if (e.variant === 'boss') this.cb.onBossDefeated();
        }
        // boss phase 2
        if (e.variant === 'boss' && e.alive && !e.phase2 && e.health < e.maxHealth / 2) {
            e.phase2 = true;
            playSound('boss_roar');
            setMix({ bossPhase2: true }); // MODERN M6.4: phase-2 orchestration layer + stinger
            this.barks.bark(e, 'rage', {}, this.time); // MODERN M4.3
            hud.toast('THE HEAD DESIGNER IS FURIOUS', 2600, 'red');
            // MODERN M4.4: visual escalation — eyes ignite, arena goes hot, cape flares
            for (const em of e.model.eyeMats || []) em.emissiveIntensity = 2.5;
            this.world.rageShift(true);
            this.cb.onBossRage?.();
            this.effects.burst(new THREE.Vector3(e.x, 0.9, e.y), new THREE.Color(0xff3a2a), 40, 4.5, 0.8, { additive: true, size: 0.05, gravity: 2 });
            this.shake = Math.max(this.shake, 0.5);
            // his rampage knocks supply crates open — comeback resources (classic spots),
            // now dropped from the ceiling with a bounce and a dust puff (M4.4)
            for (const [ch, x, y] of [['H', 12.5, 14.5], ['H', 18.5, 14.5], ['A', 14.5, 12.5], ['A', 16.5, 16.5]]) {
                if (!this.world.isSolidCell(Math.floor(x), Math.floor(y)))
                    this.spawnEntity({ char: ch, x, y, drop: true });
            }
        }
    }

    /** spotting or getting shot wakes nearby staff */
    packAlert(src) {
        for (const o of this.enemies) {
            if (o === src || !o.alive || o.state !== 'idle') continue;
            if (Math.hypot(o.x - src.x, o.y - src.y) < PACK_ALERT_RADIUS) {
                o.state = 'alert';
                o.stateTimer = 0.3 + Math.random() * 0.5;
                o.hopT = 0.3; // startled jump
            }
        }
    }

    updateEnemies(dt) {
        const p = this.player;
        for (const e of this.enemies) {
            const m = e.model;

            // death animation: fall over then stay
            if (!e.alive) {
                poseDeath(e, m, dt); // MODERN M4.2: buckle → fall → settle
                e.deadFor = (e.deadFor || 0) + dt;
                if (e.lastPaint && e.deadFor < 2.4) { // MODERN M4.5: drips as he goes down, a pool where he lands
                    e.dripAcc = (e.dripAcc || 0) + dt;
                    if (e.dripAcc > 0.12) {
                        e.dripAcc = 0;
                        const h = Math.max(0.08, 0.7 * (1 - Math.min(1, e.deathT / 0.85)));
                        this.effects.burst(new THREE.Vector3(e.x + (Math.random() - 0.5) * 0.3, h, e.y + (Math.random() - 0.5) * 0.3), e.lastPaint, 2, 0.4, 0.7, { size: 0.035, gravity: 5 });
                    }
                    if (!e.pooled && e.deathT > 0.85) {
                        e.pooled = true;
                        this.effects.splat(new THREE.Vector3(e.x, 0.02, e.y), new THREE.Vector3(0, 1, 0), e.lastPaint, (e.variant === 'boss' ? 1.4 : 0.75) + Math.random() * 0.2);
                    }
                }
                continue;
            }

            const stats = ENEMY_STATS[e.variant];
            const dx = p.x - e.x, dy = p.y - e.y;
            const dist = Math.hypot(dx, dy);
            const los = dist < 26 && this.world.lineOfSight(e.x, e.y, p.x, p.y);

            // pain flash
            if (e.painT > 0) {
                e.painT -= dt;
                const f = e.painT > 0 ? 0.8 : 0;
                for (const mat of m.flashMats) {
                    mat.emissive = mat.emissive || new THREE.Color();
                    mat.emissive.setRGB(f, 0, 0);
                }
            }

            let moveX = 0, moveY = 0;
            const speedMul = e.phase2 ? 1.35 : 1;

            if (e.state === 'idle') {
                // wander: walk a heading for a while, then pick a new one
                e.patrolTimer -= dt;
                if (e.patrolTimer <= 0) {
                    e.patrolTimer = 1.2 + Math.random() * 2;
                    e.patrolDir = Math.random() * Math.PI * 2;
                    e.patrolMove = Math.random() > 0.3;
                }
                if (e.patrolMove) {
                    moveX = Math.cos(e.patrolDir) * stats.moveSpeed * 0.4;
                    moveY = Math.sin(e.patrolDir) * stats.moveSpeed * 0.4;
                }
                if (los && dist < stats.detectRange && this.spawnGrace <= 0) {
                    e.state = 'alert';
                    e.stateTimer = 0.35;
                    e.hopT = 0.3; // startled jump
                    playSound(e.variant === 'boss' ? 'boss_roar' : 'alert');
                    this.packAlert(e);
                    this.barks.bark(e, 'alert', { floor: `floor ${this.levelIndex + 1}` }, this.time); // MODERN M4.3
                }
            } else if (e.state === 'alert') {
                e.stateTimer -= dt;
                if (e.stateTimer <= 0) e.state = 'chase';
            } else if (e.state === 'chase') {
                const inRange = los && dist < stats.attackRange;
                e.strafeTimer -= dt;
                if (e.strafeTimer <= 0) {
                    e.strafeTimer = 1.1 + Math.random() * 1.4;
                    e.strafeSign *= -1;
                }

                if (inRange && dist > 2.2) {
                    // combat dance: orbit the player, drift to preferred range
                    const toP = Math.atan2(dy, dx);
                    const orbit = toP + Math.PI / 2 * e.strafeSign;
                    const preferred = stats.attackRange * 0.55;
                    const radial = dist > preferred ? 0.5 : -0.4; // close in / back off
                    moveX = (Math.cos(orbit) * 0.8 + Math.cos(toP) * radial) * stats.moveSpeed * 0.75 * speedMul;
                    moveY = (Math.sin(orbit) * 0.8 + Math.sin(toP) * radial) * stats.moveSpeed * 0.75 * speedMul;
                } else if (dist > 1.1) {
                    // hunt: head straight for the player
                    const ang = Math.atan2(dy, dx);
                    moveX = Math.cos(ang) * stats.moveSpeed * speedMul;
                    moveY = Math.sin(ang) * stats.moveSpeed * speedMul;
                }

                if (!los) {
                    e.lostSightTimer += dt;
                    if (e.lostSightTimer > 4.5) {
                        e.state = 'idle';
                        e.lostSightTimer = 0;
                        this.barks.bark(e, 'lost', { zone: this.level.name.toLowerCase() }, this.time); // MODERN M4.3
                    }
                } else e.lostSightTimer = 0;

                // ranged attack with target leading
                e.attackTimer -= dt;
                if (los && dist < stats.attackRange && e.attackTimer <= 0) {
                    e.attackTimer = stats.attackCooldown * (e.phase2 ? 0.72 : 1) * (0.85 + Math.random() * 0.3);
                    this.enemyShoot(e, stats);
                }
                // melee scratch when adjacent
                e.meleeTimer -= dt;
                if (dist < 0.9 && e.meleeTimer <= 0) {
                    e.meleeTimer = 1.1;
                    this.hurtPlayer(stats.damage * 0.6, e.x, e.y);
                }
            }

            // apply movement with collision + separation (+ open doors in the way)
            if (moveX || moveY) {
                const nx = e.x + moveX * dt;
                const ny = e.y + moveY * dt;
                const [rx, ry] = this.world.collide(nx, ny, 0.28);
                const blocked = Math.hypot(rx - nx, ry - ny) > 0.01;
                e.x = rx; e.y = ry;
                e.walkPhase += dt * (4 + Math.hypot(moveX, moveY) * 2.5);
                // staff have keycards: blocked chasers open doors
                if (blocked && e.state === 'chase') {
                    const heading = Math.atan2(moveY, moveX);
                    const cx = Math.floor(e.x + Math.cos(heading) * 0.7);
                    const cy = Math.floor(e.y + Math.sin(heading) * 0.7);
                    const door = this.world.doors.get(this.world.key(cx, cy));
                    if (door && (door.state === 'closed' || door.state === 'closing')) {
                        door.state = 'opening';
                        playSound('door_open');
                    }
                }
            }
            // separation from other enemies
            for (const o of this.enemies) {
                if (o === e || !o.alive) continue;
                const ox = e.x - o.x, oy = e.y - o.y;
                const od = Math.hypot(ox, oy);
                if (od < 0.5 && od > 0.001) {
                    e.x += (ox / od) * (0.5 - od) * 0.5;
                    e.y += (oy / od) * (0.5 - od) * 0.5;
                }
            }

            // update model transform; facing is still decided here (classic)
            const isMoving = !!(moveX || moveY);
            const face = (e.state === 'chase' || e.state === 'alert')
                ? Math.atan2(p.x - e.x, p.y - e.y)
                : Math.atan2(Math.cos(e.patrolDir), Math.sin(e.patrolDir));
            // turn smoothly instead of snapping
            let dFace = face - m.group.rotation.y;
            while (dFace > Math.PI) dFace -= Math.PI * 2;
            while (dFace < -Math.PI) dFace += Math.PI * 2;
            m.group.rotation.y += dFace * Math.min(1, dt * 10);
            // MODERN M4.2: pose layers (locomotion, aim, fire, flinch, stagger, hop)
            let playerRel = Math.atan2(p.x - e.x, p.y - e.y) - m.group.rotation.y;
            while (playerRel > Math.PI) playerRel -= Math.PI * 2;
            while (playerRel < -Math.PI) playerRel += Math.PI * 2;
            // MODERN M4.3: cover-peek — waiting out the cooldown beside a tall prop
            let peekSide = 0;
            if (e.state === 'chase' && e.attackTimer > 0.5 && !isMoving) {
                const cx = Math.floor(e.x), cy = Math.floor(e.y);
                for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (this.world.tallProps.has(this.world.key(cx + ox, cy + oy))) {
                        const rel = Math.atan2(ox, oy) - m.group.rotation.y;
                        peekSide = Math.sin(rel) > 0 ? -1 : 1; // lean toward the open side
                        break;
                    }
                }
            }
            e.advanceT = Math.max(0, (e.advanceT || 0) - dt);
            // MODERN M7.2: only staff within 14 m cast shadows (the shadow pass is a second draw of every caster)
            const farCaster = dist > 14;
            if (m.farCaster !== farCaster) { m.farCaster = farCaster; m.group.traverse(o => { if (o.isMesh) o.castShadow = !farCaster; }); }
            const bounceY = poseEnemy(e, m, {
                dt, time: this.time, isMoving,
                speedFrac: Math.hypot(moveX, moveY) / (stats.moveSpeed * speedMul || 1),
                aiming: e.state === 'chase' && los && dist < stats.attackRange,
                playerRel,
                windUp: e.state === 'chase' && e.attackTimer < 0.35,
                peekSide,
                advancing: e.advanceT > 0 && isMoving,
            });
            m.group.position.set(e.x, bounceY, e.y);
            e.shadow.position.set(e.x, 0.012, e.y);
        }
    }

    enemyShoot(e, stats) {
        // crossfire cap: mobs stagger their shots so the player is pressured,
        // not liquefied (the boss plays by his own rules)
        if (e.variant !== 'boss' &&
            this.projectiles.filter(p => p.owner === 'enemy').length >= 4) {
            e.attackTimer = 0.4;
            return;
        }
        playSound('shoot');
        e.fireT = 0.18; // MODERN M4.2: arm kick
        { // MODERN M4.3: suppress-and-advance read — after a shot while still outside preferred range
            const preferred = stats.attackRange * 0.55;
            const d = Math.hypot(this.player.x - e.x, this.player.y - e.y);
            if (d > preferred + 1) { e.advanceT = 1.0; if (Math.random() < 0.25) this.barks.bark(e, 'advance', {}, this.time); }
        }
        const p = this.player;
        // lead the target: aim where the player will be (skill varies by rank)
        const flight = Math.hypot(p.x - e.x, p.y - e.y) / ENEMY_PROJECTILE_SPEED;
        const lead = stats.lead || 0;
        const tx = p.x + this.vel.x * flight * lead;
        const ty = p.y + this.vel.y * flight * lead;
        // phase 2: paired shots, side alternating — readable but relentless
        e.volleyFlip = !e.volleyFlip;
        const shots = e.phase2 ? [0, e.volleyFlip ? 0.24 : -0.24] : [0];
        for (const off of shots) {
            const ang = Math.atan2(ty - e.y, tx - e.x) + off;
            this.spawnProjectile({
                x: e.x + Math.cos(ang) * 0.35,
                y: e.y + Math.sin(ang) * 0.35,
                z: 0.55 * (e.variant === 'boss' ? 1.4 : 1),
                vx: Math.cos(ang) * ENEMY_PROJECTILE_SPEED,
                vy: Math.sin(ang) * ENEMY_PROJECTILE_SPEED,
                owner: 'enemy',
                damage: stats.damage,
                color: new THREE.Color(e.variant === 'boss' ? 0xff3300 : 0xff7700),
                light: e.variant === 'boss',
            });
        }
    }

    updatePickups(dt, time) {
        const p = this.player;
        for (const item of this.pickups) {
            if (!item.active) continue;
            const bob = Math.sin(time * 2.2 + item.bobOff) * 0.04;
            item.mesh.position.y = 0.06 + bob + 0.04;
            if (item.dropT !== undefined) { // MODERN M4.4: ceiling drop with a bounce, dust on landing
                item.dropT += dt;
                const rest = 0.1, fallT = 0.55;
                if (item.dropT < fallT) {
                    const k = item.dropT / fallT;
                    item.mesh.position.y = item.dropFrom + (rest - item.dropFrom) * (k * k);
                } else {
                    const k = item.dropT - fallT;
                    if (!item.landed) { item.landed = true; this.effects.burst(new THREE.Vector3(item.x, 0.05, item.y), new THREE.Color(0xc8c4b8), 10, 1.2, 0.5, { size: 0.06, gravity: 1.5, drag: 2 }); playSound('land'); }
                    if (k < 0.5) item.mesh.position.y = rest + Math.sin(k / 0.5 * Math.PI) * 0.12 * (1 - k / 0.5);
                    else delete item.dropT;
                }
            }
            item.mesh.rotation.y += dt * (item.kind === 'table' ? 0.6 : 1.6);
            if (item.mesh.userData.halo) {
                item.mesh.userData.halo.rotation.z += dt * 2;
                item.mesh.userData.halo.material.opacity = 0.5 + Math.sin(time * 3) * 0.3;
            }

            // generous radius — standing anywhere on the item always registers
            const dist = Math.hypot(p.x - item.x, p.y - item.y);
            if (dist > 0.8) continue;

            let collected = true;
            if (item.kind === 'table') {
                p.tables++;
                p.score += SCORE_VALUES.table;
                playSound('table');
                musicSwell(); // MODERN M6.4: the score lifts under the objective
                // golden confetti for the guest of honor
                const tpos = new THREE.Vector3(item.x, 0.65, item.y);
                this.effects.burst(tpos, new THREE.Color(0xffd700), 24, 3.2, 0.85);
                this.effects.burst(tpos, new THREE.Color().setHSL(Math.random(), 1, 0.6), 16, 2.6, 0.7);
                hud.toast(`TABLE RECLAIMED  ${p.tables}/${this.requiredTables}`, 1800, 'gold');
                if (p.tables >= this.requiredTables && this.world.unlockGates()) {
                    playSound('gate');
                    setTimeout(() => hud.toast('ELEVATOR UNLOCKED — HEAD DOWN', 3000, 'green'), 900);
                }
            } else if (item.kind === 'ammo') {
                if (p.ammo >= 99) { collected = false; this.fullHint('PAINT'); }
                else { p.ammo = Math.min(99, p.ammo + 14); playSound('collect'); this.topUp(true); }
            } else if (item.kind === 'health') {
                if (p.health >= MAX_HEALTH) { collected = false; this.fullHint('HEALTH'); }
                else {
                    p.health = Math.min(MAX_HEALTH, p.health + 25);
                    playSound('munch');
                    hud.toast('FRITOS  +25 HP', 1100, 'green');
                }
            } else if (item.kind === 'money') {
                p.score += SCORE_VALUES.money;
                playSound('money');
                this.effects.burst(new THREE.Vector3(item.x, 0.4, item.y),
                    new THREE.Color(0xffd24a), 8, 1.6, 0.45);
            } else if (item.kind === 'goldBar') {
                p.score += SCORE_VALUES.goldBar;
                playSound('money');
                this.effects.burst(new THREE.Vector3(item.x, 0.4, item.y),
                    new THREE.Color(0xffe27a), 12, 1.9, 0.5);
            } else if (item.kind.startsWith('weapon:')) {
                const wkey = item.kind.split(':')[1];
                if (!p.weapons.includes(wkey)) {
                    p.weapons.push(wkey);
                    p.currentWeapon = p.weapons.length - 1;
                    this.updateViewmodel();
                    playSound('fanfare');
                    hud.toast(`NEW WEAPON: ${WEAPONS[wkey].name}  [${p.weapons.length}]`, 3200, 'gold');
                } else collected = false;
            }

            if (collected) {
                item.active = false;
                this.scene.remove(item.mesh);
                hud.pickupFlash();
                this.cb.onHUD();
            }
        }
    }

    /** Tell the player why an item didn't collect instead of silently ignoring it. */
    fullHint(what) {
        if (this.time - this.lastFullHint < 1.5) return;
        this.lastFullHint = this.time;
        hud.toast(`${what} ALREADY FULL`, 900);
        hud.benchHint(`${what} ALREADY FULL`); // R2.3
    }

    checkElevator() {
        if (this.elevatorTriggered || this.level.boss) return;
        const p = this.player;
        if (this.world.cellRaw(Math.floor(p.x), Math.floor(p.y)) === CELL.ELEVATOR &&
            p.tables >= this.requiredTables) {
            this.elevatorTriggered = true;
            p.score += SCORE_VALUES.levelBonus;
            playSound('elevator');
            this.cb.onLevelComplete({
                kills: this.killsThisLevel,
                total: this.enemies.length,
                time: Math.round(this.time - this.levelStartTime),
                bonus: SCORE_VALUES.levelBonus,
            });
        }
    }

    updateCameraAndViewmodel(dt, time) {
        const p = this.player;
        const speedNow = this.vel.length();
        const bobAmp = (0.014 + speedNow * 0.0035) * this.bobAmount; // R5.2: head-bob amount option
        this.landDip = Math.max(0, this.landDip - dt * 4.5);
        const dip = Math.sin(Math.min(1, this.landDip) * Math.PI) * 0.055; // R5.2: landing dip
        const bob = this.moving ? Math.sin(this.bobPhase) * bobAmp : 0;
        // subtle figure-8: head also sways sideways with the stride
        const sway = this.moving ? Math.cos(this.bobPhase * 0.5) * bobAmp * 0.9 : 0;
        // player-right vector (matches strafeR input direction)
        const rightX = -Math.sin(p.rot), rightY = Math.cos(p.rot);

        // screen shake decays fast
        this.shake = Math.max(0, this.shake - dt * 1.8);
        const shx = (Math.random() - 0.5) * this.shake * 0.05;
        const shy = (Math.random() - 0.5) * this.shake * 0.05;

        this.camera.position.set(
            p.x + shx + rightX * sway,
            EYE_HEIGHT + bob + shy + this.jumpZ - dip,
            p.y + rightY * sway);
        // MODERN M2.4: recoil kick spring (critically damped, returns to zero)
        {
            // fixed 4 ms substeps: stable at any frame time (explicit Euler blew up at dt = 50 ms)
            const k = this.kick, stiff = 380, damp = 2 * Math.sqrt(stiff) * 0.9;
            const n = Math.min(40, Math.ceil(dt / 0.004)), h = dt / n;
            for (let i = 0; i < n; i++) {
                k.vPitch += (-stiff * k.pitch - damp * k.vPitch) * h; k.pitch += k.vPitch * h;
                k.vYaw += (-stiff * k.yaw - damp * k.vYaw) * h; k.yaw += k.vYaw * h;
                k.vRoll += (-stiff * k.roll - damp * k.vRoll) * h; k.roll += k.vRoll * h;
            }
            k.climb = Math.max(0, k.climb - dt * 0.012);
        }
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = -(p.rot + Math.PI / 2) + this.kick.yaw;
        this.camera.rotation.x = this.pitch + this.kick.pitch + (Math.random() - 0.5) * this.shake * 0.03;

        // dynamic roll: bank into strafes and quick turns
        const lateral = this.vel.x * rightX + this.vel.y * rightY; // + when strafing right
        const turnRoll = (this.smDX * this.sens) / Math.max(dt, 0.001); // rad/s of yaw
        const leanTarget = THREE.MathUtils.clamp(
            lateral * 0.012 + turnRoll * 0.004, -0.05, 0.05);
        this.lean += (leanTarget - this.lean) * Math.min(1, dt * 7);
        this.camera.rotation.z = -this.lean + this.kick.roll; // bank into the move (+ recoil roll)

        // sprint FOV kick
        const targetFov = this.baseFov + (this.sprinting && this.moving ? 7 : 0) - this.aim * this.ADS_FOV_DROP;
        if (Math.abs(this.camera.fov - targetFov) > 0.05) {
            this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 9);
            this.camera.updateProjectionMatrix();
        }

        this.playerLight.position.set(p.x, EYE_HEIGHT + 0.25, p.y);

        // muzzle flash decay
        if (this.muzzleLight.intensity > 0.01) {
            this.muzzleLight.intensity *= Math.exp(-22 * dt);
        }
        if (this.recoil === 1 && this.muzzleColor) {
            this.muzzleLight.color.copy(this.muzzleColor);
            this.muzzleLight.intensity = this.muzzleBoost || 5;
        }
        this.flash.update(dt);

        // viewmodel: whole-arm motion on vmRoot, recoil on the weapon
        this.recoil = Math.max(0, this.recoil - dt * 6);
        const anim = this.updateViewmodelAnim(dt);
        const root = this.vmRoot;
        const adsVm = this.viewmodels[p.weapons[p.currentWeapon]];
        {
            const walkSway = this.moving ? Math.sin(this.bobPhase * 0.5) * 0.014 : 0;
            const walkBob = this.moving ? Math.abs(Math.cos(this.bobPhase * 0.5)) * 0.014 : 0;
            const breatheX = Math.sin(time * 1.1) * 0.003, breatheY = Math.sin(time * 1.7) * 0.002;
            // mouse look lag: the arms trail the view a touch
            const lagX = -THREE.MathUtils.clamp(this.smDX * this.sens * 0.35, -0.03, 0.03);
            const lagY = THREE.MathUtils.clamp(this.smDY * this.sens * 0.25, -0.02, 0.02);
            root.position.set( // O4: rest pose (0.12, -0.06, -0.40) — tools low-right, hands in the lower third
                0.12 + walkSway * this.bobAmount + breatheX + lagX + anim.lower * 0.07 - anim.inspect * 0.05 - anim.top * 0.05,
                -0.06 + walkBob * this.bobAmount + breatheY - anim.swapDrop * 0.34 - anim.lower * 0.13 - anim.inspect * 0.03 + lagY - anim.top * 0.09,
                -0.40 + anim.lower * 0.03 + anim.inspect * 0.06 + anim.top * 0.03);
            root.rotation.set(
                anim.swapDrop * 0.9 + anim.lower * 0.55 - anim.inspect * 0.25 + lagY * 2 + anim.top * 0.35,
                -anim.lower * 0.35 + anim.inspect * 1.1 - lagX * 1.5 + anim.top * 0.25,
                anim.lower * 0.12 - anim.inspect * 0.18 - anim.top * 0.3);
            // ADS: blend toward the weapon's sight pose, damp sway/bob/lag
            const ads = adsVm?.userData.ads;
            if (ads && this.aim > 0) {
                const k = this.aim * this.aim * (3 - 2 * this.aim);
                const steady = 1 - k * 0.7;
                root.position.x = THREE.MathUtils.lerp(root.position.x, ads.pos.x + (walkSway + lagX) * 0.3, k);
                root.position.y = THREE.MathUtils.lerp(root.position.y, ads.pos.y + (walkBob + lagY) * 0.3, k);
                root.position.z = THREE.MathUtils.lerp(root.position.z, ads.pos.z, k);
                root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, ads.rotX + lagY * 2 * steady, k);
                root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, ads.rotY - lagX * 1.5 * steady, k);
                root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, 0, k);
            }
        }
        // H4.1: kinematic recoil — a second-order spring on the tool (back, up, pitch, roll) with
        // overshoot, and the arms lagging behind it; per-tool impulses live in RECOIL[key].kin
        const sp = this.kin || (this.kin = { z: 0, vz: 0, y: 0, vy: 0, px: 0, vpx: 0, rz: 0, vrz: 0, lagZ: 0, lagY: 0, grip: 0, gripT: 3 + Math.random() * 4, gripPhase: 0 });
        {
            const kk = this.RECOIL[this.quick.t > 0 ? 'tableLeg' : p.weapons[p.currentWeapon]]?.kin || { stiff: 260, damp: 16 };
            const step = (x, v, k, d, h) => { const a = -k * x - d * v; v += a * h; x += v * h; return [x, v]; };
            const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
            for (let i = 0; i < n; i++) {
                [sp.z, sp.vz] = step(sp.z, sp.vz, kk.stiff, kk.damp, h);
                [sp.y, sp.vy] = step(sp.y, sp.vy, kk.stiff * 1.2, kk.damp, h);
                [sp.px, sp.vpx] = step(sp.px, sp.vpx, kk.stiff * 0.9, kk.damp * 0.9, h);
                [sp.rz, sp.vrz] = step(sp.rz, sp.vrz, kk.stiff, kk.damp, h);
            }
            sp.lagZ += (sp.z * 0.55 - sp.lagZ) * Math.min(1, dt * 14); sp.lagY += (sp.y * 0.5 - sp.lagY) * Math.min(1, dt * 14);
            root.position.z += sp.lagZ; root.position.y += sp.lagY; root.rotation.x += sp.px * 0.35; root.rotation.z += sp.rz * 0.4;
            // H4.2: idle life — a grip adjustment every few seconds (a small roll and re-seat of the tool)
            sp.gripT -= dt;
            if (sp.gripT <= 0 && !this.moving && this.recoil < 0.05) { sp.gripT = 4 + Math.random() * 5; sp.gripPhase = 0.6; }
            if (sp.gripPhase > 0) { sp.gripPhase = Math.max(0, sp.gripPhase - dt); sp.grip = Math.sin((1 - sp.gripPhase / 0.6) * Math.PI); } else sp.grip = 0;
            root.rotation.z += sp.grip * 0.03; root.position.y -= sp.grip * 0.004; root.rotation.x += sp.grip * 0.015;
        }
        const shownKey = this.quick.t > 0 ? 'tableLeg' : p.weapons[p.currentWeapon];
        const vm = this.viewmodels[shownKey];
        if (vm) {
            const w = WEAPONS[shownKey];
            const base = vm.userData.baseRotX || 0;
            const bp = vm.userData.basePos || (vm.userData.basePos = vm.position.clone());
            vm.position.copy(bp);
            const rvm = (this.RECOIL[shownKey] || this.RECOIL.paintbrush).vm;
            if (w.type === 'melee') { // swing: wrist-led arc with a forward lunge; the arms stay anchored
                const k = this.recoil;
                vm.rotation.x = base - k * 0.55 * rvm + sp.px * 0.6;
                vm.rotation.z = k * 0.35 * rvm + sp.rz;
                vm.rotation.y = -k * 0.25;
                vm.position.z = bp.z - k * 0.1 + sp.z;
                vm.position.y = bp.y - k * 0.03;
            } else {
                vm.position.z = bp.z + sp.z; vm.position.y = bp.y + sp.y;
                vm.rotation.x = base + sp.px;
                vm.rotation.z = sp.rz;
            }
            // R3.3: hand parts — trigger squeeze, wrist flick, off-hand pump / fidget / hose sway
            const parts = vm.userData.parts || {};
            const r = this.recoil;
            if (parts.trigger) parts.trigger.rotation.x = parts.trigger.userData.rest.x + Math.min(1, r * 1.5) * 0.5;
            // L4: skinned hand animation — trigger squeeze, relax, fidget, grip adjust, recoil wrist flex
            const rigs = vm.userData.rigs || [];
            if (rigs.length) {
                const hm = this.handMorph || (this.handMorph = { sq: 0, relax: 0, fid: 0, fidT: 2 + Math.random() * 3, fidPhase: 0 });
                hm.sq += (Math.min(1, r * 1.6) - hm.sq) * Math.min(1, dt * 30);
                hm.relax += (((this.sprinting && this.moving) || this.vmAnim.swapPhase !== 'idle' ? 1 : 0) - hm.relax) * Math.min(1, dt * 6);
                hm.fidT -= dt; if (hm.fidT <= 0 && !this.moving) { hm.fidT = 3 + Math.random() * 4; hm.fidPhase = 1.2; }
                if (hm.fidPhase > 0) { hm.fidPhase = Math.max(0, hm.fidPhase - dt); hm.fid = Math.sin((1 - hm.fidPhase / 1.2) * Math.PI) * 0.6; } else hm.fid = 0;
                for (const rig of rigs) { const R = rig.side === 'R'; rig.sq = R ? hm.sq : hm.sq * 0.15; rig.relax = hm.relax; rig.fid = hm.fid * (R ? 0.5 : 1); rig.grip = sp.grip * 0.7; rig.wristFlex = sp.px * (R ? 0.5 : 0.25); applyPose(rig); }
            }
            const hands = vm.userData.hands || [];
            if (hands.length) {
                const hm = this.handMorph || (this.handMorph = { sq: 0, relax: 0, fid: 0, fidT: 2 + Math.random() * 3, fidPhase: 0 });
                hm.sq += (Math.min(1, r * 1.6) - hm.sq) * Math.min(1, dt * 30);
                hm.relax += (((this.sprinting && this.moving) || this.vmAnim.swapPhase !== 'idle' ? 1 : 0) - hm.relax) * Math.min(1, dt * 6);
                hm.fidT -= dt; if (hm.fidT <= 0 && !this.moving) { hm.fidT = 3 + Math.random() * 4; hm.fidPhase = 1.2; }
                if (hm.fidPhase > 0) { hm.fidPhase = Math.max(0, hm.fidPhase - dt); hm.fid = Math.sin((1 - hm.fidPhase / 1.2) * Math.PI) * 0.6; } else hm.fid = 0;
                for (const hmesh of hands) { const inf = hmesh.morphTargetInfluences; inf[0] = hmesh.userData.side === 'R' ? hm.sq : hm.sq * 0.2; inf[1] = hm.relax * 0.8; inf[2] = hm.fid * (hmesh.userData.side === 'L' ? 1 : 0.5); inf[3] = sp.grip * 0.7; }
            }
            if (parts.head) parts.head.rotation.x = parts.head.userData.rest.x - r * 0.6 * rvm;
            if (parts.offHand) {
                const rest = parts.offHand.userData.rest;
                if (shownKey === 'roller') { const pump = r > 0.55 ? (1 - r) / 0.45 : r / 0.55; parts.offHand.position.z = rest.pz + pump * 0.05; }
                else parts.offHand.position.z = rest.pz + r * 0.012;
                parts.offHand.position.y = rest.py + Math.sin(time * 0.9) * 0.002 + (this.moving ? Math.sin(this.bobPhase * 0.5 + 1) * 0.003 : 0);
                parts.offHand.rotation.z = rest.z + Math.sin(time * 0.7) * 0.012 + (shownKey === 'sprayer' ? Math.sin(time * 2.1) * 0.02 : 0);
                parts.offHand.rotation.x = rest.x + (shownKey === 'paintbrush' ? anim.top * 0.6 : 0);
            }
        }
        // H3.1 studio: pull the viewmodel to the centre, larger, and hold the requested pose
        if (this.studioOn) {
            const zoom = 1.45;
            root.position.set(0.02, -0.02, -0.42); root.rotation.set(0.05, -0.15, 0); root.scale.setScalar(zoom);
            if (this.studioPose === 'sprint') { root.position.y -= 0.12; root.rotation.x += 0.5; root.rotation.y -= 0.35; }
            if (this.studioPose === 'inspect') { root.rotation.y += 1.0; root.rotation.x -= 0.2; root.position.x -= 0.05; }
            if (this.studioPose === 'side') { root.rotation.y += 1.5; root.position.x -= 0.02; root.position.z -= 0.12; } // grip seen from the side
            if (this.studioPose === 'top') { root.rotation.x += 1.1; root.position.y += 0.08; root.position.z -= 0.05; } // seen from above
            if (this.studioPose === 'ads' && adsVm?.userData.ads) { const a = adsVm.userData.ads; root.position.set(a.pos.x, a.pos.y + 0.06, a.pos.z + 0.1); root.rotation.set(a.rotX, a.rotY, 0); root.scale.setScalar(1.15); }
        } else if (root.scale.x !== 0.9) root.scale.setScalar(0.9); // K3: viewmodel at 90 % to cut wide-FOV distortion
        // R4.3: the tool pulls in and tilts down against a wall
        {
            const ahead = this.world.isSolidCell(Math.floor(p.x + Math.cos(p.rot) * 0.6), Math.floor(p.y + Math.sin(p.rot) * 0.6)) ? 1 : 0;
            this.wallK = (this.wallK || 0) + (ahead - (this.wallK || 0)) * Math.min(1, dt * 8);
            root.position.z += this.wallK * 0.11; root.position.y -= this.wallK * 0.05; root.rotation.x += this.wallK * 0.35; root.rotation.y += this.wallK * 0.15;
        }
        // R4.3: dynamic crosshair
        {
            const w = WEAPONS[p.weapons[p.currentWeapon]];
            const gap = 5 + (w.spread || 0) * 90 + (this.moving ? (this.sprinting ? 9 : 4) : 0) + this.recoil * 12 + (this.jumpZ > 0.01 ? 6 : 0);
            hud.setCrosshair({ gap, style: w.type === 'melee' ? 'melee' : 'lines', hidden: this.sprinting && this.moving && this.aim < 0.1, aim: this.aim });
        }
    }
}
