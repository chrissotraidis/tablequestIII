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
import { playSound, startSong } from './audio.js';
import { hud } from './hud.js';
import {
    buildEnemy, buildTable, buildAmmo, buildHealth, buildMoney,
    buildGoldBar, buildTableLegPickup, buildSprayerPickup,
    buildBrushViewmodel, buildLegViewmodel, buildSprayerViewmodel,
} from './models.js';
import { Effects } from './effects.js';

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
        this.baseFov = camera.fov;
        this.shake = 0;

        // player light follows camera
        this.playerLight = new THREE.PointLight(0xffe0b0, 7, 9, 1.5);
        scene.add(this.playerLight);

        // muzzle flash light (brief spike when firing)
        this.muzzleLight = new THREE.PointLight(0xffffff, 0, 6, 1.8);
        this.muzzleLight.position.set(0.15, -0.05, -0.5);
        camera.add(this.muzzleLight);

        // weapon viewmodels
        this.viewmodels = {
            paintbrush: buildBrushViewmodel(),
            tableLeg: buildLegViewmodel(),
            sprayer: buildSprayerViewmodel(),
        };
        for (const vm of Object.values(this.viewmodels)) {
            vm.visible = false;
            vm.position.set(0.2, -0.18, -0.42);
            camera.add(vm);
        }
        this.recoil = 0;
        this.bobPhase = 0;
        this.lastStepTime = 0;
        this.elevatorTriggered = false;
        this.godmode = false;
        this.moving = false;
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

    adjustSensitivity(delta) {
        this.sens = Math.min(0.008, Math.max(0.001, this.sens + delta));
        localStorage.setItem('tq3d-sens', String(this.sens));
        hud.toast(`MOUSE SENSITIVITY: ${(this.sens * 1000).toFixed(1)}`, 1200);
    }

    loadLevel(index, { keepStats = true } = {}) {
        // tear down old
        if (this.world) this.world.dispose();
        for (const e of this.enemies) {
            this.scene.remove(e.model.group);
            if (e.shadow) this.scene.remove(e.shadow);
        }
        for (const p of this.pickups) this.scene.remove(p.mesh);
        for (const pr of this.projectiles) this.removeProjectileMesh(pr);
        this.effects.clear();
        this.enemies = [];
        this.pickups = [];
        this.projectiles = [];
        this.boss = null;
        this.killsThisLevel = 0;
        this.elevatorTriggered = false;
        this.transitioning = false;
        this.vel.set(0, 0);
        this.pitch = 0;

        this.levelIndex = index;
        this.level = LEVELS[index];
        this.world = new World(this.scene, this.level);

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

        this.updateViewmodel();
        this.spawnGrace = 3; // seconds before staff start noticing the intruder
        startSong(this.level.music);
        hud.toast(`FLOOR ${index + 1} — ${this.level.name.toUpperCase()}`, 3000);
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

    spawnEntity({ char, x, y }) {
        if (ENEMY_CHAR[char] !== undefined) {
            let variant = ENEMY_CHAR[char];
            if (variant === -1) variant = Math.floor(Math.random() * 3);
            const stats = ENEMY_STATS[variant];
            const model = buildEnemy(variant);
            model.group.position.set(x, 0, y);
            this.scene.add(model.group);

            const shadow = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial({
                    map: getShadowTexture(), transparent: true, depthWrite: false,
                })
            );
            shadow.rotation.x = -Math.PI / 2;
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
                patrolMove: true,
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
        };
        const b = builders[char];
        if (!b) return;
        const [kind, build] = b;
        const mesh = build();
        mesh.position.set(x, 0, y);
        this.scene.add(mesh);
        if (kind === 'table') this.requiredTables++;
        this.pickups.push({ kind, x, y, mesh, active: true, bobOff: Math.random() * 6 });
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
        this.updateProjectiles(dt);
        this.effects.update(dt);
        this.updateCameraAndViewmodel(dt, time);
        this.checkElevator();
    }

    updatePlayer(dt) {
        const p = this.player;

        // --- look ---
        if (input.turnL) p.rot -= TURN_SPEED * dt;
        if (input.turnR) p.rot += TURN_SPEED * dt;
        p.rot += input.mouseDX * this.sens;
        this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - input.mouseDY * this.sens));

        // --- move: smoothed velocity for snappy-but-not-instant feel ---
        const speed = input.sprint ? PLAYER_SPRINT : PLAYER_SPEED;
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
            this.bobPhase += dt * (3.2 + speedNow * 1.6);
            if (performance.now() - this.lastStepTime > 1150 / speedNow) {
                playSound('step');
                this.lastStepTime = performance.now();
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
        const w = WEAPONS[p.weapons[p.currentWeapon]];
        const wantFire = input.fire || (w.auto && fireHeld());
        if (wantFire && p.cooldown <= 0) this.fireWeapon(w);
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

        if (w.type === 'melee') {
            playSound('swing');
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
            if (hit) {
                playSound('hit');
                hud.hitMarker();
                this.shake = Math.max(this.shake, 0.12);
            }
        } else {
            playSound(w === WEAPONS.sprayer ? 'spray' : 'shoot');
            const spread = (w.spread || 0) * (Math.random() - 0.5) * 2;
            const ang = p.rot + spread;
            const color = new THREE.Color().setHSL(Math.random(), 1, 0.55);
            this.muzzleColor = color;
            this.spawnProjectile({
                x: p.x + Math.cos(ang) * 0.3,
                y: p.y + Math.sin(ang) * 0.3,
                z: EYE_HEIGHT - 0.06,
                vx: Math.cos(ang) * PROJECTILE_SPEED,
                vy: Math.sin(ang) * PROJECTILE_SPEED,
                owner: 'player',
                damage: w.damage,
                color,
                light: w !== WEAPONS.sprayer,
            });
        }
        this.cb.onHUD();
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

    updateViewmodel() {
        const key = this.player.weapons[this.player.currentWeapon];
        for (const [k, vm] of Object.entries(this.viewmodels)) vm.visible = k === key;
    }

    spawnProjectile(opts) {
        const geo = new THREE.SphereGeometry(opts.owner === 'player' ? 0.05 : 0.065, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: opts.color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(opts.x, opts.z, opts.y);
        if (opts.light) {
            const light = new THREE.PointLight(opts.color, 2.2, 4, 1.8);
            mesh.add(light);
        }
        this.scene.add(mesh);
        this.projectiles.push({ ...opts, mesh, life: 3 });
    }

    removeProjectileMesh(pr) {
        this.scene.remove(pr.mesh);
        pr.mesh.geometry.dispose();
        pr.mesh.material.dispose();
    }

    updateProjectiles(dt) {
        const p = this.player;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            pr.life -= dt;
            const nx = pr.x + pr.vx * dt;
            const ny = pr.y + pr.vy * dt;
            let dead = pr.life <= 0;

            // wall hit → splat
            if (!dead && this.world.blocksShots(Math.floor(nx), Math.floor(ny))) {
                dead = true;
                const pos = new THREE.Vector3(pr.x, pr.z, pr.y);
                const cellX = Math.floor(nx);
                const prevCellX = Math.floor(pr.x);
                let normal;
                if (cellX !== prevCellX) normal = new THREE.Vector3(-Math.sign(pr.vx), 0, 0);
                else normal = new THREE.Vector3(0, 0, -Math.sign(pr.vy));
                this.effects.splat(pos, normal, pr.color, 0.26 + Math.random() * 0.18);
                this.effects.burst(pos, pr.color, 8, 1.4, 0.35);
                playSound('splat');
            }

            if (!dead) {
                if (pr.owner === 'enemy') {
                    const d = Math.hypot(p.x - nx, p.y - ny);
                    if (d < 0.32) {
                        dead = true;
                        this.hurtPlayer(pr.damage);
                        this.effects.burst(new THREE.Vector3(nx, pr.z, ny), pr.color, 10, 1.6, 0.4);
                    }
                } else {
                    for (const e of this.enemies) {
                        if (!e.alive) continue;
                        const rad = e.variant === 'boss' ? 0.55 : 0.34;
                        if (Math.hypot(e.x - nx, e.y - ny) < rad) {
                            dead = true;
                            this.damageEnemy(e, pr.damage);
                            this.effects.burst(new THREE.Vector3(nx, pr.z, ny), pr.color, 12, 1.8, 0.45);
                            playSound('hit');
                            hud.hitMarker();
                            break;
                        }
                    }
                }
            }

            if (dead) {
                this.removeProjectileMesh(pr);
                this.projectiles.splice(i, 1);
            } else {
                pr.x = nx; pr.y = ny;
                pr.mesh.position.set(nx, pr.z, ny);
            }
        }
    }

    hurtPlayer(dmg) {
        const p = this.player;
        if (this.godmode || !p.alive) return;
        // brief mercy window, slightly longer when nearly dead (pity rule)
        if (this.time - p.lastHurtTime < (p.health <= 30 ? 0.45 : 0.25)) return;
        p.health -= dmg;
        p.lastHurtTime = this.time;
        playSound('pain');
        hud.damageFlash(0.55);
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
        e.painT = 0.22;
        if (e.state === 'idle' || e.state === 'alert') {
            e.state = 'chase'; // getting shot wakes them up
            this.packAlert(e);
        }
        if (e.health <= 0) {
            e.alive = false;
            e.state = 'dead';
            e.deathT = 0;
            for (const mat of e.model.flashMats) mat.emissive?.setRGB(0, 0, 0);
            this.killsThisLevel++;
            this.enemiesAlive = this.enemies.filter(en => en.alive).length;
            playSound('enemy_death');
            const stats = ENEMY_STATS[e.variant];
            this.player.score += stats.score;
            this.cb.onHUD();
            if (e.variant === 'boss') this.cb.onBossDefeated();
        }
        // boss phase 2
        if (e.variant === 'boss' && e.alive && !e.phase2 && e.health < e.maxHealth / 2) {
            e.phase2 = true;
            playSound('boss_roar');
            hud.toast('THE HEAD DESIGNER IS FURIOUS!', 2600);
            // his rampage knocks supply crates open — comeback resources
            for (const [ch, x, y] of [['H', 12.5, 14.5], ['H', 18.5, 14.5], ['A', 14.5, 12.5], ['A', 16.5, 16.5]]) {
                if (!this.world.isSolidCell(Math.floor(x), Math.floor(y)))
                    this.spawnEntity({ char: ch, x, y });
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
            }
        }
    }

    updateEnemies(dt) {
        const p = this.player;
        for (const e of this.enemies) {
            const m = e.model;

            // death animation: fall over then stay
            if (!e.alive) {
                if (e.deathT < 1) {
                    e.deathT = Math.min(1, e.deathT + dt * 2.2);
                    m.group.rotation.x = -e.deathT * Math.PI / 2;
                    m.group.position.y = e.deathT * 0.06;
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
                    playSound(e.variant === 'boss' ? 'boss_roar' : 'alert');
                    this.packAlert(e);
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
                    this.hurtPlayer(stats.damage * 0.6);
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

            // update model transform + walk animation
            m.group.position.set(e.x, m.group.position.y, e.y);
            e.shadow.position.set(e.x, 0.012, e.y);
            const face = (e.state === 'chase' || e.state === 'alert')
                ? Math.atan2(p.x - e.x, p.y - e.y)
                : Math.atan2(Math.cos(e.patrolDir), Math.sin(e.patrolDir));
            m.group.rotation.y = face;
            const swing = (moveX || moveY) ? Math.sin(e.walkPhase) * 0.55 : 0;
            m.legL.rotation.x = swing;
            m.legR.rotation.x = -swing;
            m.armL.rotation.x = -swing * 0.7;
            m.armR.rotation.x = swing * 0.7;
            // raise arm when about to attack
            if (e.state === 'chase' && e.attackTimer < 0.35) m.armR.rotation.x = -1.9;
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
            item.mesh.rotation.y += dt * (item.kind === 'table' ? 0.6 : 1.6);
            if (item.mesh.userData.halo) {
                item.mesh.userData.halo.rotation.z += dt * 2;
                item.mesh.userData.halo.material.opacity = 0.5 + Math.sin(time * 3) * 0.3;
            }

            const dist = Math.hypot(p.x - item.x, p.y - item.y);
            if (dist > 0.55) continue;

            let collected = true;
            if (item.kind === 'table') {
                p.tables++;
                p.score += SCORE_VALUES.table;
                playSound('table');
                hud.toast(`TABLE RECLAIMED! (${p.tables}/${this.requiredTables})`, 1800);
                if (p.tables >= this.requiredTables && this.world.unlockGates()) {
                    playSound('gate');
                    setTimeout(() => hud.toast('⚡ ELEVATOR UNLOCKED — HEAD DOWN! ⚡', 3000), 900);
                }
            } else if (item.kind === 'ammo') {
                if (p.ammo >= 99) collected = false;
                else { p.ammo = Math.min(99, p.ammo + 14); playSound('collect'); }
            } else if (item.kind === 'health') {
                if (p.health >= MAX_HEALTH) collected = false;
                else { p.health = Math.min(MAX_HEALTH, p.health + 25); playSound('munch'); }
            } else if (item.kind === 'money') {
                p.score += SCORE_VALUES.money;
                playSound('money');
            } else if (item.kind === 'goldBar') {
                p.score += SCORE_VALUES.goldBar;
                playSound('money');
            } else if (item.kind.startsWith('weapon:')) {
                const wkey = item.kind.split(':')[1];
                if (!p.weapons.includes(wkey)) {
                    p.weapons.push(wkey);
                    p.currentWeapon = p.weapons.length - 1;
                    this.updateViewmodel();
                    playSound('fanfare');
                    hud.toast(`NEW WEAPON: ${WEAPONS[wkey].name}! (press ${p.weapons.length})`, 3200);
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
        const bobAmp = 0.014 + speedNow * 0.0035;
        const bob = this.moving ? Math.sin(this.bobPhase) * bobAmp : 0;

        // screen shake decays fast
        this.shake = Math.max(0, this.shake - dt * 1.8);
        const shx = (Math.random() - 0.5) * this.shake * 0.05;
        const shy = (Math.random() - 0.5) * this.shake * 0.05;

        this.camera.position.set(p.x + shx, EYE_HEIGHT + bob + shy, p.y);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = -(p.rot + Math.PI / 2);
        this.camera.rotation.x = this.pitch + (Math.random() - 0.5) * this.shake * 0.03;

        // sprint FOV kick
        const targetFov = this.baseFov + (input.sprint && this.moving ? 7 : 0);
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
            this.muzzleLight.intensity = 5;
        }

        // viewmodel sway + recoil
        this.recoil = Math.max(0, this.recoil - dt * 6);
        const vm = this.viewmodels[p.weapons[p.currentWeapon]];
        if (vm) {
            const sway = this.moving ? Math.sin(this.bobPhase * 0.5) * 0.012 : Math.sin(time * 1.2) * 0.004;
            vm.position.x = 0.2 + sway;
            vm.position.y = -0.18 + (this.moving ? Math.abs(Math.cos(this.bobPhase * 0.5)) * 0.012 : 0);
            const w = WEAPONS[p.weapons[p.currentWeapon]];
            const base = vm.userData.baseRotX || 0;
            if (w.type === 'melee') {
                vm.rotation.x = base - this.recoil * 1.6;
                vm.rotation.z = this.recoil * 0.8;
            } else {
                vm.position.z = -0.42 + this.recoil * 0.07;
                vm.rotation.x = base + this.recoil * 0.35;
            }
        }
    }
}
