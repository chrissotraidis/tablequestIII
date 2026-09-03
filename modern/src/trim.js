/**
 * ARCHITECTURAL TRIM — MODERN (GOAL_LOOP M1.4)
 *
 * The classic world is unit cubes on a plane. This module reads the finished
 * grid and adds the architecture a mid-2000s engine would have: baseboards,
 * crown/ceiling trim, door jambs and headers, ceiling beams, and an elevator
 * vestibule frame. Everything is purely visual — strips sit inside the
 * 0.26-unit player radius that already keeps Sandy off the walls, so the
 * collision grid is untouched (verified by tools/collision_sig.mjs).
 *
 * All pieces of one finish are merged into a single mesh (draw-call budget).
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL } from './config.js';

const BASE_H = 0.075, BASE_D = 0.03;      // baseboard height / proudness
const CROWN_H = 0.09, CROWN_D = 0.045;    // crown height / proudness
const JAMB_W = 0.09, JAMB_D = 0.26;       // door jamb width / depth (straddles the panel)
const HEADER_H = 0.1;
const BEAM = 0.16;

function box(w, h, d, x, y, z, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
}

function merged(geos, material, { cast = true, receive = true } = {}) {
    if (!geos.length) return null;
    const g = BufferGeometryUtils.mergeGeometries(geos, false);
    geos.forEach(x => x.dispose());
    const m = new THREE.Mesh(g, material);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
}

const walkable = (t) => t === CELL.EMPTY || t === CELL.ELEVATOR;
const isWall = (t) => t >= CELL.BRICK && t !== CELL.DOOR && t !== CELL.GATE && t !== CELL.ELEVATOR;

/**
 * @param world  a built World (grid, w, h, doors, gates, elevatorCells)
 * @param H      ceiling height for this floor
 * @param doorH  door/gate panel height (classic WALL_HEIGHT)
 * @param style  rig.trim: { base, crown, frame, beams:boolean, beamColor, metalFrames:boolean }
 */
export function buildTrim(world, H, doorH, style) {
    const group = new THREE.Group();
    const baseGeos = [], crownGeos = [], frameGeos = [], beamGeos = [];
    const cell = (x, y) => world.cellRaw(x, y);

    // 1. baseboards + crown on every wall face that looks onto a walkable cell
    for (let y = 0; y < world.h; y++)
        for (let x = 0; x < world.w; x++) {
            if (!isWall(cell(x, y))) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!walkable(cell(x + dx, y + dy))) continue;
                const fx = x + 0.5 + dx * (0.5 + BASE_D / 2);
                const fz = y + 0.5 + dy * (0.5 + BASE_D / 2);
                const alongX = dy !== 0; // face runs along X when the neighbour is in Z
                baseGeos.push(alongX
                    ? box(1 + BASE_D * 2, BASE_H, BASE_D, fx, BASE_H / 2, fz)
                    : box(BASE_D, BASE_H, 1 + BASE_D * 2, fx, BASE_H / 2, fz));
                const cx = x + 0.5 + dx * (0.5 + CROWN_D / 2);
                const cz = y + 0.5 + dy * (0.5 + CROWN_D / 2);
                crownGeos.push(alongX
                    ? box(1 + CROWN_D * 2, CROWN_H, CROWN_D, cx, H - CROWN_H / 2, cz)
                    : box(CROWN_D, CROWN_H, 1 + CROWN_D * 2, cx, H - CROWN_H / 2, cz));
            }
        }

    // 2. door jambs + header (panel spans X when walls sit left/right)
    for (const d of world.doors.values()) {
        const cx = d.x + 0.5, cz = d.y + 0.5;
        if (d.spanX) {
            frameGeos.push(box(JAMB_W, doorH, JAMB_D, d.x + JAMB_W / 2, doorH / 2, cz));
            frameGeos.push(box(JAMB_W, doorH, JAMB_D, d.x + 1 - JAMB_W / 2, doorH / 2, cz));
            frameGeos.push(box(1, HEADER_H, JAMB_D, cx, doorH - HEADER_H / 2, cz));
        } else {
            frameGeos.push(box(JAMB_D, doorH, JAMB_W, cx, doorH / 2, d.y + JAMB_W / 2));
            frameGeos.push(box(JAMB_D, doorH, JAMB_W, cx, doorH / 2, d.y + 1 - JAMB_W / 2));
            frameGeos.push(box(JAMB_D, HEADER_H, 1, cx, doorH - HEADER_H / 2, cz));
        }
    }
    // gates get a heavier header (they sink, so no jambs in the way)
    for (const g of world.gates) {
        const spanX = isWall(cell(g.x - 1, g.y)) && isWall(cell(g.x + 1, g.y));
        frameGeos.push(spanX
            ? box(1, HEADER_H * 1.4, 0.22, g.x + 0.5, doorH - HEADER_H * 0.7, g.y + 0.5)
            : box(0.22, HEADER_H * 1.4, 1, g.x + 0.5, doorH - HEADER_H * 0.7, g.y + 0.5));
    }

    // 3. elevator vestibule: frame + indicator plate on the elevator wall face
    if (world.elevatorCells.length) {
        const [ex, ey] = world.elevatorCells[0];
        let cx = 0, cz = 0;
        for (const [x, y] of world.elevatorCells) { cx += x + 0.5; cz += y + 0.5; }
        cx /= world.elevatorCells.length; cz /= world.elevatorCells.length;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            if (!isWall(cell(ex + dx, ey + dy))) continue;
            const n = world.elevatorCells.length;
            const proud = 0.06;
            const fx = dx !== 0 ? (ex + dx) + (dx > 0 ? -proud / 2 : 1 + proud / 2) : cx;
            const fz = dy !== 0 ? (ey + dy) + (dy > 0 ? -proud / 2 : 1 + proud / 2) : cz;
            const alongX = dy !== 0;
            const W = n + 0.24;
            // jambs
            frameGeos.push(alongX
                ? box(0.12, doorH + 0.12, proud, fx - W / 2 + 0.06, (doorH + 0.12) / 2, fz)
                : box(proud, doorH + 0.12, 0.12, fx, (doorH + 0.12) / 2, fz - W / 2 + 0.06));
            frameGeos.push(alongX
                ? box(0.12, doorH + 0.12, proud, fx + W / 2 - 0.06, (doorH + 0.12) / 2, fz)
                : box(proud, doorH + 0.12, 0.12, fx, (doorH + 0.12) / 2, fz + W / 2 - 0.06));
            // header + indicator plate
            frameGeos.push(alongX
                ? box(W, 0.12, proud, fx, doorH + 0.06, fz)
                : box(proud, 0.12, W, fx, doorH + 0.06, fz));
            break;
        }
    }

    // 4. ceiling beams every 4 cells across the longer axis (industrial floors)
    if (style.beams) {
        const alongX = world.w >= world.h;
        const n = alongX ? world.h : world.w;
        for (let i = 2; i < n - 1; i += 4) {
            beamGeos.push(alongX
                ? box(world.w, BEAM, BEAM, world.w / 2, H - BEAM / 2, i + 0.5)
                : box(BEAM, BEAM, world.h, i + 0.5, H - BEAM / 2, world.h / 2));
        }
    }

    const baseMat = new THREE.MeshStandardMaterial({ color: style.base, roughness: 0.55, metalness: style.metalFrames ? 0.5 : 0.05 });
    const crownMat = new THREE.MeshStandardMaterial({ color: style.crown, roughness: 0.6, metalness: style.metalFrames ? 0.5 : 0.05 });
    const frameMat = new THREE.MeshStandardMaterial({ color: style.frame, roughness: 0.45, metalness: style.metalFrames ? 0.7 : 0.1 });
    const beamMat = new THREE.MeshStandardMaterial({ color: style.beamColor || style.frame, roughness: 0.6, metalness: style.metalFrames ? 0.6 : 0.05 });

    for (const m of [
        merged(baseGeos, baseMat, { cast: false }),
        merged(crownGeos, crownMat, { cast: false, receive: false }),
        merged(frameGeos, frameMat),
        merged(beamGeos, beamMat),
    ]) if (m) group.add(m);
    return group;
}
