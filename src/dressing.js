/**
 * FLOOR DRESSING — MODERN (GOAL_LOOP M5.1–M5.6)
 *
 * Per-floor set dressing on top of the classic zone recipes. Everything here
 * is visual and non-colliding: it hangs from the ceiling, sits on walls, or
 * lies flat on the floor, so the ASCII maps, prop placement, and collision
 * signatures are untouched. Static pieces are baked into a few merged meshes;
 * the handful of animated pieces (dust, conveyor, sparks, steam, screensavers)
 * are updated from World.update.
 *
 *   1 Lobby      reception sign, directory, stanchion queue, security signage,
 *                elevator indicator + call plate, brass rails, extra planters' pots
 *   2 Office     conference / manager glass (via window rects), room signs,
 *                whiteboard, wall clocks, cubicle name plates
 *   3 Archives   hanging bulbs on cords, dust motes, vault plates, banker lamps
 *   4 Showroom   track lighting, price tags on the displays, lane signs, racking
 *   5 Factory    overhead conveyor with moving parts, sparks, steam, hazard
 *                striping, wall paint vats
 *   6 Penthouse  trophy spotlights, award frames, chandeliers, designer veneer
 *                on the arena blocks
 */
import * as THREE from 'three';
import { CELL } from './config.js';
import { bakeStatic } from './bake.js';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0, ...opts });
const metal = (color, rough = 0.35) => mat(color, { roughness: rough, metalness: 0.75 });
const glow = (color, emissive, k = 1) => mat(color, { emissive, emissiveIntensity: k, roughness: 0.4 });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
const at = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); if (ry) mesh.rotation.y = ry; return mesh; };

/** canvas text on a plane (kept out of the bake: it has a map) */
function textPlane(text, { w = 1, h = 0.3, bg = '#101214', fg = '#f2f0e8', font = 'bold 48px "Arial Narrow", Arial, sans-serif', emissive = 0.0, border = null, sub = null } = {}) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 10; ctx.strokeRect(8, 8, c.width - 16, c.height - 16); }
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, sub ? c.height * 0.4 : c.height / 2);
    if (sub) { ctx.font = '28px Arial, sans-serif'; ctx.fillStyle = 'rgba(242,240,232,.7)'; ctx.fillText(sub, c.width / 2, c.height * 0.72); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? t : null, emissiveIntensity: emissive });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.userData.dressingTexture = t;
    return mesh;
}

/** a sign hanging from the ceiling on two cords, readable from both sides */
function hangingSign(group, x, z, H, text, opts = {}, ry = 0) {
    const y = H - 0.42;
    for (const dx of [-0.35, 0.35]) { const cord = cyl(0.006, 0.006, 0.28, mat(0x2a2a2e), 6); cord.position.set(x + Math.cos(ry) * dx, H - 0.14, z - Math.sin(ry) * dx); group.add(cord); }
    const frame = box(0.96, 0.32, 0.03, mat(0x1a1c20, { roughness: 0.5, metalness: 0.4 })); at(frame, x, y, z, ry); group.add(frame);
    for (const side of [1, -1]) { const p = textPlane(text, { w: 0.9, h: 0.26, ...opts }); p.position.set(x + Math.sin(ry) * 0.02 * side, y, z + Math.cos(ry) * 0.02 * side); p.rotation.y = ry + (side < 0 ? Math.PI : 0); group.add(p); }
}

/** wall-mounted plate on the face of wall cell (x,y) that looks toward (dx,dy) */
function wallPlate(group, world, x, y, dx, dy, mesh, height, proud = 0.02) {
    mesh.position.set(x + 0.5 + dx * (0.5 + proud), height, y + 0.5 + dy * (0.5 + proud));
    mesh.rotation.y = dx === 1 ? Math.PI / 2 : dx === -1 ? -Math.PI / 2 : dy === 1 ? 0 : Math.PI;
    group.add(mesh);
    return mesh;
}

const isWall = (t) => t >= CELL.BRICK && t !== CELL.DOOR && t !== CELL.GATE && t !== CELL.ELEVATOR;

// ---------------------------------------------------------------- floors

function dressLobby(w, g, anim) {
    const H = w.H;
    // reception: hanging sign over the counters, brass rails on the counter line ends
    hangingSign(g, 14, 5.5, H, 'RECEPTION', { bg: '#1c2b48', fg: '#ffd35a', border: '#c9a227', sub: 'INTERIOR DESIGN CARTEL · HQ' });
    // directory board by the entrance (left wall, facing in)
    wallPlate(g, w, 0, 2, 1, 0, textPlane('DIRECTORY', { w: 0.7, h: 0.9, bg: '#14161a', fg: '#e8e4da', font: 'bold 40px "Arial Narrow", Arial', border: '#c9a227', sub: '1 LOBBY · 2 OFFICE · 3 ARCHIVES · 4 SHOWROOM · 5 FACTORY · 6 PENTHOUSE' }), 0.95);
    // stanchion queue lanes along the security corridor (posts hug the cell edges, rope between)
    const post = metal(0xc9a227, 0.3), rope = mat(0x8b0a1a, { roughness: 0.9 });
    const line = (x0, x1, z) => { for (let x = x0; x <= x1; x += 1) { g.add(at(cyl(0.02, 0.02, 0.6, post, 8), x, 0.3, z)); g.add(at(cyl(0.05, 0.06, 0.02, post, 10), x, 0.01, z)); g.add(at(cyl(0.03, 0.03, 0.03, post, 8), x, 0.6, z)); } for (let x = x0; x < x1; x += 1) { const r = cyl(0.012, 0.012, 0.98, rope, 6); r.rotation.z = Math.PI / 2; r.position.set(x + 0.5, 0.52, z); g.add(r); } };
    line(10, 14, 16.02); line(17, 21, 16.02);
    // security signage on the checkpoint wall (row 15 wall cells facing south)
    wallPlate(g, w, 12, 15, 0, 1, textPlane('SECURITY CHECKPOINT', { w: 1.6, h: 0.3, bg: '#8b0a1a', fg: '#fff', border: '#ffd35a' }), 1.05);
    wallPlate(g, w, 19, 15, 0, 1, textPlane('STAFF ONLY BEYOND THIS POINT', { w: 1.6, h: 0.3, bg: '#14161a', fg: '#ffd35a' }), 1.05);
    // elevator lobby: floor indicator above the doors, call plate, brass rails on the lobby walls
    const [ex, ey] = w.elevatorCells[0];
    wallPlate(g, w, ex + 1, ey + 1, 0, -1, textPlane('▲ 1', { w: 0.6, h: 0.22, bg: '#0a0c10', fg: '#ff9a3a', emissive: 1.2, font: 'bold 60px Arial' }), 1.55);
    wallPlate(g, w, ex - 1, ey + 1, 0, -1, box(0.12, 0.18, 0.02, metal(0xb8b0a0, 0.3)), 0.7);
    wallPlate(g, w, ex - 1, ey + 1, 0, -1, at(cyl(0.02, 0.02, 0.015, glow(0xffd35a, 0xffb020, 1.5), 8), 0, 0, 0), 0.72, 0.035).rotation.x = Math.PI / 2;
    for (let x = 2; x < 14; x++) g.add(at(box(1, 0.03, 0.04, post), x + 0.5, 0.85, 20.98));
    for (let x = 18; x < 30; x++) g.add(at(box(1, 0.03, 0.04, post), x + 0.5, 0.85, 20.98));
    // ceiling: a brass chandelier over the lounge
    const ch = new THREE.Group(); ch.position.set(16, H - 0.5, 9);
    ch.add(cyl(0.02, 0.02, 0.5, post, 6).translateY(0.25));
    ch.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 24), post).rotateX(Math.PI / 2));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ch.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow(0xfff2c0, 0xffd080, 2)), Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45)); }
    g.add(ch);
}

function dressOffice(w, g, anim) {
    const H = w.H;
    // room signs on the corridor walls
    wallPlate(g, w, 11, 10, 0, 1, textPlane('CONFERENCE', { w: 0.9, h: 0.22, bg: '#1c2b48', fg: '#e8e4da' }), 1.15);
    wallPlate(g, w, 27, 10, 0, 1, textPlane('MANAGEMENT', { w: 0.9, h: 0.22, bg: '#1c2b48', fg: '#e8e4da' }), 1.15);
    wallPlate(g, w, 12, 15, 0, 1, textPlane('BREAK ROOM', { w: 0.9, h: 0.22, bg: '#1c2b48', fg: '#e8e4da' }), 1.15);
    wallPlate(g, w, 26, 15, 0, 1, textPlane('SUPPLY', { w: 0.9, h: 0.22, bg: '#1c2b48', fg: '#e8e4da' }), 1.15);
    wallPlate(g, w, 20, 20, 0, 1, textPlane('COPY ROOM →', { w: 0.9, h: 0.22, bg: '#1c2b48', fg: '#e8e4da' }), 1.15);
    // whiteboard in the conference room (north wall inside), wall clock
    wallPlate(g, w, 11, 5, 0, 1, textPlane('Q3: MORE PARTICLE BOARD', { w: 1.5, h: 0.8, bg: '#f4f2ec', fg: '#2a4a8a', font: 'bold 34px "Comic Sans MS", Arial', border: '#8a8a8a', sub: '→ eliminate "durability" ← (Sandy??)' }), 0.95);
    const clock = (x, y, dx, dy) => { const c = new THREE.Group(); c.add(cyl(0.16, 0.16, 0.02, mat(0xf0ece0), 20).rotateX(Math.PI / 2)); c.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 20), mat(0x2a2a2e))); c.add(at(box(0.01, 0.11, 0.005, mat(0x111111)), 0, 0.05, 0.012)); c.add(at(box(0.01, 0.07, 0.005, mat(0x111111)), 0.02, 0.03, 0.012).rotateZ(-1.2)); wallPlate(g, w, x, y, dx, dy, c, 1.3); };
    clock(20, 0, 0, 1); clock(0, 12, 1, 0);
    // cubicle name plates on the north walls of the desk rows
    const names = ['GARY', 'PAM', 'DWAYNE', 'LINDA', 'STERLING', 'MEL'];
    for (let i = 0; i < 6; i++) wallPlate(g, w, 5 + i * 6, 0, 0, 1, textPlane(names[i], { w: 0.4, h: 0.12, bg: '#3a3f46', fg: '#e8e4da', font: 'bold 44px Arial' }), 0.75);
    // motivational poster
    wallPlate(g, w, 39, 3, -1, 0, textPlane('SYNERGY', { w: 0.8, h: 1.0, bg: '#0a1a30', fg: '#ffd35a', border: '#3a8ae6', sub: 'it is not a table, it is a lifestyle surface' }), 0.95);
}

function dressArchives(w, g, anim) {
    const H = w.H;
    // hanging bulbs on cords along the two corridors, every 4 cells
    for (const z of [9.5, 19.5]) for (let x = 4; x < w.w - 2; x += 4) {
        g.add(at(cyl(0.005, 0.005, 0.3, mat(0x1a1a1e), 5), x + 0.5, H - 0.15, z));
        g.add(at(cyl(0.05, 0.08, 0.05, metal(0x3a3a3c, 0.5), 10), x + 0.5, H - 0.32, z));
        g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow(0xffd8a0, 0xffb060, 2.2)), x + 0.5, H - 0.37, z));
    }
    // vault plates beside the vault doors, silence sign
    wallPlate(g, w, 11, 4, 1, 0, textPlane('RECORDS VAULT A', { w: 0.9, h: 0.2, bg: '#2a2a2e', fg: '#c9a227', border: '#c9a227' }), 1.0);
    wallPlate(g, w, 28, 4, -1, 0, textPlane('RECORDS VAULT B', { w: 0.9, h: 0.2, bg: '#2a2a2e', fg: '#c9a227', border: '#c9a227' }), 1.0);
    wallPlate(g, w, 20, 11, 0, -1, textPlane('ARCHIVES · SILENCE', { w: 1.2, h: 0.24, bg: '#2a2a2e', fg: '#e8e4da' }), 1.1);
    wallPlate(g, w, 0, 9, 1, 0, textPlane('WARRANTY CLAIMS 1987–199X', { w: 1.3, h: 0.24, bg: '#14161a', fg: '#e8e4da' }), 1.0);
    // banker lamps on the reading-room tables (table cells known from the zone recipes: centre of the readingRoom rects)
    for (const [x, z] of [[17.5, 14.5], [19.5, 24.5]]) {
        const lamp = new THREE.Group(); lamp.position.set(x, 0.45, z);
        lamp.add(cyl(0.05, 0.06, 0.02, metal(0xc9a227, 0.3), 10).translateY(0.01));
        lamp.add(cyl(0.01, 0.01, 0.16, metal(0xc9a227, 0.3), 6).translateY(0.09));
        const shade = at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.08, 10, 1, true), glow(0x1f5a28, 0x2a8a3a, 1.2)), 0, 0.2, 0.03); shade.material.side = THREE.DoubleSide; lamp.add(shade);
        g.add(lamp);
    }
    // dust motes drifting in the corridors (animated)
    const n = 900, pos = new Float32Array(n * 3), vel = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = 1 + Math.random() * (w.w - 2); pos[i * 3 + 1] = 0.1 + Math.random() * (H - 0.2); pos[i * 3 + 2] = 1 + Math.random() * (w.h - 2); vel[i] = 0.01 + Math.random() * 0.03; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8c8a0, size: 0.018, transparent: true, opacity: 0.35, depthWrite: false }));
    dust.frustumCulled = false;
    anim.push({ mesh: dust, update: (dt, t) => { const a = geo.attributes.position; for (let i = 0; i < n; i++) { a.array[i * 3 + 1] -= vel[i] * dt; a.array[i * 3] += Math.sin(t * 0.3 + i) * 0.004 * dt; if (a.array[i * 3 + 1] < 0.05) a.array[i * 3 + 1] = H - 0.1; } a.needsUpdate = true; } });
}

function dressShowroom(w, g, anim) {
    const H = w.H;
    // track lighting rails with spot heads over the vignette pods and the gallery
    const rail = metal(0x2a2d33, 0.5), head = metal(0x3a3d43, 0.4);
    for (const z of [2.5, 9.5, 14.5]) {
        g.add(at(box(w.w - 4, 0.04, 0.05, rail), w.w / 2, H - 0.06, z));
        for (let x = 4; x < w.w - 3; x += 3) { const h = at(cyl(0.05, 0.07, 0.12, head, 10), x + 0.5, H - 0.16, z); h.rotation.x = 0.35; g.add(h); g.add(at(cyl(0.045, 0.045, 0.01, glow(0xfff0d6, 0xffe0b0, 2.5), 10), x + 0.5, H - 0.22, z + 0.04)); }
    }
    // price tags floating over props inside the vignette / checkout rects (visual only)
    const rects = (w.level.zones || []).filter(z => z.kind === 'vignette').map(z => z.rect);
    const prices = ['$19.99', '$249', '$4.50', '$1,299', 'CLEARANCE', '$0.99*', '$799'];
    let i = 0;
    for (const rec of w.props.values()) {
        if (!rects.some(([rx, ry, rw, rh]) => rec.x >= rx && rec.x < rx + rw && rec.y >= ry && rec.y < ry + rh)) continue;
        const tag = textPlane(prices[i++ % prices.length], { w: 0.28, h: 0.16, bg: '#fff4d0', fg: '#8b0a1a', font: 'bold 52px Arial', border: '#c9a227' });
        tag.position.set(rec.x + 0.5 + 0.28, rec.def.height + 0.12, rec.y + 0.5); tag.rotation.y = -0.3;
        g.add(tag);
        const stick = cyl(0.004, 0.004, 0.2, mat(0x2a2a2e), 5); stick.position.set(rec.x + 0.5 + 0.28, rec.def.height + 0.02, rec.y + 0.5); g.add(stick);
    }
    // checkout lane signs hanging over the counters
    for (let lane = 0; lane < 4; lane++) hangingSign(g, 8 + lane * 8, 22, H, `LANE ${lane + 1}`, { bg: '#1c2b48', fg: '#ffd35a', border: '#c9a227', sub: 'FLAT-PACK EXPRESS' });
    // flat-pack racking frames over the pallet rows (posts at cell corners, shelf above head height)
    const post = metal(0x3a5a8a, 0.5);
    for (const rec of w.props.values()) {
        if (rec.type !== 'pallet') continue;
        for (const [dx, dz] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]]) g.add(at(box(0.05, 1.7, 0.05, post), rec.x + dx, 0.85, rec.y + dz));
        g.add(at(box(1.0, 0.04, 1.0, mat(0x9a7a4a, { roughness: 0.9 })), rec.x + 0.5, 1.65, rec.y + 0.5));
        g.add(at(box(0.7, 0.3, 0.6, mat(0xc8b088, { roughness: 0.9 })), rec.x + 0.5, 1.83, rec.y + 0.5, 0.2));
    }
    // showroom slogans
    wallPlate(g, w, 20, 0, 0, 1, textPlane('FAST FURNITURE · FASTER LIVING', { w: 2.2, h: 0.32, bg: '#8b0a1a', fg: '#fff4d0', border: '#ffd35a' }), 1.45);
    wallPlate(g, w, 0, 14, 1, 0, textPlane('ASSEMBLY REQUIRED*', { w: 1.2, h: 0.24, bg: '#fff4d0', fg: '#8b0a1a', sub: '*allen key sold separately' }), 1.1);
}

function dressFactory(w, g, anim) {
    const H = w.H;
    // overhead conveyor: rail across the assembly band with hanging chair/table parts that travel (animated)
    const rail = metal(0x3a4048, 0.5);
    g.add(at(box(w.w - 4, 0.06, 0.12, rail), w.w / 2, H - 0.32, 8.5));
    for (let x = 4; x < w.w - 3; x += 4) g.add(at(box(0.06, 0.32, 0.06, rail), x + 0.5, H - 0.16, 8.5));
    const hangers = new THREE.Group();
    const partMats = [mat(0x9a7442), mat(0x8a5a2c), mat(0xb8a888)];
    for (let i = 0; i < 9; i++) {
        const h = new THREE.Group();
        h.add(cyl(0.008, 0.008, 0.35, mat(0x1a1a1e), 5).translateY(-0.17));
        h.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12), metal(0x8a929c, 0.4)), 0, -0.36, 0));
        const kind = i % 3;
        if (kind === 0) h.add(at(box(0.05, 0.4, 0.05, partMats[0]), 0, -0.62, 0));
        else if (kind === 1) h.add(at(box(0.5, 0.04, 0.3, partMats[1]), 0, -0.5, 0).rotateZ(0.2));
        else h.add(at(box(0.3, 0.3, 0.03, partMats[2]), 0, -0.55, 0));
        h.userData.offset = i * ((w.w - 6) / 9);
        hangers.add(h);
    }
    hangers.position.set(0, H - 0.35, 8.5);
    anim.push({ mesh: hangers, update: (dt, t) => { for (const h of hangers.children) { h.position.x = 3 + ((h.userData.offset + t * 0.5) % (w.w - 6)); h.rotation.y = Math.sin(t + h.userData.offset) * 0.15; } } });
    // hazard striping along the assembly band edges (floor decals)
    const stripe = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const ctx = c.getContext('2d'); ctx.fillStyle = '#c9a227'; ctx.fillRect(0, 0, 256, 32); ctx.fillStyle = '#111'; for (let x = -32; x < 256; x += 48) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 24, 32); ctx.lineTo(x + 48, 0); ctx.lineTo(x + 24, 0); ctx.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set((w.w - 4) / 2, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const z of [7.08, 9.92]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w.w - 4, 0.16), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 })); s.rotation.x = -Math.PI / 2; s.position.set(w.w / 2, 0.006, z); g.add(s); }
    // wall paint vats with pipes on the paint-stock wall (row 11 wall, facing south)
    const vatCols = [0x2a6acc, 0xcc3322, 0x2d7a35, 0xc9a227];
    vatCols.forEach((col, i) => {
        // wall-mounted tanks above head height (bottom at 1.25) so the walkway stays clear
        const x = 6 + i * 4, z = 12 + 0.2;
        g.add(at(cyl(0.19, 0.19, 0.55, metal(0x55606a, 0.45), 14), x + 0.5, 1.55, z));
        g.add(at(cyl(0.2, 0.2, 0.05, mat(col, { roughness: 0.5 }), 14), x + 0.5, 1.3, z));
        g.add(at(box(0.5, 0.04, 0.3, metal(0x3c454e, 0.5)), x + 0.5, 1.27, z - 0.06)); // bracket
        g.add(at(cyl(0.03, 0.03, 0.42, metal(0x3c454e, 0.5), 8), x + 0.5, 2.03, z)); // feed pipe up to the ceiling
        g.add(at(textPlane(['BLUE', 'RED', 'GREEN', 'GOLD'][i], { w: 0.3, h: 0.1, bg: '#111', fg: '#e8e4da', font: 'bold 44px Arial' }), x + 0.5, 1.55, z + 0.2));
    });
    // sparks + steam at the machines (animated bursts via callbacks)
    const machines = [...w.props.values()].filter(r => r.type === 'machine').map(r => ({ x: r.x + 0.5, z: r.y + 0.5, next: Math.random() * 2 }));
    anim.push({ mesh: null, update: (dt, t, fx) => { for (const m of machines) { m.next -= dt; if (m.next <= 0) { m.next = 1.5 + Math.random() * 3; if (fx) { if (Math.random() < 0.6) fx.burst(new THREE.Vector3(m.x + 0.2, 0.7, m.z + 0.3), new THREE.Color(0xffe9a0), 14, 2.6, 0.35, { additive: true, size: 0.03, gravity: 9 }); else fx.burst(new THREE.Vector3(m.x + 0.22, 1.32, m.z - 0.1), new THREE.Color(0xd8dce0), 8, 0.35, 1.6, { size: 0.12, gravity: -0.35, drag: 0.6 }); } } } } });
    // signage
    wallPlate(g, w, 24, 0, 0, 1, textPlane('ASSEMBLY LINE 3 · 0 DAYS SINCE LAST SPLINTER', { w: 2.6, h: 0.3, bg: '#14161a', fg: '#ffd35a', border: '#c9a227' }), 1.6);
    wallPlate(g, w, 0, 20, 1, 0, textPlane('LUMBER YARD', { w: 1.0, h: 0.24, bg: '#c9a227', fg: '#111' }), 1.2);
}

function dressPenthouse(w, g, anim) {
    const H = w.H;
    // trophy spotlights over the gallery statues, award frames on the gallery walls
    for (const rec of w.props.values()) {
        if (rec.type !== 'statue') continue;
        g.add(at(cyl(0.05, 0.07, 0.12, metal(0x2a2d33, 0.4), 10), rec.x + 0.5, H - 0.1, rec.y + 0.5));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, H - 0.9, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false }));
        cone.position.set(rec.x + 0.5, (H - 0.16 + 0.85) / 2, rec.y + 0.5); cone.rotation.x = Math.PI; g.add(cone);
    }
    const awards = ['CARTEL DESIGN AWARD 199X', 'BEST IN SHOW · PARTICLE BOARD', 'EMPLOYEE OF THE DECADE', 'ZERO DURABILITY INITIATIVE'];
    awards.forEach((a, i) => wallPlate(g, w, 4 + i * 8, 0, 0, 1, textPlane(a, { w: 1.1, h: 0.5, bg: '#2a1a1c', fg: '#ffd35a', border: '#c9a227', font: 'bold 36px "Arial Narrow", Arial', sub: 'presented to THE HEAD DESIGNER' }), 1.25));
    // chandeliers over the arena
    const gold = metal(0xc9a227, 0.3);
    for (const [x, z] of [[15.5, 11.5], [15.5, 17.5]]) {
        const ch = new THREE.Group(); ch.position.set(x, H - 0.55, z);
        ch.add(cyl(0.02, 0.02, 0.55, gold, 6).translateY(0.27));
        for (const r of [0.55, 0.3]) ch.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 28), gold).rotateX(Math.PI / 2).translateZ(r > 0.4 ? 0 : -0.12));
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ch.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow(0xffe0c0, 0xff8060, 2)), Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55)); }
        g.add(ch);
    }
    // designer veneer on the arena cover blocks (the 'C' cells): marble cap + gold trim + a plaque
    const capM = mat(0xe8e2d4, { roughness: 0.15 }), trim = gold;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
        if (w.cellRaw(x, y) !== CELL.CONCRETE) continue;
        g.add(at(box(1.06, 0.05, 1.06, capM), x + 0.5, 1.0, y + 0.5));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isWall(w.cellRaw(x + dx, y + dy))) {
            const band = box(dy ? 1.04 : 0.03, 0.05, dx ? 1.04 : 0.03, trim); band.position.set(x + 0.5 + dx * 0.515, 0.55, y + 0.5 + dy * 0.515); g.add(band);
            const panel = box(dy ? 0.9 : 0.02, 0.6, dx ? 0.9 : 0.02, mat(0x3a1a1c, { roughness: 0.35 })); panel.position.set(x + 0.5 + dx * 0.512, 0.62, y + 0.5 + dy * 0.512); g.add(panel);
        }
    }
    wallPlate(g, w, 15, 7, 0, 1, textPlane('THE HEAD DESIGNER WILL SEE YOU NOW', { w: 2.4, h: 0.3, bg: '#2a1a1c', fg: '#ffd35a', border: '#c9a227' }), 1.5);
}

const DRESSERS = [dressLobby, dressOffice, dressArchives, dressShowroom, dressFactory, dressPenthouse];

/**
 * Dress a built world. Returns { group, update(dt, time, effects) }.
 * Static pieces are baked; textured signs and animated pieces stay live.
 */
export function dressFloor(world) {
    const fn = DRESSERS[world.levelIndex];
    const raw = new THREE.Group();
    const anim = [];
    if (fn) fn(world, raw, anim);
    // split: meshes with maps (signs) stay as-is, the rest bake into a few meshes
    const live = new THREE.Group();
    raw.updateMatrixWorld(true);
    raw.traverse(o => { if (o.isMesh && (o.material.map || o.material.transparent)) { const c = o.clone(); c.matrix.copy(o.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale); live.add(c); } });
    const baked = bakeStatic(raw, { quantize: 0.25 });
    baked.traverse(o => { if (o.isMesh) { if (o.userData.cloneOf) o.visible = false; o.castShadow = !o.userData.cloneOf; o.receiveShadow = true; } });
    const group = new THREE.Group();
    group.add(baked, live);
    for (const a of anim) if (a.mesh) group.add(a.mesh);
    let meshes = 0; group.traverse(o => { if (o.isMesh && o.visible) meshes++; });
    group.userData.meshes = meshes;
    return {
        group,
        update(dt, time, effects) { for (const a of anim) a.update(dt, time, effects); },
        dispose() { raw.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.shared) { o.material.dispose(); if (o.userData.dressingTexture) o.userData.dressingTexture.dispose(); } }); baked.traverse(o => { if (o.isMesh && !o.userData.cloneOf) { o.geometry.dispose(); if (!o.material.userData.shared) o.material.dispose(); } }); },
    };
}
