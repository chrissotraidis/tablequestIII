/**
 * WORLD BUILDER — turns ASCII level maps into a lit 3D scene.
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, WALL_HEIGHT } from './config.js';
import { getTextures } from './textures.js';

const WALL_TYPE = {
    '#': CELL.BRICK, 'W': CELL.WOOD, 'B': CELL.STONE,
    'C': CELL.CONCRETE, 'O': CELL.OFFICE, 'M': CELL.METAL,
};
const TEX_FOR_TYPE = {
    [CELL.BRICK]: 'brick', [CELL.WOOD]: 'wood', [CELL.STONE]: 'stone',
    [CELL.CONCRETE]: 'concrete', [CELL.OFFICE]: 'office', [CELL.METAL]: 'metal',
};

export class World {
    constructor(scene, level) {
        this.scene = scene;
        this.level = level;
        this.group = new THREE.Group();
        scene.add(this.group);

        this.doors = new Map();   // "x,y" -> door record
        this.gates = [];
        this.gatesUnlocked = false;
        this.spawn = { x: 1.5, y: 1.5 };
        this.entities = [];       // {char, x, y}
        this.elevatorCells = [];

        this.build();
    }

    key(x, y) { return `${x},${y}`; }

    build() {
        const tex = getTextures();
        const lvl = this.level;
        const rows = lvl.map;
        const w = this.w = Math.max(...rows.map(r => r.length));
        const h = this.h = rows.length;
        const grid = this.grid = new Int8Array(w * h);

        const geosByType = {};

        for (let y = 0; y < h; y++) {
            const row = rows[y].padEnd(w, lvl.wallChar);
            for (let x = 0; x < w; x++) {
                const ch = row[x];
                let type = CELL.EMPTY;

                if (WALL_TYPE[ch] !== undefined) {
                    type = WALL_TYPE[ch];
                    const g = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
                    g.translate(x + 0.5, WALL_HEIGHT / 2, y + 0.5);
                    (geosByType[type] = geosByType[type] || []).push(g);
                } else if (ch === '+') {
                    type = CELL.DOOR;
                    this.makeDoor(x, y, rows, w, h, lvl);
                } else if (ch === 'X') {
                    type = CELL.GATE;
                    this.makeGate(x, y);
                } else if (ch === 'E') {
                    type = CELL.ELEVATOR;
                    this.elevatorCells.push([x, y]);
                } else if (ch === 'S') {
                    this.spawn = { x: x + 0.5, y: y + 0.5 };
                } else if (ch !== '.' && ch !== ' ') {
                    this.entities.push({ char: ch, x: x + 0.5, y: y + 0.5 });
                }
                grid[y * w + x] = type;
            }
        }

        // merged wall meshes (one draw call per material)
        for (const [type, geos] of Object.entries(geosByType)) {
            const merged = BufferGeometryUtils.mergeGeometries(geos);
            const m = new THREE.MeshLambertMaterial({ map: tex[TEX_FOR_TYPE[type]] });
            const mesh = new THREE.Mesh(merged, m);
            this.group.add(mesh);
            geos.forEach(g => g.dispose());
        }

        // floor & ceiling
        const floorTex = tex[lvl.floorTex].clone();
        floorTex.repeat.set(w, h);
        floorTex.needsUpdate = true;
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshLambertMaterial({ map: floorTex })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(w / 2, 0, h / 2);
        this.group.add(floor);

        const ceilTex = tex[lvl.ceilTex].clone();
        ceilTex.repeat.set(w, h);
        ceilTex.needsUpdate = true;
        const ceil = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshLambertMaterial({ map: ceilTex })
        );
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(w / 2, WALL_HEIGHT, h / 2);
        this.group.add(ceil);

        this.addLighting();
        this.addElevatorDressing();
    }

    makeDoor(x, y, rows, w, h, lvl) {
        const tex = getTextures();
        const isWallAt = (cx, cy) => {
            if (cx < 0 || cy < 0 || cx >= w || cy >= h) return true;
            const ch = (rows[cy] || '').padEnd(w, lvl.wallChar)[cx];
            return WALL_TYPE[ch] !== undefined;
        };
        // panel spans X if walls left+right, else spans Z
        const spanX = isWallAt(x - 1, y) && isWallAt(x + 1, y);
        const geo = spanX
            ? new THREE.BoxGeometry(1, WALL_HEIGHT, 0.14)
            : new THREE.BoxGeometry(0.14, WALL_HEIGHT, 1);
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex.door }));
        mesh.position.set(x + 0.5, WALL_HEIGHT / 2, y + 0.5);
        this.group.add(mesh);
        this.doors.set(this.key(x, y), {
            x, y, mesh, spanX,
            openT: 0, state: 'closed', closeTimer: 0,
            baseX: x + 0.5, baseY: y + 0.5,
        });
    }

    makeGate(x, y) {
        const tex = getTextures();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, WALL_HEIGHT, 0.1),
            new THREE.MeshLambertMaterial({ map: tex.gate, transparent: true })
        );
        mesh.position.set(x + 0.5, WALL_HEIGHT / 2, y + 0.5);
        this.group.add(mesh);
        this.gates.push({ x, y, mesh, t: 0 });
    }

    addLighting() {
        const lvl = this.level;
        this.scene.fog = new THREE.FogExp2(lvl.fogColor, lvl.fogDensity);

        // dimmer ambient + stronger accent lights = more depth and contrast
        const amb = new THREE.AmbientLight(lvl.ambient, lvl.ambientIntensity * 0.72);
        this.group.add(amb);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x282830, 0.22);
        this.group.add(hemi);

        // accent point lights spread through the floor (nearest empty cell)
        const spots = [
            [this.w * 0.25, this.h * 0.25], [this.w * 0.75, this.h * 0.25],
            [this.w * 0.25, this.h * 0.75], [this.w * 0.75, this.h * 0.75],
            [this.w * 0.5, this.h * 0.5],
            [this.w * 0.5, this.h * 0.15], [this.w * 0.5, this.h * 0.85],
            [this.w * 0.12, this.h * 0.5], [this.w * 0.88, this.h * 0.5],
        ];
        const fixtureGeo = new THREE.BoxGeometry(0.4, 0.04, 0.4);
        const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
        for (const [sx, sy] of spots) {
            const cell = this.findEmptyNear(Math.floor(sx), Math.floor(sy));
            if (!cell) continue;
            const [cx, cy] = cell;
            const light = new THREE.PointLight(lvl.accent, 11, 12, 1.55);
            light.position.set(cx + 0.5, WALL_HEIGHT - 0.12, cy + 0.5);
            this.group.add(light);
            const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
            fixture.position.set(cx + 0.5, WALL_HEIGHT - 0.025, cy + 0.5);
            this.group.add(fixture);
        }

        // emissive (non-light) ceiling panels for visual rhythm
        const panelGeo = new THREE.PlaneGeometry(0.5, 0.5);
        const panelMat = new THREE.MeshBasicMaterial({ color: 0xe8e2cc });
        const panels = [];
        for (let y = 2; y < this.h - 2; y += 4)
            for (let x = 2; x < this.w - 2; x += 4)
                if (this.grid[y * this.w + x] === CELL.EMPTY) {
                    const p = new THREE.Mesh(panelGeo, panelMat);
                    p.rotation.x = Math.PI / 2;
                    p.position.set(x + 0.5, WALL_HEIGHT - 0.01, y + 0.5);
                    panels.push(p);
                }
        panels.forEach(p => this.group.add(p));
    }

    addElevatorDressing() {
        if (!this.elevatorCells.length) return;
        const tex = getTextures();
        // glowing pad + green light over the elevator
        let cx = 0, cy = 0;
        for (const [x, y] of this.elevatorCells) { cx += x + 0.5; cy += y + 0.5; }
        cx /= this.elevatorCells.length;
        cy /= this.elevatorCells.length;

        const light = new THREE.PointLight(0x55ff88, 8, 7, 1.4);
        light.position.set(cx, WALL_HEIGHT - 0.2, cy);
        this.group.add(light);
        this.elevatorLight = light;

        const padGeo = new THREE.PlaneGeometry(1, 1);
        const padMat = new THREE.MeshBasicMaterial({
            color: 0x33ff77, transparent: true, opacity: 0.28,
        });
        for (const [x, y] of this.elevatorCells) {
            const pad = new THREE.Mesh(padGeo, padMat);
            pad.rotation.x = -Math.PI / 2;
            pad.position.set(x + 0.5, 0.012, y + 0.5);
            this.group.add(pad);
        }

        // elevator doors texture on the wall behind the pads
        const [ex, ey] = this.elevatorCells[0];
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = ex + dx, ny = ey + dy;
            const t = this.cellRaw(nx, ny);
            if (t >= CELL.BRICK && t !== CELL.DOOR && t !== CELL.GATE && t !== CELL.ELEVATOR && t !== CELL.EMPTY) {
                const plane = new THREE.Mesh(
                    new THREE.PlaneGeometry(this.elevatorCells.length, WALL_HEIGHT),
                    new THREE.MeshLambertMaterial({ map: tex.elevator })
                );
                plane.position.set(cx - dx * 0 + (dx === 0 ? 0 : 0), WALL_HEIGHT / 2, cy - dy * 0);
                // place flush against the wall face
                plane.position.x = dx !== 0 ? nx + (dx > 0 ? -0.01 : 1.01) : cx;
                plane.position.z = dy !== 0 ? ny + (dy > 0 ? -0.01 : 1.01) : cy;
                if (dx === 1) plane.rotation.y = -Math.PI / 2;
                if (dx === -1) plane.rotation.y = Math.PI / 2;
                if (dy === -1) plane.rotation.y = 0;
                if (dy === 1) plane.rotation.y = Math.PI;
                this.group.add(plane);
                break;
            }
        }
    }

    findEmptyNear(x, y) {
        for (let r = 0; r < 8; r++)
            for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx > 0 && ny > 0 && nx < this.w && ny < this.h &&
                        this.grid[ny * this.w + nx] === CELL.EMPTY) return [nx, ny];
                }
        return null;
    }

    cellRaw(x, y) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CELL.BRICK;
        return this.grid[y * this.w + x];
    }

    /** Is the cell solid for movement purposes? */
    isSolidCell(x, y) {
        const t = this.cellRaw(x, y);
        if (t === CELL.EMPTY || t === CELL.ELEVATOR) return false;
        if (t === CELL.DOOR) {
            const d = this.doors.get(this.key(x, y));
            return !d || d.openT < 0.75;
        }
        if (t === CELL.GATE) return !this.gatesUnlocked;
        return true;
    }

    /** Solid for projectiles / line-of-sight (doors block unless mostly open). */
    blocksShots(x, y) { return this.isSolidCell(x, y); }

    /** Circle vs grid collision; returns corrected position. */
    collide(px, py, radius) {
        let x = px, y = py;
        // resolve against the 3x3 neighborhood, axis-aligned
        const cx = Math.floor(x), cy = Math.floor(y);
        for (let gy = cy - 1; gy <= cy + 1; gy++)
            for (let gx = cx - 1; gx <= cx + 1; gx++) {
                if (!this.isSolidCell(gx, gy)) continue;
                // nearest point on cell AABB
                const nx = Math.max(gx, Math.min(x, gx + 1));
                const ny = Math.max(gy, Math.min(y, gy + 1));
                const dx = x - nx, dy = y - ny;
                const d2 = dx * dx + dy * dy;
                if (d2 < radius * radius && d2 > 0.000001) {
                    const d = Math.sqrt(d2);
                    const push = (radius - d) / d;
                    x += dx * push;
                    y += dy * push;
                }
            }
        return [x, y];
    }

    lineOfSight(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.ceil(dist * 5);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const cx = Math.floor(x1 + (x2 - x1) * t);
            const cy = Math.floor(y1 + (y2 - y1) * t);
            if (this.blocksShots(cx, cy)) return false;
        }
        return true;
    }

    tryOpenDoor(px, py, rot) {
        // prefer the door the player is facing
        for (const dist of [0.8, 1.4]) {
            const cx = Math.floor(px + Math.cos(rot) * dist);
            const cy = Math.floor(py + Math.sin(rot) * dist);
            const d = this.doors.get(this.key(cx, cy));
            if (d && (d.state === 'closed' || d.state === 'closing')) {
                d.state = 'opening';
                return true;
            }
        }
        // forgiving fallback: any closed door adjacent to the player
        for (const d of this.doors.values()) {
            if (d.state !== 'closed' && d.state !== 'closing') continue;
            if (Math.abs(px - d.baseX) < 1.35 && Math.abs(py - d.baseY) < 1.35) {
                d.state = 'opening';
                return true;
            }
        }
        return false;
    }

    unlockGates() {
        if (this.gatesUnlocked) return false;
        this.gatesUnlocked = true;
        return true;
    }

    update(dt, playerX, playerY) {
        // doors
        for (const d of this.doors.values()) {
            if (d.state === 'opening') {
                d.openT = Math.min(1, d.openT + dt * 1.6);
                if (d.openT >= 1) { d.state = 'open'; d.closeTimer = 4; }
            } else if (d.state === 'open') {
                d.closeTimer -= dt;
                const pin = Math.floor(playerX) === d.x && Math.floor(playerY) === d.y;
                const near = Math.abs(playerX - d.baseX) < 1.2 && Math.abs(playerY - d.baseY) < 1.2;
                if (d.closeTimer <= 0 && !pin && !near) d.state = 'closing';
            } else if (d.state === 'closing') {
                d.openT = Math.max(0, d.openT - dt * 1.6);
                if (d.openT <= 0) d.state = 'closed';
            }
            const slide = d.openT * 0.92;
            if (d.spanX) d.mesh.position.x = d.baseX + slide;
            else d.mesh.position.z = d.baseY + slide;
        }
        // gates sink when unlocked
        if (this.gatesUnlocked) {
            for (const g of this.gates) {
                if (g.t < 1) {
                    g.t = Math.min(1, g.t + dt * 0.7);
                    g.mesh.position.y = WALL_HEIGHT / 2 - g.t * WALL_HEIGHT;
                    g.mesh.material.opacity = 1 - g.t * 0.6;
                }
            }
        }
        // elevator light pulse
        if (this.elevatorLight) {
            this.elevatorLight.intensity = 7 + Math.sin(performance.now() * 0.004) * 2.5;
        }
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const ms = Array.isArray(o.material) ? o.material : [o.material];
                ms.forEach(m => m.dispose());
            }
        });
        this.scene.fog = null;
    }
}
