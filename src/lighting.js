/**
 * LIGHTING RIGS — MODERN (GOAL_LOOP M1.2)
 *
 * One rig per floor, indexed like LEVELS. Each rig has:
 *   key     — the single shadow-casting directional light: a skylight, a
 *             window bank, or the overhead rail, depending on the fiction.
 *             `dir` is where the light comes FROM (x, y, z), normalised here.
 *   ambient — colour/intensity of the flat fill (kept low: contrast is the point)
 *   hemi    — sky/ground hemisphere fill
 *   accents — ceiling fixtures: count, colour, intensity, range. Spots are
 *             spread on the classic 9-point grid so rooms light the same way
 *             they always did, just with less wash and more pool.
 *   fixture — how the ceiling fixture geometry looks (emissive colour)
 *   panels  — emissive ceiling panels: colour + intensity (bloom picks these up)
 *   exposure— per-floor tone-mapping exposure
 *   grade   — post-processing grade (see postfx.js DEFAULT_GRADE for keys)
 *   height  — ceiling height for the floor (classic is 1.35 everywhere)
 *   trim    — architectural trim colours (see trim.js)
 *   windows — glass cells: { side, from, to, y0, y1 } on a boundary, or { cellType } (see exterior.js)
 *   exterior— what is outside the glass: { kind, rain, seed } or null
 *
 * Colours follow the classic per-floor palette (levels.js fogColor/ambient/
 * accent) so each floor keeps its mood; values were tuned against captures.
 */
import * as THREE from 'three';

const RIGS = [
    // 1 The Lobby — bright corporate atrium, cool skylight from above-left
    {
        key: { dir: [-0.75, 1, 0.9], color: 0xdfe8ff, intensity: 4.4 },
        ambient: { color: 0x8890a8, intensity: 0.12 },
        hemi: { sky: 0xffffff, ground: 0x6a6050, intensity: 0.1 },
        accents: { color: 0xffd9a0, intensity: 4.5, distance: 9.3, decay: 1.9 },
        fixture: 0xfff2d8,
        panels: { color: 0xfff4de, intensity: 1.35 },
        exposure: 1.05,
        height: 2.0,
        trim: { base: 0x4a3120, crown: 0xe8e2d4, frame: 0x5a3d28, beams: false },
        windows: [{ side: 'top', from: 3, to: 28, y0: 0, y1: 2.0 }],
        exterior: { kind: 'street', seed: 0x101 },
        grade: { tint: [1.0, 1.0, 1.04], saturation: 0.88, contrast: 1.06, vignette: 0.35, grain: 0.04, bloom: { strength: 0.3, threshold: 0.92 } },
    },
    // 2 The Office — flat fluorescent grid, slightly warm-white, steep
    {
        key: { dir: [0.55, 1, 0.8], color: 0xfff6e2, intensity: 3.8 },
        ambient: { color: 0x9090a0, intensity: 0.11 },
        hemi: { sky: 0xffffff, ground: 0x3a4658, intensity: 0.1 },
        accents: { color: 0xfff2cc, intensity: 4.0, distance: 8.9, decay: 1.9 },
        fixture: 0xffffff,
        panels: { color: 0xf4f7ff, intensity: 1.5 },
        exposure: 1.0,
        height: 1.7,
        trim: { base: 0x4d3a2a, crown: 0xd9d4c8, frame: 0x6a4c34, beams: false },
        windows: [{ side: 'left', from: 2, to: 24, y0: 0.85, y1: 1.7 },
            { rect: [8, 5, 8, 1], y0: 0.6, y1: 1.35 }, { rect: [8, 10, 8, 1], y0: 0.6, y1: 1.35 },   // conference room glass
            { rect: [24, 5, 8, 1], y0: 0.6, y1: 1.35 }, { rect: [24, 10, 8, 1], y0: 0.6, y1: 1.35 }], // manager office glass
        exterior: { kind: 'city', seed: 0x202 },
        grade: { tint: [1.02, 1.0, 0.96], saturation: 0.85, contrast: 1.05, vignette: 0.38, grain: 0.045, bloom: { strength: 0.28, threshold: 0.93 } },
    },
    // 3 The Archives — dark basement, low key from a caged bulb rail, orange
    {
        key: { dir: [0.9, 1, -0.5], color: 0xffb070, intensity: 2.5 },
        ambient: { color: 0x556070, intensity: 0.07 },
        hemi: { sky: 0x8090a8, ground: 0x101418, intensity: 0.06 },
        accents: { color: 0xff9944, intensity: 5.0, distance: 8.1, decay: 1.9 },
        fixture: 0xffc890,
        panels: { color: 0xffb877, intensity: 0.9 },
        exposure: 0.95,
        height: 1.55,
        trim: { base: 0x2c2f36, crown: 0x3a3e46, frame: 0x3d3128, beams: true, beamColor: 0x2a2d33 },
        grade: { tint: [1.04, 0.98, 0.92], saturation: 0.8, contrast: 1.07, lift: 0.0, vignette: 0.45, grain: 0.07, bloom: { strength: 0.4, threshold: 0.9 } },
    },
    // 4 The Showroom — warm retail spots, key from tall display windows
    {
        key: { dir: [1.0, 1, 0.45], color: 0xffe6c4, intensity: 4.0 },
        ambient: { color: 0xb09878, intensity: 0.1 },
        hemi: { sky: 0xfff0dc, ground: 0x4a3018, intensity: 0.08 },
        accents: { color: 0xffe0b0, intensity: 5.0, distance: 8.5, decay: 1.9 },
        fixture: 0xfff0d6,
        panels: { color: 0xfff1de, intensity: 1.2 },
        exposure: 1.02,
        height: 2.0,
        trim: { base: 0x5a3a20, crown: 0xf0e6d6, frame: 0x6b4a2c, beams: false },
        windows: [{ cellType: 'C', y0: 0, y1: 2.0 }],
        exterior: null,
        grade: { tint: [1.05, 1.0, 0.94], saturation: 0.95, contrast: 1.05, vignette: 0.36, grain: 0.04, bloom: { strength: 0.32, threshold: 0.9 } },
    },
    // 5 The Factory — cold clerestory light through smoke, cyan sodium mix
    {
        key: { dir: [-0.9, 1, -0.7], color: 0xa8d8ff, intensity: 3.2 },
        ambient: { color: 0x607080, intensity: 0.07 },
        hemi: { sky: 0x9cc8e8, ground: 0x141a1e, intensity: 0.07 },
        accents: { color: 0x88ddff, intensity: 5.5, distance: 9.3, decay: 1.9 },
        fixture: 0xc8ecff,
        panels: { color: 0xd0f0ff, intensity: 1.1 },
        exposure: 0.98,
        height: 2.3,
        trim: { base: 0x33383e, crown: 0x2c3036, frame: 0x8a9096, beams: true, beamColor: 0x3a4048, metalFrames: true },
        windows: [{ side: 'top', from: 2, to: 45, y0: 1.35, y1: 2.3 }, { side: 'bottom', from: 2, to: 45, y0: 1.35, y1: 2.3 }],
        exterior: { kind: 'industrial', seed: 0x505 },
        grade: { tint: [0.94, 1.0, 1.06], saturation: 0.78, contrast: 1.12, lift: -0.01, vignette: 0.5, grain: 0.065, bloom: { strength: 0.45, threshold: 0.86 } },
    },
    // 6 The Penthouse — night city through glass, red executive accent
    {
        key: { dir: [0.6, 1, 1.0], color: 0xffc8b0, intensity: 2.3 },
        ambient: { color: 0x806060, intensity: 0.09 },
        hemi: { sky: 0xffd0c0, ground: 0x200808, intensity: 0.07 },
        accents: { color: 0xff5533, intensity: 4.5, distance: 8.5, decay: 1.9 },
        fixture: 0xffd0c0,
        panels: { color: 0xffe0d0, intensity: 1.0 },
        exposure: 1.0,
        height: 2.1,
        trim: { base: 0x2a1c1c, crown: 0x1e1416, frame: 0xc9a227, beams: false, metalFrames: true },
        windows: [{ side: 'left', from: 1, to: 21, y0: 0, y1: 2.1 }, { side: 'right', from: 1, to: 21, y0: 0, y1: 2.1 }, { side: 'bottom', from: 1, to: 30, y0: 0, y1: 2.1 }],
        exterior: { kind: 'skyline-below', rain: true, seed: 0x606 },
        grade: { tint: [1.06, 0.98, 0.98], saturation: 0.85, contrast: 1.08, vignette: 0.5, grain: 0.06, bloom: { strength: 0.4, threshold: 0.95 } },
    },
];

export function getRig(levelIndex) {
    return RIGS[Math.min(levelIndex, RIGS.length - 1)];
}

/** Shadow-map budget shared by every floor. */
export const SHADOW = {
    mapSize: 1024,
    bias: -0.0006,
    normalBias: 0.02,
    radius: 2.5,
};

/**
 * Build the shadow-casting key light for a level of w×h cells.
 * The ortho shadow camera hugs the map bounds so 2048 px covers ~40–60 px
 * per cell — sharp enough for furniture and people at this scale.
 */
export function makeKeyLight(rig, w, h, wallHeight) {
    const light = new THREE.DirectionalLight(rig.key.color, rig.key.intensity);
    const d = new THREE.Vector3(...rig.key.dir).normalize();
    const cx = w / 2, cz = h / 2;
    const dist = Math.max(w, h) * 1.2;
    light.position.set(cx + d.x * dist, d.y * dist, cz + d.z * dist);
    light.target.position.set(cx, 0, cz);
    light.castShadow = true;
    light.shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize);
    light.shadow.bias = SHADOW.bias;
    light.shadow.normalBias = SHADOW.normalBias;
    light.shadow.radius = SHADOW.radius;
    const cam = light.shadow.camera;
    // generous half-extents: the light is tilted, so the map's footprint
    // projected along the light direction is a little wider than w×h
    const ext = Math.max(w, h) * 0.75 + wallHeight * 2;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 0.5; cam.far = dist * 2.5;
    cam.updateProjectionMatrix();
    return light;
}

/** Mark a subtree as a shadow caster/receiver. */
export function setShadow(obj, { cast = true, receive = true } = {}) {
    obj.traverse((o) => {
        if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
    });
    return obj;
}
