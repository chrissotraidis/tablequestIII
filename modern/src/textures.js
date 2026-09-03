/**
 * PROCEDURAL TEXTURES — hi-res canvas-generated, no external files.
 *
 * MODERN: every texture is authored in the same 256-unit logical space as the
 * classic build (so bricks, planks, and tiles keep their exact size and
 * identity) but rasterised at 2x (walls, 512px) or 4x (floors, 1024px).
 * From each colour canvas we derive a normal map and a roughness map, and
 * `surfaceMaterial()` hands out MeshStandardMaterials that use all three.
 */
import * as THREE from 'three';

const SIZE = 256;           // logical authoring size (unchanged from classic)
let SCALE = 2;              // raster multiplier for the texture being built

function makeCanvas(size = SIZE) {
    const c = document.createElement('canvas');
    c.width = c.height = size * SCALE;
    const ctx = c.getContext('2d');
    ctx.scale(SCALE, SCALE);   // author in logical units, render at SCALE x
    return [c, ctx];
}

// deterministic-ish noise sprinkle
function speckle(ctx, size, count, color, alphaMax = 0.1, sizeMax = 2) {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.random() * alphaMax;
        const s = 1 + Math.random() * sizeMax;
        ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
    ctx.globalAlpha = 1;
}

function vgrad(ctx, size, c1, c2) {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
}

function tex(canvas, repeat = 1) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

// ---------------- WALLS ----------------

function brick() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#7a3328', '#642a20');
    const bh = 32, bw = 64;
    for (let y = 0; y < SIZE / bh; y++) {
        for (let x = -1; x < SIZE / bw + 1; x++) {
            const ox = (y % 2) * (bw / 2);
            const hue = 8 + Math.random() * 14;
            ctx.fillStyle = `rgb(${120 + Math.random() * 30}, ${52 + hue}, ${40 + hue * 0.5})`;
            ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, 3);
        }
    }
    ctx.strokeStyle = '#3a1813';
    ctx.lineWidth = 3;
    for (let y = 0; y <= SIZE / bh; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * bh); ctx.lineTo(SIZE, y * bh); ctx.stroke();
    }
    speckle(ctx, SIZE, 900, '#000', 0.15);
    speckle(ctx, SIZE, 400, '#ffccaa', 0.08);
    return c;
}

function woodPanel() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#8a5a2e', '#74471f');
    // vertical planks
    const pw = 42;
    for (let x = 0; x < SIZE / pw + 1; x++) {
        ctx.fillStyle = `rgba(${100 + Math.random() * 40},${60 + Math.random() * 25},${25 + Math.random() * 15},0.55)`;
        ctx.fillRect(x * pw, 0, pw - 3, SIZE);
        ctx.fillStyle = 'rgba(30,15,5,0.8)';
        ctx.fillRect(x * pw + pw - 3, 0, 3, SIZE);
    }
    // grain lines
    ctx.strokeStyle = 'rgba(60,30,10,0.35)';
    for (let i = 0; i < 60; i++) {
        ctx.lineWidth = 0.6 + Math.random();
        ctx.beginPath();
        const x = Math.random() * SIZE;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (Math.random() - 0.5) * 14, SIZE * 0.33, x + (Math.random() - 0.5) * 14, SIZE * 0.66, x + (Math.random() - 0.5) * 8, SIZE);
        ctx.stroke();
    }
    // knots
    for (let i = 0; i < 5; i++) {
        const x = Math.random() * SIZE, y = Math.random() * SIZE;
        const g = ctx.createRadialGradient(x, y, 1, x, y, 8);
        g.addColorStop(0, 'rgba(40,20,5,0.9)');
        g.addColorStop(1, 'rgba(40,20,5,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
    }
    speckle(ctx, SIZE, 500, '#000', 0.08);
    return c;
}

function stone() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#5a5f6a', '#454a55');
    const bh = 42;
    for (let y = 0; y < SIZE / bh; y++) {
        let x = (y % 2) * -30;
        while (x < SIZE) {
            const w = 50 + Math.random() * 40;
            const shade = 70 + Math.random() * 35;
            ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 12})`;
            ctx.fillRect(x + 2, y * bh + 2, w - 4, bh - 4);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(x + 2, y * bh + 2, w - 4, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(x + 2, y * bh + bh - 7, w - 4, 5);
            x += w;
        }
    }
    speckle(ctx, SIZE, 1400, '#000', 0.18);
    speckle(ctx, SIZE, 350, '#aaccee', 0.05);
    // moss
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * SIZE, y = SIZE * 0.5 + Math.random() * SIZE * 0.5;
        const g = ctx.createRadialGradient(x, y, 1, x, y, 14);
        g.addColorStop(0, 'rgba(50,80,40,0.4)');
        g.addColorStop(1, 'rgba(50,80,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
    }
    return c;
}

function metal() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#6a7077', '#4d5258');
    // brushed lines
    for (let i = 0; i < 240; i++) {
        ctx.strokeStyle = `rgba(${180 + Math.random() * 60},${190 + Math.random() * 50},${200 + Math.random() * 40},${Math.random() * 0.06})`;
        const y = Math.random() * SIZE;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
    }
    // plates
    ctx.strokeStyle = 'rgba(20,22,26,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, SIZE - 8, SIZE - 8);
    ctx.beginPath(); ctx.moveTo(SIZE / 2, 4); ctx.lineTo(SIZE / 2, SIZE - 4); ctx.stroke();
    // rivets
    for (const [rx, ry] of [[18, 18], [SIZE - 18, 18], [18, SIZE - 18], [SIZE - 18, SIZE - 18], [SIZE / 2 - 12, 18], [SIZE / 2 + 12, SIZE - 18]]) {
        ctx.fillStyle = '#2c3036';
        ctx.beginPath(); ctx.arc(rx, ry, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath(); ctx.arc(rx - 1.5, ry - 1.5, 2, 0, 7); ctx.fill();
    }
    // warning stripe
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (let x = -SIZE; x < SIZE; x += 28) {
        ctx.fillStyle = '#c9a227';
        ctx.beginPath();
        ctx.moveTo(x, SIZE); ctx.lineTo(x + 14, SIZE); ctx.lineTo(x + 14 + 18, SIZE - 18); ctx.lineTo(x + 18, SIZE - 18);
        ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    speckle(ctx, SIZE, 600, '#000', 0.12);
    return c;
}

function officePanel() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#b8b2a4', '#9d978a');
    // wainscot
    ctx.fillStyle = '#6e4f30';
    ctx.fillRect(0, SIZE * 0.62, SIZE, SIZE * 0.38);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, SIZE * 0.62, SIZE, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, SIZE * 0.62 + 5, SIZE, 3);
    // wood grain in wainscot
    ctx.strokeStyle = 'rgba(40,25,10,0.3)';
    for (let i = 0; i < 30; i++) {
        const y = SIZE * 0.65 + Math.random() * SIZE * 0.34;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y + (Math.random() - 0.5) * 6); ctx.stroke();
    }
    // upper panel seams
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= SIZE; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SIZE * 0.62); ctx.stroke();
    }
    speckle(ctx, SIZE, 500, '#665', 0.07);
    return c;
}

function concrete() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#8d8d8d', '#737373');
    speckle(ctx, SIZE, 2600, '#000', 0.1, 2.5);
    speckle(ctx, SIZE, 1500, '#fff', 0.06, 2);
    // cracks
    ctx.strokeStyle = 'rgba(30,30,30,0.4)';
    for (let i = 0; i < 4; i++) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        let x = Math.random() * SIZE, y = 0;
        ctx.moveTo(x, y);
        while (y < SIZE) {
            x += (Math.random() - 0.5) * 26;
            y += 12 + Math.random() * 22;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    // form lines
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, SIZE / 2); ctx.lineTo(SIZE, SIZE / 2); ctx.stroke();
    return c;
}

function doorTex() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#3f5a73', '#2d4356');
    // inset panel
    ctx.strokeStyle = '#16222e';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, SIZE - 40, SIZE - 40);
    ctx.strokeStyle = 'rgba(160,200,230,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, SIZE - 56, SIZE - 56);
    // center seam
    ctx.fillStyle = '#101820';
    ctx.fillRect(SIZE / 2 - 2, 12, 4, SIZE - 24);
    // handle plates
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(SIZE / 2 - 22, SIZE / 2 - 6, 12, 30);
    ctx.fillRect(SIZE / 2 + 10, SIZE / 2 - 6, 12, 30);
    // sign
    ctx.fillStyle = '#d6d2c4';
    ctx.fillRect(SIZE / 2 - 34, 38, 68, 22);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAFF', SIZE / 2, 54);
    speckle(ctx, SIZE, 500, '#000', 0.12);
    return c;
}

function gateTex() {
    const [c, ctx] = makeCanvas();
    // transparent-ish bars on dark
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let x = 8; x < SIZE; x += 32) {
        const g = ctx.createLinearGradient(x, 0, x + 14, 0);
        g.addColorStop(0, '#3a4250');
        g.addColorStop(0.5, '#97a3b5');
        g.addColorStop(1, '#3a4250');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 14, SIZE);
    }
    ctx.fillStyle = '#222a36';
    ctx.fillRect(0, 18, SIZE, 16);
    ctx.fillRect(0, SIZE - 36, SIZE, 16);
    ctx.fillStyle = '#c9a227';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠', SIZE / 2, SIZE / 2);
    return c;
}

function elevatorTex() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#8d9aa8', '#6c7886');
    ctx.fillStyle = '#1c242e';
    ctx.fillRect(SIZE / 2 - 3, 10, 6, SIZE - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 10, SIZE / 2 - 20, SIZE - 20);
    ctx.strokeRect(SIZE / 2 + 6, 10, SIZE / 2 - 20, SIZE - 20);
    // up arrow light
    ctx.fillStyle = '#48ff88';
    ctx.beginPath();
    ctx.moveTo(SIZE / 2, 26); ctx.lineTo(SIZE / 2 - 12, 46); ctx.lineTo(SIZE / 2 + 12, 46);
    ctx.closePath(); ctx.fill();
    ctx.shadowColor = '#48ff88';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    speckle(ctx, SIZE, 350, '#000', 0.1);
    return c;
}

// ---------------- FLOORS / CEILINGS ----------------

function marble() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#cfc8bb', '#b8b1a3');
    // veins
    for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(120,110,100,${0.15 + Math.random() * 0.2})`;
        ctx.lineWidth = 0.8 + Math.random() * 1.6;
        ctx.beginPath();
        let x = Math.random() * SIZE, y = Math.random() * SIZE;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
            x += (Math.random() - 0.5) * 80;
            y += (Math.random() - 0.5) * 80;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    // tiles
    ctx.strokeStyle = 'rgba(60,55,50,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= SIZE; i += 128) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke();
    }
    return c;
}

function carpet() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#41526b', '#374660');
    speckle(ctx, SIZE, 5000, '#90a8cc', 0.06, 1.4);
    speckle(ctx, SIZE, 3000, '#101828', 0.1, 1.4);
    // tile seams
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i <= SIZE; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke();
    }
    return c;
}

function woodFloor() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#9a6a36', '#855626');
    const ph = 32;
    for (let y = 0; y < SIZE / ph; y++) {
        const off = (y % 2) * 80;
        let x = -off;
        while (x < SIZE) {
            const w = 100 + Math.random() * 60;
            ctx.fillStyle = `rgba(${130 + Math.random() * 40},${85 + Math.random() * 25},${40 + Math.random() * 14},0.6)`;
            ctx.fillRect(x, y * ph, w - 2, ph - 2);
            x += w;
        }
    }
    ctx.strokeStyle = 'rgba(50,28,8,0.55)';
    for (let y = 0; y <= SIZE / ph; y++) {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, y * ph); ctx.lineTo(SIZE, y * ph); ctx.stroke();
    }
    speckle(ctx, SIZE, 800, '#000', 0.07);
    return c;
}

function stoneFloor() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#4a4e58', '#3a3e48');
    for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
            const s = 55 + Math.random() * 22;
            ctx.fillStyle = `rgb(${s},${s + 3},${s + 9})`;
            ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
        }
    speckle(ctx, SIZE, 1600, '#000', 0.16);
    speckle(ctx, SIZE, 300, '#8899bb', 0.05);
    return c;
}

function factoryFloor() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#56585c', '#44464a');
    // diamond plate
    ctx.fillStyle = 'rgba(160,165,175,0.22)';
    for (let y = 0; y < SIZE; y += 24)
        for (let x = 0; x < SIZE; x += 24) {
            ctx.save();
            ctx.translate(x + ((y / 24) % 2) * 12, y);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-5, -2, 10, 4);
            ctx.restore();
        }
    speckle(ctx, SIZE, 1200, '#000', 0.14);
    // oil stains
    for (let i = 0; i < 4; i++) {
        const x = Math.random() * SIZE, y = Math.random() * SIZE;
        const g = ctx.createRadialGradient(x, y, 2, x, y, 26);
        g.addColorStop(0, 'rgba(15,15,20,0.5)');
        g.addColorStop(1, 'rgba(15,15,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill();
    }
    return c;
}

function ceiling() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#d8d4c8', '#c2beb2');
    ctx.strokeStyle = 'rgba(90,86,76,0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= SIZE; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke();
    }
    speckle(ctx, SIZE, 2200, '#998', 0.08, 1.4);
    return c;
}

function metalCeil() {
    const [c, ctx] = makeCanvas();
    vgrad(ctx, SIZE, '#3c4248', '#2c3036');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    for (let i = 0; i <= SIZE; i += 86) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke();
    }
    // vents
    ctx.fillStyle = 'rgba(10,12,15,0.7)';
    ctx.fillRect(30, 90, 70, 50);
    ctx.strokeStyle = 'rgba(140,150,160,0.3)';
    ctx.lineWidth = 2;
    for (let y = 96; y < 138; y += 8) {
        ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(96, y); ctx.stroke();
    }
    speckle(ctx, SIZE, 800, '#000', 0.12);
    return c;
}

// ---------------- SURFACE MAPS (normal + roughness) ----------------

/**
 * Per-texture surface response. `bump` scales the derived normal map,
 * `rough`/`roughVar` set the roughness base and how much the height field
 * modulates it, `metal` is metalness, `invert` flips which tones read as
 * raised. Tuned so each material keeps its classic look but responds to light.
 */
const SURFACE = {
    brick:        { bump: 2.2, rough: 0.92, roughVar: 0.08, metal: 0.0 },
    wood:         { bump: 0.7, rough: 0.55, roughVar: 0.20, metal: 0.0 },
    stone:        { bump: 2.4, rough: 0.88, roughVar: 0.10, metal: 0.0 },
    metal:        { bump: 1.3, rough: 0.38, roughVar: 0.25, metal: 0.65 },
    office:       { bump: 0.7, rough: 0.72, roughVar: 0.15, metal: 0.0 },
    concrete:     { bump: 1.6, rough: 0.92, roughVar: 0.06, metal: 0.0 },
    door:         { bump: 1.4, rough: 0.48, roughVar: 0.20, metal: 0.35 },
    gate:         { bump: 1.0, rough: 0.40, roughVar: 0.20, metal: 0.70 },
    elevator:     { bump: 1.2, rough: 0.30, roughVar: 0.20, metal: 0.70 },
    marble:       { bump: 0.45, rough: 0.16, roughVar: 0.12, metal: 0.0 },
    carpet:       { bump: 1.5, rough: 0.96, roughVar: 0.04, metal: 0.0 },
    woodFloor:    { bump: 1.0, rough: 0.42, roughVar: 0.18, metal: 0.0 },
    stoneFloor:   { bump: 1.8, rough: 0.80, roughVar: 0.12, metal: 0.0 },
    factoryFloor: { bump: 2.2, rough: 0.52, roughVar: 0.25, metal: 0.45 },
    ceiling:      { bump: 1.0, rough: 0.90, roughVar: 0.06, metal: 0.0 },
    metalCeil:    { bump: 1.4, rough: 0.50, roughVar: 0.20, metal: 0.50 },
};

/** separable box blur on a Float32 height field (in place, via temp) */
function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const span = r * 2 + 1;
    for (let y = 0; y < h; y++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[y * w + ((k + w) % w)];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = acc / span;
            acc += src[y * w + ((x + r + 1) % w)] - src[y * w + ((x - r + w) % w)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += tmp[((k + h) % h) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = acc / span;
            acc += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x];
        }
    }
    return out;
}

/**
 * Derive tiling normal + roughness canvases from a colour canvas.
 * Height = luminance, high-passed so the authoring gradient doesn't tilt the
 * whole surface, lightly blurred so speckle reads as grain, not spikes.
 */
function deriveSurfaceMaps(canvas, cfg) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h).data;
    const n = w * h;
    let height = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
        height[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    if (cfg.invert) for (let i = 0; i < n; i++) height[i] = 1 - height[i];
    // high-pass: remove the broad authoring gradient
    const low = boxBlur(height, w, h, Math.max(8, w >> 4));
    for (let i = 0; i < n; i++) height[i] -= low[i];
    // soften
    height = boxBlur(height, w, h, 1);

    const nrm = new ImageData(w, h);
    const rgh = new ImageData(w, h);
    const strength = cfg.bump * (w / 256);
    for (let y = 0; y < h; y++) {
        const y0 = ((y - 1 + h) % h) * w, y1 = y * w, y2 = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
            const x0 = (x - 1 + w) % w, x2 = (x + 1) % w;
            // sobel
            const dx = (height[y0 + x2] + 2 * height[y1 + x2] + height[y2 + x2])
                     - (height[y0 + x0] + 2 * height[y1 + x0] + height[y2 + x0]);
            const dy = (height[y2 + x0] + 2 * height[y2 + x] + height[y2 + x2])
                     - (height[y0 + x0] + 2 * height[y0 + x] + height[y0 + x2]);
            let nx = -dx * strength, ny = dy * strength, nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len; ny /= len; nz /= len;
            const i = (y1 + x) * 4;
            nrm.data[i] = (nx * 0.5 + 0.5) * 255;
            nrm.data[i + 1] = (ny * 0.5 + 0.5) * 255;
            nrm.data[i + 2] = (nz * 0.5 + 0.5) * 255;
            nrm.data[i + 3] = 255;
            // roughness: raised/bright areas a touch smoother, recesses rougher
            const rv = Math.min(1, Math.max(0, cfg.rough - height[y1 + x] * cfg.roughVar * 3));
            const g = rv * 255;
            rgh.data[i] = g; rgh.data[i + 1] = g; rgh.data[i + 2] = g; rgh.data[i + 3] = 255;
        }
    }
    const nc = document.createElement('canvas'); nc.width = w; nc.height = h;
    nc.getContext('2d').putImageData(nrm, 0, 0);
    const rc = document.createElement('canvas'); rc.width = w; rc.height = h;
    rc.getContext('2d').putImageData(rgh, 0, 0);
    return { normal: nc, roughness: rc };
}

function dataTex(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
}

let surfaces = null;

/** All surfaces: { key: { map, normalMap, roughnessMap, cfg, canvases } } */
export function getSurfaces() {
    if (surfaces) return surfaces;
    getTextures();
    return surfaces;
}

/**
 * A MeshStandardMaterial for a named surface. `repeat` tiles all three maps
 * (cloned, so callers can set per-mesh repeats without touching the cache).
 */
export function surfaceMaterial(key, { repeat = null, ...extra } = {}) {
    const s = getSurfaces()[key];
    if (!s) throw new Error('unknown surface ' + key);
    let map = s.map, normalMap = s.normalMap, roughnessMap = s.roughnessMap;
    if (repeat) {
        map = map.clone(); normalMap = normalMap.clone(); roughnessMap = roughnessMap.clone();
        for (const t of [map, normalMap, roughnessMap]) {
            t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true;
            t.userData.clone = true; // per-mesh copy: World.dispose() must free it
        }
    }
    return new THREE.MeshStandardMaterial({
        map, normalMap, roughnessMap,
        normalScale: new THREE.Vector2(1, 1),
        roughness: 1,                 // multiplied by the roughness map
        metalness: s.cfg.metal,
        ...extra,
    });
}

// ---------------- EXPORT ----------------

// fake ambient occlusion: darken top/bottom edges of wall textures so walls
// read as grounded instead of uniformly lit
function applyWallAO(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); // work in device pixels regardless of raster scale
    const s = canvas.height;
    let g = ctx.createLinearGradient(0, 0, 0, s * 0.14);
    g.addColorStop(0, 'rgba(0,0,0,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, s * 0.14);
    g = ctx.createLinearGradient(0, s * 0.82, 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, s * 0.82, canvas.width, s * 0.18);
    return canvas;
}

let cache = null;

const BUILDERS = {
    brick, wood: woodPanel, stone, metal, office: officePanel, concrete,
    door: doorTex, gate: gateTex, elevator: elevatorTex,
    marble, carpet, woodFloor, stoneFloor, factoryFloor, ceiling, metalCeil,
};
// floors are seen up close and tile across whole rooms: rasterise at 4x
const FLOOR_KEYS = new Set(['marble', 'carpet', 'woodFloor', 'stoneFloor', 'factoryFloor']);

export function getTextures() {
    if (cache) return cache;
    const t0 = performance.now();
    cache = {};
    surfaces = {};
    const wallKeys = new Set(['brick', 'wood', 'stone', 'metal', 'office', 'concrete', 'door']);
    for (const [k, build] of Object.entries(BUILDERS)) {
        SCALE = FLOOR_KEYS.has(k) ? 4 : 2;
        const cv = build();
        const cfg = SURFACE[k];
        // derive relief before the AO gradient so edge darkening doesn't tilt the normals
        const maps = deriveSurfaceMaps(cv, cfg);
        if (wallKeys.has(k)) applyWallAO(cv);
        const map = tex(cv);
        cache[k] = map;
        surfaces[k] = {
            map, normalMap: dataTex(maps.normal), roughnessMap: dataTex(maps.roughness),
            cfg, canvases: { color: cv, normal: maps.normal, roughness: maps.roughness },
        };
    }
    SCALE = 2;
    console.log(`[textures] ${Object.keys(cache).length} surfaces + normal/roughness maps in ${(performance.now() - t0).toFixed(0)} ms`);
    return cache;
}
