/**
 * WORLD BUILDER — turns ASCII level maps into a lit 3D scene.
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, WALL_HEIGHT } from './config.js';
import { getTextures, surfaceMaterial } from './textures.js';
import { PROP_BUILDERS, buildPainting, buildRug } from './models.js';
import { playSound } from './audio.js';
import { getRig, makeKeyLight, setShadow } from './lighting.js';
import { bakeStatic } from './bake.js';
import { buildTrim } from './trim.js';
import { buildWindows, buildExterior } from './exterior.js';

const WALL_TYPE = {
    '#': CELL.BRICK, 'W': CELL.WOOD, 'B': CELL.STONE,
    'C': CELL.CONCRETE, 'O': CELL.OFFICE, 'M': CELL.METAL,
};
const TEX_FOR_TYPE = {
    [CELL.BRICK]: 'brick', [CELL.WOOD]: 'wood', [CELL.STONE]: 'stone',
    [CELL.CONCRETE]: 'concrete', [CELL.OFFICE]: 'office', [CELL.METAL]: 'metal',
};
// MODERN: walls are taller per floor. Tileable surfaces repeat vertically at
// the classic 1.35-unit scale (bricks stay brick-sized); the office panel has
// a wainscot band, so it stretches like classic did.
const VERTICAL_TILE = new Set([CELL.BRICK, CELL.WOOD, CELL.STONE, CELL.CONCRETE, CELL.METAL]);
const DOOR_H = WALL_HEIGHT; // door/gate/elevator panels keep the classic height

/** deterministic RNG so prop placement is stable per level */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * ZONE RECIPES — how each kind of room gets furnished.
 * pattern: 'perimeter' (against walls, facing in), 'rows' (aisle strips),
 *          'line' (single run down the middle), 'center', 'cluster'.
 * Zones in levels.js can override any field (density, gap, step...).
 */
const ZONE_RECIPES = {
    reception:     { pattern: 'line',      props: ['counter'], step: 2, accents: ['plant', 'plant'] },
    lounge:        { pattern: 'perimeter', props: ['sofa', 'plant', 'floorLamp', 'bench'], density: 0.55, rug: true },
    breakroom:     { pattern: 'perimeter', props: ['vending', 'counter', 'fridge', 'cooler', 'bench'], density: 0.65, rug: true },
    managerOffice: { pattern: 'perimeter', props: ['desk', 'cabinet', 'plant', 'floorLamp'], density: 0.5, rug: true },
    security:      { pattern: 'perimeter', props: ['cabinet', 'cooler', 'crate'], density: 0.35 },
    conference:    { pattern: 'center',    props: ['bigTable'], accents: ['plant', 'cabinet'], rug: true },
    cubicles:      { pattern: 'rows',      props: ['desk'], gap: 2, accents: ['cabinet', 'plant'] },
    supply:        { pattern: 'perimeter', props: ['shelf', 'crate', 'cabinet'], density: 0.65 },
    aisles:        { pattern: 'rows',      props: ['shelf'], gap: 2 },
    vault:         { pattern: 'perimeter', props: ['cabinet', 'crate'], density: 0.6 },
    copyRoom:      { pattern: 'perimeter', props: ['copier', 'cabinet', 'copier', 'cooler'], density: 0.3 },
    readingRoom:   { pattern: 'center',    props: ['bigTable'], accents: ['shelf', 'floorLamp'], rug: true },
    vignette:      { pattern: 'cluster',   props: ['sofa', 'floorLamp', 'bigTable', 'plant'], count: 4, rug: true },
    flatpack:      { pattern: 'rows',      props: ['pallet', 'crate'], gap: 2 },
    checkout:      { pattern: 'line',      props: ['counter'], step: 2 },
    assembly:      { pattern: 'line',      props: ['machine'], step: 3 },
    paintstock:    { pattern: 'cluster',   props: ['barrel', 'crate'], count: 8 },
    lumberyard:    { pattern: 'cluster',   props: ['lumber', 'pallet', 'crate'], count: 7 },
    dock:          { pattern: 'cluster',   props: ['pallet', 'crate'], count: 6 },
    gallery:       { pattern: 'line',      props: ['statue'], step: 3, accents: ['plant', 'plant'] },
    garden:        { pattern: 'perimeter', props: ['plant', 'statue', 'plant'], density: 0.5, rug: true },
};

export class World {
    constructor(scene, level, levelIndex = 0) {
        this.scene = scene;
        this.level = level;
        this.levelIndex = levelIndex;
        this.group = new THREE.Group();
        scene.add(this.group);

        this.doors = new Map();   // "x,y" -> door record
        this.gates = [];
        this.gatesUnlocked = false;
        this.spawn = { x: 1.5, y: 1.5 };
        this.entities = [];       // {char, x, y}
        this.elevatorCells = [];
        this.propCells = new Set();  // cells blocked by furniture
        this.tallProps = new Set();  // furniture tall enough to stop shots
        this.props = new Map();      // "x,y" -> { x, y, type, def, hp, mesh }

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
        const H = this.H = getRig(this.levelIndex).height ?? WALL_HEIGHT;
        const wallType = WALL_TYPE[lvl.wallChar] ?? CELL.OFFICE;

        const geosByType = {};
        // MODERN windows: which wall cells become glass, and over what height band
        const winSpec = getRig(this.levelIndex).windows || [];
        const windowBand = (x, y, ch) => {
            for (const ws of winSpec) {
                if (ws.cellType) { if (ch === ws.cellType) return ws; continue; }
                const onSide = ws.side === 'top' ? y === 0 : ws.side === 'bottom' ? y === h - 1
                    : ws.side === 'left' ? x === 0 : x === w - 1;
                const along = (ws.side === 'top' || ws.side === 'bottom') ? x : y;
                if (onSide && along >= ws.from && along <= ws.to) return ws;
            }
            return null;
        };
        const windowCells = [];
        const wallBox = (type, x, y, y0, y1) => {
            // metal carries a hazard stripe in its lower band: split tall metal
            // walls so the stripe stays at floor level and the rest is plain plate
            if (type === CELL.METAL && y0 < DOOR_H && y1 > DOOR_H + 0.01) {
                wallBox(type, x, y, y0, DOOR_H);
                wallBox('metalPlain', x, y, DOOR_H, y1);
                return;
            }
            const g = new THREE.BoxGeometry(1, y1 - y0, 1);
            const tile = VERTICAL_TILE.has(type) || type === 'metalPlain';
            if (tile) {
                const uv = g.attributes.uv;
                const k = (y1 - y0) / WALL_HEIGHT;
                for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * k + y0 / WALL_HEIGHT);
            }
            g.translate(x + 0.5, (y0 + y1) / 2, y + 0.5);
            const surf = type === 'metalPlain' ? 'metalPlain' : TEX_FOR_TYPE[type];
            (geosByType[surf] = geosByType[surf] || []).push(g);
        };

        for (let y = 0; y < h; y++) {
            const row = rows[y].padEnd(w, lvl.wallChar);
            for (let x = 0; x < w; x++) {
                const ch = row[x];
                let type = CELL.EMPTY;

                if (WALL_TYPE[ch] !== undefined) {
                    type = WALL_TYPE[ch];
                    const ws = windowBand(x, y, ch);
                    if (ws) {
                        // glass band: the cell stays solid in the grid; only its look changes
                        const y0 = Math.max(0, ws.y0), y1 = Math.min(H, ws.y1);
                        if (y0 > 0.01) wallBox(type, x, y, 0, y0);
                        if (y1 < H - 0.01) wallBox(type, x, y, y1, H);
                        const rowStr = (rows[y] || '').padEnd(w, lvl.wallChar);
                        const lr = WALL_TYPE[rowStr[x - 1]] !== undefined && WALL_TYPE[rowStr[x + 1]] !== undefined;
                        const axis = ws.side === 'top' || ws.side === 'bottom' ? 'x'
                            : ws.side === 'left' || ws.side === 'right' ? 'z' : (lr ? 'x' : 'z');
                        windowCells.push({ x, y, y0, y1, axis });
                    } else {
                        wallBox(type, x, y, 0, H);
                    }
                } else if (ch === '+') {
                    type = CELL.DOOR;
                    this.makeDoor(x, y, rows, w, h, lvl);
                    if (H > DOOR_H + 0.01) wallBox(wallType === CELL.METAL ? 'metalPlain' : wallType, x, y, DOOR_H, H); // transom above the door
                } else if (ch === 'X') {
                    type = CELL.GATE;
                    this.makeGate(x, y);
                    if (H > DOOR_H + 0.01) wallBox(wallType === CELL.METAL ? 'metalPlain' : wallType, x, y, DOOR_H, H);
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
        for (const [surf, geos] of Object.entries(geosByType)) {
            const merged = BufferGeometryUtils.mergeGeometries(geos);
            const m = surfaceMaterial(surf);
            const mesh = new THREE.Mesh(merged, m);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
            geos.forEach(g => g.dispose());
        }

        // floor & ceiling
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            surfaceMaterial(lvl.floorTex, { repeat: [w, h] })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(w / 2, 0, h / 2);
        floor.receiveShadow = true;
        this.group.add(floor);

        const ceil = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            surfaceMaterial(lvl.ceilTex, { repeat: [w, h] })
        );
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(w / 2, H, h / 2);
        // the ceiling never casts: the key light is "the overhead lighting"
        ceil.castShadow = false;
        ceil.receiveShadow = false;
        this.group.add(ceil);

        this.addLighting();
        this.addElevatorDressing();
        // shared placement state for zones + scatter
        this._sx = Math.floor(this.spawn.x);
        this._sy = Math.floor(this.spawn.y);
        this._occupied = new Set(this.entities.map(e => this.key(Math.floor(e.x), Math.floor(e.y))));
        this._reachable = this.floodCount();
        this.addZones();
        this.addProps();
        this.addWallDecor();
        this.group.add(buildTrim(this, this.H, DOOR_H, getRig(this.levelIndex).trim || {
            base: 0x4a3120, crown: 0xe8e2d4, frame: 0x5a3d28,
        }));
        // MODERN: glass + what lies beyond it
        const rig = getRig(this.levelIndex);
        if (windowCells.length) {
            this.windows = buildWindows(windowCells, rig.trim);
            this.group.add(this.windows);
        }
        if (rig.exterior) {
            this.exterior = buildExterior(w, h, rig.exterior);
            this.group.add(this.exterior);
            if (this.exterior.userData.rainMat && this.windows?.userData.pane)
                this.windows.userData.pane.material = this.exterior.userData.rainMat;
        }
    }

    // ------------------------------------------------------------ PROPS

    /** BFS count of reachable walkable cells from spawn (props count as solid). */
    floodCount() {
        const sx = Math.floor(this.spawn.x), sy = Math.floor(this.spawn.y);
        const seen = new Uint8Array(this.w * this.h);
        const passable = (x, y) => {
            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
            if (this.propCells.has(this.key(x, y))) return false;
            const t = this.grid[y * this.w + x];
            return t === CELL.EMPTY || t === CELL.ELEVATOR || t === CELL.DOOR || t === CELL.GATE;
        };
        if (!passable(sx, sy)) return 0;
        const q = [[sx, sy]];
        seen[sy * this.w + sx] = 1;
        let n = 1;
        while (q.length) {
            const [cx, cy] = q.pop();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (!passable(nx, ny) || seen[ny * this.w + nx]) continue;
                seen[ny * this.w + nx] = 1;
                n++;
                q.push([nx, ny]);
            }
        }
        return n;
    }

    /** Can a prop legally sit at this cell? */
    propEligible(x, y) {
        if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return false;
        if (this.grid[y * this.w + x] !== CELL.EMPTY) return false;
        if (this.propCells.has(this.key(x, y))) return false;
        if (Math.abs(x - this._sx) + Math.abs(y - this._sy) < 4) return false;
        if (this._occupied.has(this.key(x, y))) return false;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const t = this.cellRaw(x + dx, y + dy);
                if (t === CELL.DOOR || t === CELL.GATE || t === CELL.ELEVATOR) return false;
            }
        return true;
    }

    /** Place one prop with flood-fill validation. Returns true on success. */
    placeProp(x, y, type, rotY) {
        const def = PROP_BUILDERS[type];
        if (!def || !this.propEligible(x, y)) return false;
        const k = this.key(x, y);
        this.propCells.add(k);
        const after = this.floodCount();
        if (after !== this._reachable - 1) {
            this.propCells.delete(k); // would seal off a region — reject
            return false;
        }
        this._reachable = after;
        // props are static: flatten to one vertex-coloured mesh per finish (draw-call budget)
        const mesh = setShadow(bakeStatic(def.build()));
        mesh.position.set(x + 0.5, 0, y + 0.5);
        mesh.rotation.y = rotY;
        this.group.add(mesh);
        if (def.tall) this.tallProps.add(k);
        this.props.set(k, { x, y, type, def, hp: def.hp, mesh });
        return true;
    }

    /** The prop record at a cell, or null. */
    propAt(x, y) {
        return this.props.get(this.key(x, y)) || null;
    }

    /** Snapshot of props within radius of a point (safe to destroy while iterating). */
    propsInRadius(px, py, radius) {
        const out = [];
        for (const rec of this.props.values()) {
            if (Math.hypot(rec.x + 0.5 - px, rec.y + 0.5 - py) < radius) out.push(rec);
        }
        return out;
    }

    /**
     * Damage the prop at a cell. Returns null if none, else
     * { destroyed, type, x, y } with x/y at the prop's center.
     */
    damageProp(x, y, dmg) {
        const k = this.key(x, y);
        const rec = this.props.get(k);
        if (!rec) return null;
        rec.hp -= dmg;
        const info = { destroyed: false, type: rec.type, x: rec.x + 0.5, y: rec.y + 0.5 };
        if (rec.hp <= 0) {
            info.destroyed = true;
            this.group.remove(rec.mesh);
            rec.mesh.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const ms = Array.isArray(o.material) ? o.material : [o.material];
                    ms.forEach(m => { if (!m.userData.shared) m.dispose(); });
                }
            });
            this.props.delete(k);
            this.propCells.delete(k);
            this.tallProps.delete(k);
            this.propsVersion = (this.propsVersion || 0) + 1; // minimap cache bust
        }
        return info;
    }

    /** Dress each declared zone so rooms read as real places. */
    addZones() {
        const zones = this.level.zones;
        if (!zones) return;
        const rng = mulberry32(0x20E5 + this.levelIndex * 31337);
        const isWallType = (t) =>
            t >= CELL.BRICK && t !== CELL.DOOR && t !== CELL.GATE && t !== CELL.ELEVATOR;

        for (const zone of zones) {
            const r = { ...ZONE_RECIPES[zone.kind], ...zone };
            if (!r.pattern) continue;
            const [zx, zy, zw, zh] = zone.rect;
            let pi = 0;
            const nextProp = () => r.props[pi++ % r.props.length];

            if (r.pattern === 'perimeter') {
                // furniture against the walls, facing into the room
                for (let y = zy; y < zy + zh; y++)
                    for (let x = zx; x < zx + zw; x++) {
                        if (rng() >= (r.density ?? 0.6)) continue;
                        let face = null;
                        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                            if (isWallType(this.cellRaw(x + dx, y + dy))) {
                                face = Math.atan2(-dx, -dy);
                                break;
                            }
                        }
                        if (face !== null) this.placeProp(x, y, nextProp(), face);
                    }
            } else if (r.pattern === 'rows') {
                // aisle strips with walking gaps; flood-check keeps them passable
                const gap = r.gap ?? 2;
                if (zw >= zh) {
                    let strip = 0;
                    for (let x = zx; x < zx + zw; x += gap, strip++) {
                        const face = strip % 2 ? -Math.PI / 2 : Math.PI / 2;
                        for (let y = zy; y < zy + zh; y++) this.placeProp(x, y, nextProp(), face);
                    }
                } else {
                    let strip = 0;
                    for (let y = zy; y < zy + zh; y += gap, strip++) {
                        const face = strip % 2 ? 0 : Math.PI;
                        for (let x = zx; x < zx + zw; x++) this.placeProp(x, y, nextProp(), face);
                    }
                }
            } else if (r.pattern === 'line') {
                // single run down the middle of the room
                const step = r.step ?? 2;
                if (zw >= zh) {
                    const y = zy + (zh >> 1);
                    for (let x = zx; x < zx + zw; x += step) this.placeProp(x, y, nextProp(), 0);
                } else {
                    const x = zx + (zw >> 1);
                    for (let y = zy; y < zy + zh; y += step) this.placeProp(x, y, nextProp(), Math.PI / 2);
                }
            } else if (r.pattern === 'center') {
                const cx = zx + (zw >> 1), cy = zy + (zh >> 1);
                const rot = zw >= zh ? 0 : Math.PI / 2;
                if (!this.placeProp(cx, cy, r.props[0], rot))
                    this.placeProp(cx + 1, cy, r.props[0], rot);
            } else if (r.pattern === 'cluster') {
                const want = r.count ?? 6;
                let placed = 0;
                for (let tries = 0; tries < want * 4 && placed < want; tries++) {
                    const x = zx + Math.floor(rng() * zw);
                    const y = zy + Math.floor(rng() * zh);
                    if (this.placeProp(x, y, nextProp(), rng() * Math.PI * 2)) placed++;
                }
            }

            // accents: a couple of odd pieces wherever they fit
            for (const acc of r.accents || []) {
                for (let tries = 0; tries < 8; tries++) {
                    const x = zx + Math.floor(rng() * zw);
                    const y = zy + Math.floor(rng() * zh);
                    if (this.placeProp(x, y, acc, rng() * Math.PI * 2)) break;
                }
            }

            // centerpiece rug if the middle is clear
            if (r.rug) {
                const cx = zx + (zw >> 1), cy = zy + (zh >> 1);
                let clear = true;
                for (let dy = -1; dy <= 1 && clear; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        if (this.cellRaw(cx + dx, cy + dy) !== CELL.EMPTY ||
                            this.propCells.has(this.key(cx + dx, cy + dy))) { clear = false; break; }
                if (clear) {
                    const rug = buildRug(this.level.decor?.rugColor ?? 0x7a2a22);
                    rug.position.set(cx + 0.5, 0, cy + 0.5);
                    rug.rotation.y = zw >= zh ? 0 : Math.PI / 2;
                    this.group.add(rug);
                }
            }
        }
    }

    /** Scatter a few leftover props through corridors (zones come first). */
    addProps() {
        const spec = this.level.props;
        if (!spec) return;
        const rng = mulberry32(0x5EED + this.levelIndex * 7919);

        const candidates = [];
        for (let y = 1; y < this.h - 1; y++)
            for (let x = 1; x < this.w - 1; x++)
                if (this.propEligible(x, y)) candidates.push([x, y]);
        // shuffle deterministically
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const wanted = [];
        for (const [type, count] of Object.entries(spec))
            for (let i = 0; i < count; i++) wanted.push(type);

        for (const type of wanted) {
            while (candidates.length) {
                const [x, y] = candidates.pop();
                const rot = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3;
                if (this.placeProp(x, y, type, rot)) break;
            }
        }
    }

    /** Paintings on walls + rugs on open floor. Pure decor, no collision. */
    addWallDecor() {
        const decor = this.level.decor || {};
        const rng = mulberry32(0xA57 + this.levelIndex * 104729);

        if (decor.paintings) {
            // wall cells with an empty cell in front get a painting on that face
            const spots = [];
            for (let y = 1; y < this.h - 1; y++)
                for (let x = 1; x < this.w - 1; x++) {
                    const t = this.grid[y * this.w + x];
                    if (t < CELL.BRICK || t === CELL.DOOR || t === CELL.GATE || t === CELL.ELEVATOR) continue;
                    for (const [dx, dy, rotY] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
                        if (this.cellRaw(x + dx, y + dy) === CELL.EMPTY)
                            spots.push([x, y, dx, dy, rotY]);
                    }
                }
            for (let i = spots.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [spots[i], spots[j]] = [spots[j], spots[i]];
            }
            const used = new Set();
            let placed = 0;
            for (const [x, y, dx, dy, rotY] of spots) {
                if (placed >= decor.paintings) break;
                const k = this.key(x, y);
                if (used.has(k)) continue; // one painting per wall block
                used.add(k);
                const art = buildPainting(Math.floor(rng() * 3));
                art.position.set(
                    x + 0.5 + dx * 0.51,
                    WALL_HEIGHT * 0.58 + (this.H - WALL_HEIGHT) * 0.25,
                    y + 0.5 + dy * 0.51);
                art.rotation.y = rotY;
                this.group.add(art);
                placed++;
            }
        }

        if (decor.rugs) {
            // rugs need clear floor all around so they never poke through walls
            const spots = [];
            for (let y = 2; y < this.h - 2; y++)
                for (let x = 2; x < this.w - 2; x++) {
                    if (this.grid[y * this.w + x] !== CELL.EMPTY) continue;
                    let clear = true;
                    for (let dy = -1; dy <= 1 && clear; dy++)
                        for (let dx = -1; dx <= 1; dx++)
                            if (this.cellRaw(x + dx, y + dy) !== CELL.EMPTY) { clear = false; break; }
                    if (clear) spots.push([x, y]);
                }
            for (let i = spots.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [spots[i], spots[j]] = [spots[j], spots[i]];
            }
            for (let i = 0; i < Math.min(decor.rugs, spots.length); i++) {
                const [x, y] = spots[i];
                const rug = buildRug(decor.rugColor ?? 0x7a2a22);
                rug.position.set(x + 0.5, 0, y + 0.5);
                rug.rotation.y = (Math.floor(rng() * 2)) * (Math.PI / 2);
                this.group.add(rug);
            }
        }
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
            ? new THREE.BoxGeometry(1, DOOR_H, 0.14)
            : new THREE.BoxGeometry(0.14, DOOR_H, 1);
        const mesh = new THREE.Mesh(geo, surfaceMaterial('door'));
        mesh.position.set(x + 0.5, DOOR_H / 2, y + 0.5);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
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
            new THREE.BoxGeometry(1, DOOR_H, 0.1),
            surfaceMaterial('gate', { transparent: true })
        );
        mesh.position.set(x + 0.5, DOOR_H / 2, y + 0.5);
        this.group.add(mesh);
        this.gates.push({ x, y, mesh, t: 0 });
    }

    addLighting() {
        const lvl = this.level;
        const rig = getRig(this.levelIndex);
        this.rig = rig;
        this.scene.fog = new THREE.FogExp2(lvl.fogColor, lvl.fogDensity);

        // MODERN rig: low flat fill, a hemisphere for sky/ground tint, and ONE
        // shadow-casting key light. Contrast comes from the key + fixture pools.
        const amb = new THREE.AmbientLight(rig.ambient.color, rig.ambient.intensity);
        this.group.add(amb);
        const hemi = new THREE.HemisphereLight(rig.hemi.sky, rig.hemi.ground, rig.hemi.intensity);
        this.group.add(hemi);

        const key = makeKeyLight(rig, this.w, this.h, this.H);
        this.group.add(key);
        this.group.add(key.target);
        this.keyLight = key;

        // accent fixtures on the classic 9-point grid (nearest empty cell):
        // a real housing, an emissive lens, and an unshadowed point light
        const spots = [
            [this.w * 0.25, this.h * 0.25], [this.w * 0.75, this.h * 0.25],
            [this.w * 0.25, this.h * 0.75], [this.w * 0.75, this.h * 0.75],
            [this.w * 0.5, this.h * 0.5],
            [this.w * 0.5, this.h * 0.15], [this.w * 0.5, this.h * 0.85],
            [this.w * 0.12, this.h * 0.5], [this.w * 0.88, this.h * 0.5],
        ];
        // fixture housings + lenses + ceiling panels are static: build them as
        // three merged meshes (3 draw calls instead of ~70)
        const housingGeos = [], lensGeos = [];
        this.fixtureLights = [];
        for (const [sx, sy] of spots) {
            const cell = this.findEmptyNear(Math.floor(sx), Math.floor(sy));
            if (!cell) continue;
            const [cx, cy] = cell;
            const a = rig.accents;
            const light = new THREE.PointLight(a.color, a.intensity, a.distance, a.decay);
            light.position.set(cx + 0.5, this.H - 0.14, cy + 0.5);
            this.group.add(light);
            this.fixtureLights.push(light);
            const hg = new THREE.BoxGeometry(0.46, 0.06, 0.46);
            hg.translate(cx + 0.5, this.H - 0.03, cy + 0.5);
            housingGeos.push(hg);
            const lg = new THREE.BoxGeometry(0.36, 0.02, 0.36);
            lg.translate(cx + 0.5, this.H - 0.065, cy + 0.5);
            lensGeos.push(lg);
        }
        if (housingGeos.length) {
            const housing = new THREE.Mesh(
                BufferGeometryUtils.mergeGeometries(housingGeos),
                new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.6 }));
            this.group.add(housing);
            const lens = new THREE.Mesh(
                BufferGeometryUtils.mergeGeometries(lensGeos),
                new THREE.MeshStandardMaterial({
                    color: rig.fixture, emissive: rig.fixture, emissiveIntensity: 2.2, roughness: 0.3,
                }));
            this.group.add(lens);
            housingGeos.forEach(g => g.dispose()); lensGeos.forEach(g => g.dispose());
        }

        // emissive ceiling panels for visual rhythm (no light of their own;
        // bloom in M1.3 makes them glow)
        const panelGeos = [];
        for (let y = 2; y < this.h - 2; y += 4)
            for (let x = 2; x < this.w - 2; x += 4)
                if (this.grid[y * this.w + x] === CELL.EMPTY) {
                    const pg = new THREE.PlaneGeometry(0.5, 0.5);
                    pg.rotateX(Math.PI / 2);
                    pg.translate(x + 0.5, this.H - 0.01, y + 0.5);
                    panelGeos.push(pg);
                }
        if (panelGeos.length) {
            const panels = new THREE.Mesh(
                BufferGeometryUtils.mergeGeometries(panelGeos),
                new THREE.MeshStandardMaterial({
                    color: rig.panels.color, emissive: rig.panels.color,
                    emissiveIntensity: rig.panels.intensity, roughness: 0.6,
                }));
            this.group.add(panels);
            panelGeos.forEach(g => g.dispose());
        }
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
        light.position.set(cx, this.H - 0.2, cy);
        this.group.add(light);
        this.elevatorLight = light;

        const padGeo = new THREE.PlaneGeometry(1, 1);
        const padMat = new THREE.MeshStandardMaterial({
            color: 0x33ff77, emissive: 0x33ff77, emissiveIntensity: 0.9,
            transparent: true, opacity: 0.32, roughness: 0.4,
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
                    new THREE.PlaneGeometry(this.elevatorCells.length, DOOR_H),
                    surfaceMaterial('elevator')
                );
                plane.position.set(cx - dx * 0 + (dx === 0 ? 0 : 0), DOOR_H / 2, cy - dy * 0);
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

    /** Is the cell solid for movement purposes? (walls + furniture) */
    isSolidCell(x, y) {
        if (this.propCells.has(this.key(x, y))) return true;
        return this.isStructureSolid(x, y);
    }

    /** Solid for projectiles / line-of-sight. Short furniture is shot over. */
    blocksShots(x, y) {
        if (this.tallProps.has(this.key(x, y))) return true;
        return this.isStructureSolid(x, y);
    }

    isStructureSolid(x, y) {
        const t = this.cellRaw(x, y);
        if (t === CELL.EMPTY || t === CELL.ELEVATOR) return false;
        if (t === CELL.DOOR) {
            const d = this.doors.get(this.key(x, y));
            return !d || d.openT < 0.75;
        }
        if (t === CELL.GATE) return !this.gatesUnlocked;
        return true;
    }

    /** Circle vs grid collision; returns corrected position.
     *  Walls resolve as full cells; furniture as circles so you can
     *  slip past corners instead of snagging on invisible box edges. */
    collide(px, py, radius) {
        let x = px, y = py;
        const cx = Math.floor(x), cy = Math.floor(y);
        for (let gy = cy - 1; gy <= cy + 1; gy++)
            for (let gx = cx - 1; gx <= cx + 1; gx++) {
                const rec = this.props.get(this.key(gx, gy));
                if (rec) {
                    // circle-vs-circle against the prop's footprint
                    const dx = x - (gx + 0.5), dy = y - (gy + 0.5);
                    const minD = radius + rec.def.radius;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < minD * minD && d2 > 0.000001) {
                        const d = Math.sqrt(d2);
                        x += (dx / d) * (minD - d);
                        y += (dy / d) * (minD - d);
                    }
                    continue;
                }
                if (!this.isStructureSolid(gx, gy)) continue;
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
                if (d.closeTimer <= 0 && !pin && !near) {
                    d.state = 'closing';
                    playSound('door_close');
                }
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
                    g.mesh.position.y = DOOR_H / 2 - g.t * DOOR_H;
                    g.mesh.material.opacity = 1 - g.t * 0.6;
                }
            }
        }
        if (this.exterior) this.exterior.update(dt);
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
                ms.forEach(m => {
                    if (m.userData.shared) return;
                    // cloned (per-mesh repeat) textures are ours to free
                    for (const t of [m.map, m.normalMap, m.roughnessMap])
                        if (t && t.userData.clone) t.dispose();
                    m.dispose();
                });
            }
        });
        this.scene.fog = null;
    }
}
