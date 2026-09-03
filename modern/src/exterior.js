/**
 * EXTERIOR + WINDOWS — MODERN (GOAL_LOOP M1.5)
 *
 * Windows: chosen wall cells (boundary runs or a whole wall type) are drawn
 * as a thin glass pane with mullions instead of an opaque box. The cell is
 * still a wall in the grid, so movement, line of sight, and AI are untouched.
 *
 * Exterior: what you see through the glass. All procedural, all cheap:
 *   - sky dome: gradient + stars canvas on a back-faced sphere (fog off)
 *   - city ring: merged boxes outside the map with an emissive lit-window
 *     texture; 'skyline-below' sinks them so the Penthouse looks down on them
 *   - ground: a dark plane at the exterior's street level
 *   - rain (optional): a scrolling streak texture on the glass alpha
 */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- textures

let skyTex = null, cityTex = null, rainTex = null;

function makeSkyTexture(top = '#05070f', horizon = '#2a2438', glow = '#4a3a2a') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, top); g.addColorStop(0.55, horizon); g.addColorStop(0.62, glow); g.addColorStop(0.7, horizon); g.addColorStop(1, top);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    const rng = mulberry32(0x5417);
    for (let i = 0; i < 260; i++) {
        const x = rng() * 512, y = rng() * 280, r = rng() < 0.9 ? 0.7 : 1.4;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.6})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
}

function makeCityTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, 256, 512);
    const rng = mulberry32(0xC17);
    for (let y = 8; y < 512; y += 16)
        for (let x = 6; x < 256; x += 14) {
            const on = rng();
            if (on < 0.45) continue;
            const warm = rng() < 0.7;
            ctx.fillStyle = warm ? `rgba(255,${200 + rng() * 40 | 0},${120 + rng() * 60 | 0},${0.5 + rng() * 0.5})`
                : `rgba(${150 + rng() * 60 | 0},${200 + rng() * 40 | 0},255,${0.4 + rng() * 0.5})`;
            ctx.fillRect(x, y, 8, 10);
        }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

function makeRainTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 512);
    const rng = mulberry32(0x9A1);
    for (let i = 0; i < 160; i++) {
        const x = rng() * 256, y = rng() * 512, l = 10 + rng() * 40;
        const g = ctx.createLinearGradient(x, y, x, y + l);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, `rgba(255,255,255,${0.35 + rng() * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 0.8 + rng() * 1.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + l); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

// ---------------------------------------------------------------- glass

let glassMat = null, mullionMat = null;

export function getGlassMaterial() {
    if (!glassMat) {
        // glass has almost no diffuse: a dark tint keeps the key light from
        // washing the pane, roughness/env give it the sheen
        glassMat = new THREE.MeshStandardMaterial({
            color: 0x18242e, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.15,
            envMapIntensity: 0.4, depthWrite: false, side: THREE.FrontSide,
        });
    }
    return glassMat;
}

/**
 * Build glass panes + mullions for a list of window cells.
 * cells: [{ x, y, y0, y1, axis: 'x'|'z' }]  — axis is the direction the pane runs along
 */
export function buildWindows(cells, style = {}) {
    const paneGeos = [], railGeos = [];
    const T = 0.06, M = 0.05;
    for (const c of cells) {
        const h = c.y1 - c.y0, cy = (c.y0 + c.y1) / 2;
        const cx = c.x + 0.5, cz = c.y + 0.5;
        const pane = c.axis === 'x' ? new THREE.BoxGeometry(1, h, T) : new THREE.BoxGeometry(T, h, 1);
        pane.translate(cx, cy, cz);
        paneGeos.push(pane);
        // mullions: two posts + top/bottom rails (+ a mid rail on tall panes)
        const post = (px, pz) => { const g = new THREE.BoxGeometry(M, h, M + T); g.translate(px, cy, pz); railGeos.push(g); };
        if (c.axis === 'x') { post(c.x + M / 2, cz); post(c.x + 1 - M / 2, cz); }
        else { post(cx, c.y + M / 2); post(cx, c.y + 1 - M / 2); }
        const rail = (ry) => {
            const g = c.axis === 'x' ? new THREE.BoxGeometry(1, M, M + T) : new THREE.BoxGeometry(M + T, M, 1);
            g.translate(cx, ry, cz); railGeos.push(g);
        };
        rail(c.y0 + M / 2); rail(c.y1 - M / 2);
        if (h > 1.2) rail(c.y0 + h * 0.62);
    }
    const group = new THREE.Group();
    if (paneGeos.length) {
        const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(paneGeos, false), getGlassMaterial());
        m.castShadow = false; m.receiveShadow = false; m.renderOrder = 5;
        paneGeos.forEach(g => g.dispose());
        group.add(m);
        group.userData.pane = m;
    }
    if (railGeos.length) {
        mullionMat = mullionMat || new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.7 });
        const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(railGeos, false), style.mullion ? new THREE.MeshStandardMaterial({ color: style.mullion, roughness: 0.5, metalness: 0.6 }) : mullionMat);
        m.castShadow = true; m.receiveShadow = true;
        railGeos.forEach(g => g.dispose());
        group.add(m);
    }
    return group;
}

// ---------------------------------------------------------------- exterior

/**
 * @param w,h   map size in cells
 * @param spec  { kind: 'street'|'city'|'industrial'|'skyline-below', rain?: bool, seed? }
 * Returns a Group (add to the world group) with an `update(dt)` for rain.
 */
export function buildExterior(w, h, spec) {
    const group = new THREE.Group();
    const rng = mulberry32(spec.seed ?? 0xE71);
    const cx = w / 2, cz = h / 2;

    // sky dome (fog off so it stays crisp at any distance)
    skyTex = skyTex || makeSkyTexture();
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(72, 24, 12), // inside the camera's 80-unit far plane
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false }));
    sky.position.set(cx, 0, cz);
    group.add(sky);

    // exterior ground level
    const below = spec.kind === 'skyline-below';
    const groundY = below ? -38 : -0.02;
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({ color: below ? 0x0a0b10 : 0x14151a, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, groundY, cz);
    ground.receiveShadow = false;
    group.add(ground);

    // city ring: boxes with lit windows, kept clear of the map by a margin
    cityTex = cityTex || makeCityTexture();
    const geos = [];
    const margin = spec.kind === 'industrial' ? 4 : 3;
    const count = spec.kind === 'industrial' ? 26 : 44;
    for (let i = 0; i < count; i++) {
        // pick a side, then a spot along it outside the margin
        const side = Math.floor(rng() * 4);
        const along = rng();
        const dist = margin + rng() * 26;
        let x, z;
        if (side === 0) { x = -dist; z = along * (h + 40) - 20; }
        else if (side === 1) { x = w + dist; z = along * (h + 40) - 20; }
        else if (side === 2) { z = -dist; x = along * (w + 40) - 20; }
        else { z = h + dist; x = along * (w + 40) - 20; }
        const bw = 2 + rng() * 5, bd = 2 + rng() * 5;
        let bh, by;
        if (below) { bh = 12 + rng() * 30; by = groundY + bh / 2; } // tops from -26 up to ~+4: towers climb toward the floor line
        else if (spec.kind === 'industrial') { bh = 2 + rng() * 6; by = bh / 2; }
        else { bh = 4 + rng() * 22; by = bh / 2; }
        const g = new THREE.BoxGeometry(bw, bh, bd);
        // scale UVs so window rows stay a constant size
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * bw * 0.9, uv.getY(k) * bh * 0.9);
        g.translate(x, by, z);
        geos.push(g);
    }
    if (geos.length) {
        const city = new THREE.Mesh(
            BufferGeometryUtils.mergeGeometries(geos, false),
            new THREE.MeshStandardMaterial({
                map: cityTex, color: 0x30343c, emissiveMap: cityTex, emissive: 0xffffff, emissiveIntensity: 1.1,
                roughness: 0.8,
            }));
        geos.forEach(g => g.dispose());
        group.add(city);
    }

    // street lamps for the ground-level fictions: small emissive heads
    if (!below) {
        const lampGeos = [];
        for (let i = 0; i < 10; i++) {
            const side = Math.floor(rng() * 4);
            const along = rng() * (side < 2 ? h : w);
            const d = 1.5 + rng() * 2;
            const x = side === 0 ? -d : side === 1 ? w + d : along;
            const z = side === 2 ? -d : side === 3 ? h + d : along;
            const g = new THREE.BoxGeometry(0.25, 0.12, 0.25); g.translate(x, 2.4, z); lampGeos.push(g);
        }
        const lamps = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(lampGeos, false),
            new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffd080, emissiveIntensity: 2.5 }));
        lampGeos.forEach(g => g.dispose());
        group.add(lamps);
    }

    // rain: streak texture scrolled over the glass alpha
    let rainMat = null;
    if (spec.rain) {
        rainTex = rainTex || makeRainTexture();
        rainMat = getGlassMaterial().clone();
        rainMat.alphaMap = rainTex;
        rainMat.opacity = 0.85;
        rainMat.envMapIntensity = 0.3;
        rainMat.color.set(0x8fa4b8);
        rainMat.userData.shared = false;
        group.userData.rainMat = rainMat;
    }

    group.update = (dt) => {
        if (rainMat) { rainTex.offset.y -= dt * 0.35; rainTex.offset.x += dt * 0.01; }
    };
    return group;
}
