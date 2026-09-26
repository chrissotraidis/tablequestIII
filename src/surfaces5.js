/**
 * SURFACES 5 — Table Quest 5 generated materials (docs/v5/GOAL_LOOP.md V3).
 *
 * Every surface keeps its classic identity (same palette, same tile/plank/brick
 * sizes in the 256-unit authoring space) but is rebuilt with:
 *   - seeded, tiling fractal noise for mottling, wear and grime (no flat fills)
 *   - an explicit height field drawn alongside the colour, so normals come from
 *     real bevels, grout and grain instead of guessing from brightness
 *   - higher raster detail (set by the quality preset)
 * Each builder draws into ctx (colour) and h (height, mid-grey = flat) in the
 * same logical coordinates.
 */
export const SIZE = 256;

function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seedOf(key) { let h = 2166136261; for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Periodic value-noise fBm on a px x px canvas that tiles seamlessly.
const noiseCache = new Map();
export function noiseCanvas(seed, { px = 256, cells = 8, octaves = 5, gain = 0.5, ridge = false } = {}) {
    const key = [seed, px, cells, octaves, gain, ridge].join('|');
    if (noiseCache.has(key)) return noiseCache.get(key);
    const out = new Float32Array(px * px);
    let amp = 1, total = 0, c = cells;
    for (let o = 0; o < octaves; o++) {
        const r = rng(seed + o * 7919), lat = new Float32Array(c * c);
        for (let i = 0; i < lat.length; i++) lat[i] = r();
        for (let y = 0; y < px; y++) {
            const fy = y / px * c, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % c;
            for (let x = 0; x < px; x++) {
                const fx = x / px * c, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % c;
                const a = lat[y0 * c + x0], b = lat[y0 * c + x1], d = lat[y1 * c + x0], e = lat[y1 * c + x1];
                let v = (a + (b - a) * sx) + ((d + (e - d) * sx) - (a + (b - a) * sx)) * sy;
                if (ridge) v = 1 - Math.abs(v * 2 - 1);
                out[y * px + x] += v * amp;
            }
        }
        total += amp; amp *= gain; c *= 2;
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = px;
    const img = canvas.getContext('2d').createImageData(px, px);
    for (let i = 0; i < out.length; i++) { const g = Math.max(0, Math.min(255, out[i] / total * 255)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255; }
    canvas.getContext('2d').putImageData(img, 0, 0);
    noiseCache.set(key, canvas);
    return canvas;
}

// Overlay a tiling noise canvas across the full tile with a blend mode.
function wash(ctx, noise, mode, alpha, { sx = 1, sy = 1, ox = 0, oy = 0 } = {}) {
    ctx.save(); ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha;
    const w = SIZE / sx, hgt = SIZE / sy;
    for (let y = -oy; y < SIZE; y += hgt) for (let x = -ox; x < SIZE; x += w) ctx.drawImage(noise, x, y, w, hgt);
    ctx.restore();
}
function fill(ctx, color, x = 0, y = 0, w = SIZE, hh = SIZE) { ctx.fillStyle = color; ctx.fillRect(x, y, w, hh); }
const grey = (v) => { const g = Math.round(Math.max(0, Math.min(1, v)) * 255); return 'rgb(' + g + ',' + g + ',' + g + ')'; };
// Beveled raised rectangle in the height field.
function bevel(h, x, y, w, hh, top = 0.72, edge = 2.5, base = 0.5) {
    for (let i = 0; i < edge; i++) { const t = (i + 1) / edge; h.fillStyle = grey(base + (top - base) * t); h.fillRect(x + i, y + i, w - i * 2, hh - i * 2); }
}
function wrapRect(ctx, x, y, w, hh) { for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) ctx.fillRect(x + dx, y + dy, w, hh); }

export const BUILDERS5 = {
    carpet(ctx, h, r) {
        fill(ctx, '#3d4d66'); fill(h, grey(0.5));
        // 64-unit carpet tiles, alternate pile direction reads as a slight shade shift.
        for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
            const shade = (tx + ty) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
            fill(ctx, shade, tx * 64, ty * 64, 64, 64);
            fill(ctx, 'rgba(' + (60 + r() * 10 | 0) + ',' + (78 + r() * 10 | 0) + ',' + (104 + r() * 14 | 0) + ',0.25)', tx * 64, ty * 64, 64, 64);
        }
        const fine = noiseCanvas(11, { px: 256, cells: 64, octaves: 2 }), loop = noiseCanvas(12, { px: 256, cells: 128, octaves: 1 });
        wash(ctx, fine, 'overlay', 0.55); wash(ctx, loop, 'soft-light', 0.5);
        wash(ctx, noiseCanvas(13, { px: 256, cells: 4, octaves: 4 }), 'multiply', 0.22); // traffic wear
        // flecks
        for (let i = 0; i < 2600; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(150,172,205,0.18)' : 'rgba(12,18,30,0.22)'; ctx.fillRect(r() * SIZE, r() * SIZE, 0.8, 0.8); }
        wash(h, fine, 'source-over', 0.5); wash(h, loop, 'overlay', 0.6);
        ctx.strokeStyle = 'rgba(8,12,20,0.45)'; ctx.lineWidth = 0.8; h.strokeStyle = grey(0.3); h.lineWidth = 1;
        for (let i = 0; i <= SIZE; i += 64) for (const c of [ctx, h]) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, SIZE); c.moveTo(0, i); c.lineTo(SIZE, i); c.stroke(); }
    },
    marble(ctx, h, r) {
        fill(ctx, '#cdc6b8');
        wash(ctx, noiseCanvas(21, { cells: 4, octaves: 6 }), 'multiply', 0.12);
        wash(ctx, noiseCanvas(22, { cells: 8, octaves: 5 }), 'soft-light', 0.45);
        // veins: soft wide halos with a sharp core, wandering across tiles
        for (let i = 0; i < 16; i++) {
            let x = r() * SIZE, y = r() * SIZE, a = r() * Math.PI * 2; const pts = [[x, y]];
            for (let s = 0; s < 18; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
            ctx.filter = 'blur(0.6px)'; for (const [w, col] of [[7, 'rgba(140,128,114,0.04)'], [3, 'rgba(128,116,104,0.07)'], [0.9, 'rgba(104,94,84,0.17)']]) {
                ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
                for (const [dx, dy] of [[0, 0], [-SIZE, 0], [SIZE, 0], [0, -SIZE], [0, SIZE]]) { ctx.beginPath(); pts.forEach(([px, py], k) => k ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)); ctx.stroke(); }
            }
        }
        ctx.filter = 'none';
        // 128-unit tiles: each gets a faint tone of its own; beveled grout.
        fill(h, grey(0.5));
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { fill(ctx, (tx + ty) % 2 ? 'rgba(255,250,240,0.05)' : 'rgba(60,50,40,0.04)', tx * 128, ty * 128, 128, 128); bevel(h, tx * 128 + 1, ty * 128 + 1, 126, 126, 0.62, 2.5); }
        ctx.strokeStyle = 'rgba(72,66,58,0.7)'; ctx.lineWidth = 1.4;
        for (let i = 0; i <= SIZE; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke(); }
        wash(h, noiseCanvas(22, { cells: 8, octaves: 5 }), 'overlay', 0.08);
    },
    woodFloor(ctx, h, r) {
        fill(ctx, '#8f6130'); fill(h, grey(0.5));
        const ph = 32, grainN = noiseCanvas(31, { px: 256, cells: 4, octaves: 4 });
        for (let row = 0; row < SIZE / ph; row++) {
            let x = -((row * 53) % 90);
            while (x < SIZE) {
                const w = 96 + r() * 70, tone = r();
                const base = 'rgb(' + (128 + tone * 44 | 0) + ',' + (82 + tone * 28 | 0) + ',' + (38 + tone * 16 | 0) + ')';
                ctx.save(); ctx.beginPath(); ctx.rect(x, row * ph, w, ph); ctx.clip();
                fill(ctx, base, x, row * ph, w, ph);
                // stretched noise gives long flowing grain; offset per plank
                ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55;
                ctx.drawImage(grainN, x - r() * 200, row * ph - r() * 40, 900, 60);
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
                for (let g = 0; g < 14; g++) {
                    const gy = row * ph + r() * ph; ctx.strokeStyle = 'rgba(58,32,12,' + (0.12 + r() * 0.22).toFixed(2) + ')'; ctx.lineWidth = 0.4 + r() * 0.9;
                    ctx.beginPath(); ctx.moveTo(x, gy); ctx.bezierCurveTo(x + w * 0.3, gy + (r() - 0.5) * 5, x + w * 0.7, gy + (r() - 0.5) * 5, x + w, gy + (r() - 0.5) * 3); ctx.stroke();
                }
                if (r() < 0.35) { const kx = x + r() * w, ky = row * ph + 6 + r() * (ph - 12); const g = ctx.createRadialGradient(kx, ky, 0.5, kx, ky, 5); g.addColorStop(0, 'rgba(46,24,8,0.85)'); g.addColorStop(0.5, 'rgba(70,38,14,0.4)'); g.addColorStop(1, 'rgba(70,38,14,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(kx, ky, 7, 3.5, 0, 0, 7); ctx.fill(); }
                // varnish sheen band and worn centre
                const sheen = ctx.createLinearGradient(0, row * ph, 0, row * ph + ph); sheen.addColorStop(0, 'rgba(255,230,190,0.07)'); sheen.addColorStop(0.5, 'rgba(255,230,190,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.1)'); ctx.fillStyle = sheen; ctx.fillRect(x, row * ph, w, ph);
                ctx.restore();
                for (const dx of [0, SIZE]) bevel(h, x + dx, row * ph, w, ph, 0.6, 1.5);
                ctx.fillStyle = 'rgba(42,22,8,0.75)'; ctx.fillRect(x, row * ph, 1.2, ph);
                x += w;
            }
            ctx.fillStyle = 'rgba(40,20,6,0.7)'; ctx.fillRect(0, row * ph, SIZE, 1.3);
        }
        wash(ctx, noiseCanvas(32, { cells: 3, octaves: 4 }), 'multiply', 0.14);
    },
    stoneFloor(ctx, h, r) {
        fill(ctx, '#3a3e48'); fill(h, grey(0.35));
        const mott = noiseCanvas(41, { cells: 8, octaves: 6 }), fine = noiseCanvas(42, { cells: 32, octaves: 3 });
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const s = 58 + r() * 22 | 0, j = () => (r() - 0.5) * 1.6;
            ctx.save(); ctx.beginPath(); ctx.moveTo(x * 64 + 2 + j(), y * 64 + 2 + j()); ctx.lineTo(x * 64 + 62 + j(), y * 64 + 2 + j()); ctx.lineTo(x * 64 + 62 + j(), y * 64 + 62 + j()); ctx.lineTo(x * 64 + 2 + j(), y * 64 + 62 + j()); ctx.closePath(); ctx.clip();
            fill(ctx, 'rgb(' + s + ',' + (s + 3) + ',' + (s + 9) + ')', x * 64, y * 64, 64, 64);
            ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.7; ctx.drawImage(mott, x * 64 - r() * 128, y * 64 - r() * 128, 256, 256); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            ctx.restore();
            bevel(h, x * 64 + 2, y * 64 + 2, 60, 60, 0.66, 3);
        }
        wash(ctx, fine, 'soft-light', 0.5); wash(h, fine, 'overlay', 0.35);
        for (let i = 0; i < 40; i++) { const cx = r() * SIZE, cy = r() * SIZE; ctx.fillStyle = 'rgba(10,12,16,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, 0.6 + r() * 1.6, 0, 7); ctx.fill(); h.fillStyle = grey(0.3); h.beginPath(); h.arc(cx, cy, 0.6 + r() * 1.6, 0, 7); h.fill(); }
    },
    factoryFloor(ctx, h, r) {
        fill(ctx, '#505256'); fill(h, grey(0.45));
        wash(ctx, noiseCanvas(51, { cells: 16, octaves: 3 }), 'overlay', 0.35);
        // diamond plate: pairs of raised lozenges at alternating 45 degree angles
        const step = 16;
        for (let y = 0; y < SIZE; y += step) for (let x = 0; x < SIZE; x += step) {
            const alt = ((x + y) / step) % 2, ang = alt ? Math.PI / 4 : -Math.PI / 4;
            for (const c of [ctx, h]) { c.save(); c.translate(x + step / 2, y + step / 2); c.rotate(ang); }
            const g = ctx.createLinearGradient(-6, -2, 6, 2); g.addColorStop(0, 'rgba(210,214,222,0.55)'); g.addColorStop(0.5, 'rgba(150,154,162,0.35)'); g.addColorStop(1, 'rgba(20,22,26,0.55)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 1.8, 0, 0, 7); ctx.fill();
            h.fillStyle = grey(0.62); h.beginPath(); h.ellipse(0, 0, 6.5, 1.9, 0, 0, 7); h.fill(); h.fillStyle = grey(0.8); h.beginPath(); h.ellipse(0, 0, 5, 1.1, 0, 0, 7); h.fill();
            for (const c of [ctx, h]) c.restore();
        }
        // wear: bright scuffs on the treads, dark grime between, oil stains
        wash(ctx, noiseCanvas(52, { cells: 4, octaves: 5 }), 'multiply', 0.35);
        wash(ctx, noiseCanvas(53, { cells: 8, octaves: 4, ridge: true }), 'screen', 0.08);
        for (let i = 0; i < 5; i++) { const x = r() * SIZE, y = r() * SIZE, rad = 14 + r() * 22; const g = ctx.createRadialGradient(x, y, 1, x, y, rad); g.addColorStop(0, 'rgba(10,10,14,0.55)'); g.addColorStop(0.6, 'rgba(18,16,20,0.25)'); g.addColorStop(1, 'rgba(18,16,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 7); ctx.fill(); }
    },
    ceiling(ctx, h, r) {
        // acoustic tiles in a light T-bar grid (64 units); tiles recessed.
        fill(ctx, '#d4d0c4'); fill(h, grey(0.42));
        const fis = noiseCanvas(61, { cells: 32, octaves: 3 });
        for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
            const x0 = tx * 64 + 3, y0 = ty * 64 + 3, t = r();
            fill(ctx, 'rgb(' + (206 + t * 14 | 0) + ',' + (202 + t * 12 | 0) + ',' + (188 + t * 12 | 0) + ')', x0, y0, 58, 58);
            // fissures: short dark worm strokes
            ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, 58, 58); ctx.clip();
            for (let i = 0; i < 140; i++) { let x = x0 + r() * 58, y = y0 + r() * 58, a = r() * 6.3; ctx.strokeStyle = 'rgba(140,132,116,' + (0.06 + r() * 0.1).toFixed(2) + ')'; ctx.lineWidth = 0.35 + r() * 0.35; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 2; s++) { a += (r() - 0.5) * 1.8; x += Math.cos(a) * 1.3; y += Math.sin(a) * 1.3; ctx.lineTo(x, y); } ctx.stroke(); } for (let i = 0; i < 400; i++) { ctx.fillStyle = 'rgba(110,104,90,0.14)'; ctx.fillRect(x0 + r() * 58, y0 + r() * 58, 0.6, 0.6); }
            ctx.restore();
            bevel(h, x0, y0, 58, 58, 0.5, 1.5, 0.38);
            if (r() < 0.3) { const g = ctx.createRadialGradient(x0 + r() * 58, y0 + r() * 58, 1, x0 + 29, y0 + 29, 30); g.addColorStop(0, 'rgba(150,128,90,0.14)'); g.addColorStop(1, 'rgba(150,128,90,0)'); ctx.fillStyle = g; ctx.fillRect(x0, y0, 58, 58); } // water stain
        }
        wash(ctx, fis, 'multiply', 0.05); wash(h, fis, 'overlay', 0.18);
        // T-bar: painted metal strips with a highlight edge
        ctx.fillStyle = '#e6e3da'; h.fillStyle = grey(0.7);
        for (let i = 0; i <= SIZE; i += 64) { wrapRect(ctx, i - 3, 0, 6, SIZE); wrapRect(ctx, 0, i - 3, SIZE, 6); wrapRect(h, i - 3, 0, 6, SIZE); wrapRect(h, 0, i - 3, SIZE, 6); }
        ctx.fillStyle = 'rgba(90,86,76,0.35)'; for (let i = 0; i <= SIZE; i += 64) { wrapRect(ctx, i + 2, 0, 1, SIZE); wrapRect(ctx, 0, i + 2, SIZE, 1); }
    },
    metalCeil(ctx, h, r) {
        fill(ctx, '#353b41'); fill(h, grey(0.5));
        const brushed = noiseCanvas(71, { px: 256, cells: 64, octaves: 2 });
        ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16; ctx.drawImage(brushed, 0, 0, SIZE, SIZE * 8); ctx.restore();
        // corrugated deck ribs every ~21 units
        for (let x = 0; x < SIZE; x += 21.33) { const g = ctx.createLinearGradient(x, 0, x + 21.33, 0); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.35, 'rgba(255,255,255,0.08)'); g.addColorStop(0.6, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); ctx.fillStyle = g; ctx.fillRect(x, 0, 21.33, SIZE); const hg = h.createLinearGradient(x, 0, x + 21.33, 0); hg.addColorStop(0, grey(0.3)); hg.addColorStop(0.5, grey(0.7)); hg.addColorStop(1, grey(0.3)); h.fillStyle = hg; h.fillRect(x, 0, 21.33, SIZE); }
        // one vent grille
        fill(ctx, 'rgba(8,10,12,0.8)', 30, 90, 70, 50); fill(h, grey(0.2), 30, 90, 70, 50);
        for (let y = 94; y < 138; y += 6) { fill(ctx, 'rgba(150,158,168,0.45)', 32, y, 66, 2); fill(h, grey(0.7), 32, y, 66, 2); }
        wash(ctx, noiseCanvas(72, { cells: 4, octaves: 5 }), 'multiply', 0.3);
    },
    brick(ctx, h, r) {
        fill(ctx, '#4a2620'); fill(h, grey(0.28)); // recessed mortar
        wash(ctx, noiseCanvas(81, { cells: 32, octaves: 3 }), 'overlay', 0.5);
        const bh = 32, bw = 64, fine = noiseCanvas(82, { cells: 16, octaves: 4 });
        for (let y = 0; y < SIZE / bh; y++) for (let x = -1; x < SIZE / bw + 1; x++) {
            const ox = (y % 2) * (bw / 2), bx = x * bw + ox + 2, by = y * bh + 2, w = bw - 4, hh = bh - 4, hue = 8 + r() * 14;
            ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, w, hh, 2.5); ctx.clip();
            fill(ctx, 'rgb(' + (120 + r() * 30 | 0) + ',' + (52 + hue | 0) + ',' + (40 + hue * 0.5 | 0) + ')', bx, by, w, hh);
            ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.8; ctx.drawImage(fine, bx - r() * 128, by - r() * 128, 256, 256);
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            const g = ctx.createLinearGradient(0, by, 0, by + hh); g.addColorStop(0, 'rgba(255,220,200,0.12)'); g.addColorStop(0.2, 'rgba(255,220,200,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = g; ctx.fillRect(bx, by, w, hh);
            ctx.restore();
            bevel(h, bx, by, w, hh, 0.7, 3);
            for (let k = 0; k < 3; k++) { const cx = bx + r() * w, cy = r() < 0.5 ? by + 1 : by + hh - 1; ctx.fillStyle = 'rgba(40,20,16,0.6)'; ctx.beginPath(); ctx.arc(cx, cy, 1 + r() * 2.5, 0, 7); ctx.fill(); h.fillStyle = grey(0.32); h.beginPath(); h.arc(cx, cy, 1 + r() * 2.5, 0, 7); h.fill(); } // chipped edges
        }
        wash(h, fine, 'overlay', 0.25);
        wash(ctx, noiseCanvas(83, { cells: 4, octaves: 5 }), 'multiply', 0.2); // soot
    },
    stone(ctx, h, r) {
        fill(ctx, '#34383f'); fill(h, grey(0.28));
        const bh = 42, mott = noiseCanvas(91, { cells: 8, octaves: 6 }), chisel = noiseCanvas(92, { cells: 32, octaves: 3, ridge: true });
        for (let y = 0; y < Math.ceil(SIZE / bh); y++) {
            let x = (y % 2) * -30;
            while (x < SIZE) {
                const w = 50 + r() * 40, s = 70 + r() * 35 | 0;
                ctx.save(); ctx.beginPath(); ctx.roundRect(x + 2, y * bh + 2, w - 4, bh - 4, 4); ctx.clip();
                fill(ctx, 'rgb(' + s + ',' + (s + 4) + ',' + (s + 12) + ')', x, y * bh, w, bh);
                ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.32; ctx.drawImage(mott, x - r() * 128, y * bh - r() * 128, 256, 256); ctx.globalAlpha = 0.25; ctx.drawImage(chisel, x - r() * 128, y * bh - r() * 128, 256, 256);
                ctx.restore();
                bevel(h, x + 2, y * bh + 2, w - 4, bh - 4, 0.72, 4);
                x += w;
            }
        }
        wash(h, chisel, 'overlay', 0.4);
        for (let i = 0; i < 12; i++) { const x = r() * SIZE, y = SIZE * 0.45 + r() * SIZE * 0.55, rad = 8 + r() * 14; const g = ctx.createRadialGradient(x, y, 1, x, y, rad); g.addColorStop(0, 'rgba(52,84,40,0.45)'); g.addColorStop(1, 'rgba(52,84,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); }
        const damp = ctx.createLinearGradient(0, SIZE * 0.6, 0, SIZE); damp.addColorStop(0, 'rgba(0,0,0,0)'); damp.addColorStop(1, 'rgba(10,14,12,0.25)'); ctx.fillStyle = damp; ctx.fillRect(0, 0, SIZE, SIZE);
    },
    office(ctx, h, r) {
        // plaster upper wall, chair rail, oak wainscot (same 0.62 split as classic)
        const split = SIZE * 0.62;
        fill(ctx, '#b6b0a2', 0, 0, SIZE, split); fill(h, grey(0.5));
        const peel = noiseCanvas(101, { cells: 64, octaves: 2 });
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, SIZE, split); ctx.clip(); wash(ctx, peel, 'overlay', 0.18); wash(ctx, noiseCanvas(102, { cells: 4, octaves: 5 }), 'multiply', 0.12); ctx.restore();
        h.save(); h.beginPath(); h.rect(0, 0, SIZE, split); h.clip(); wash(h, peel, 'overlay', 0.35); h.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1.2; h.strokeStyle = grey(0.4); h.lineWidth = 1.5;
        for (let x = 0; x <= SIZE; x += 64) for (const c of [ctx, h]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, split); c.stroke(); }
        // wainscot boards with grain
        fill(ctx, '#6c4d2e', 0, split, SIZE, SIZE - split);
        const grain = noiseCanvas(103, { cells: 4, octaves: 5 });
        ctx.save(); ctx.beginPath(); ctx.rect(0, split, SIZE, SIZE - split); ctx.clip(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5; ctx.drawImage(grain, 0, split, SIZE, (SIZE - split) * 6); ctx.restore();
        for (let i = 0; i < 40; i++) { const y = split + 10 + r() * (SIZE - split - 12); ctx.strokeStyle = 'rgba(40,24,10,' + (0.1 + r() * 0.2).toFixed(2) + ')'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(SIZE * 0.3, y + (r() - 0.5) * 4, SIZE * 0.7, y + (r() - 0.5) * 4, SIZE, y); ctx.stroke(); }
        for (let x = 0; x < SIZE; x += 64) bevel(h, x + 1, split + 10, 62, SIZE - split - 22, 0.62, 2.5);
        ctx.strokeStyle = 'rgba(30,18,8,0.5)'; ctx.lineWidth = 1; for (let x = 0; x <= SIZE; x += 64) { ctx.strokeRect(x + 1, split + 10, 62, SIZE - split - 22); }
        // chair rail molding and baseboard shadow
        const rail = ctx.createLinearGradient(0, split, 0, split + 9); rail.addColorStop(0, '#8a6a44'); rail.addColorStop(0.4, '#5a3e22'); rail.addColorStop(1, '#3a2614'); ctx.fillStyle = rail; ctx.fillRect(0, split, SIZE, 9);
        const hr = h.createLinearGradient(0, split, 0, split + 9); hr.addColorStop(0, grey(0.85)); hr.addColorStop(1, grey(0.55)); h.fillStyle = hr; h.fillRect(0, split, SIZE, 9);
        const shade = ctx.createLinearGradient(0, split - 10, 0, split); shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.18)'); ctx.fillStyle = shade; ctx.fillRect(0, split - 10, SIZE, 10);
    },
    wood(ctx, h, r) {
        fill(ctx, '#7f5329'); fill(h, grey(0.5));
        const pw = 42, grain = noiseCanvas(111, { cells: 4, octaves: 5 });
        for (let x = 0; x < SIZE / pw + 1; x++) {
            const px = x * pw, t = r();
            ctx.save(); ctx.beginPath(); ctx.rect(px, 0, pw - 3, SIZE); ctx.clip();
            fill(ctx, 'rgb(' + (104 + t * 40 | 0) + ',' + (62 + t * 24 | 0) + ',' + (26 + t * 14 | 0) + ')', px, 0, pw, SIZE);
            ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.6; ctx.drawImage(grain, px - r() * 100, 0, 60, SIZE); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            for (let g = 0; g < 10; g++) { const gx = px + r() * pw; ctx.strokeStyle = 'rgba(56,28,10,' + (0.15 + r() * 0.25).toFixed(2) + ')'; ctx.lineWidth = 0.4 + r() * 0.8; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx + (r() - 0.5) * 10, SIZE * 0.33, gx + (r() - 0.5) * 10, SIZE * 0.66, gx, SIZE); ctx.stroke(); }
            if (r() < 0.6) { const kx = px + 8 + r() * (pw - 16), ky = r() * SIZE; for (let k = 4; k > 0; k--) { ctx.strokeStyle = 'rgba(46,22,8,' + (0.15 * k).toFixed(2) + ')'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(kx, ky, k * 1.6, k * 3.6, 0, 0, 7); ctx.stroke(); } }
            ctx.restore();
            fill(ctx, 'rgba(26,12,4,0.85)', px + pw - 3, 0, 3, SIZE); fill(h, grey(0.22), px + pw - 3, 0, 3, SIZE); fill(h, grey(0.38), px + pw - 4, 0, 1, SIZE);
        }
        wash(h, grain, 'overlay', 0.12);
    },
    concrete(ctx, h, r) {
        fill(ctx, '#848484'); fill(h, grey(0.5));
        wash(ctx, noiseCanvas(121, { cells: 4, octaves: 6 }), 'overlay', 0.55);
        wash(ctx, noiseCanvas(122, { cells: 32, octaves: 3 }), 'soft-light', 0.6);
        wash(h, noiseCanvas(122, { cells: 32, octaves: 3 }), 'overlay', 0.4);
        // pores
        for (let i = 0; i < 700; i++) { const x = r() * SIZE, y = r() * SIZE, rad = 0.3 + r() * 1.1; ctx.fillStyle = 'rgba(40,40,40,0.55)'; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); h.fillStyle = grey(0.25); h.beginPath(); h.arc(x, y, rad, 0, 7); h.fill(); }
        // form-tie holes on a 64 grid, form line at the middle
        for (let y = 32; y < SIZE; y += 128) for (let x = 32; x < SIZE; x += 64) { const g = ctx.createRadialGradient(x, y, 0.5, x, y, 4); g.addColorStop(0, 'rgba(30,30,30,0.9)'); g.addColorStop(1, 'rgba(60,60,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); h.fillStyle = grey(0.2); h.beginPath(); h.arc(x, y, 2.4, 0, 7); h.fill(); }
        fill(ctx, 'rgba(0,0,0,0.2)', 0, SIZE / 2 - 1, SIZE, 2); fill(h, grey(0.35), 0, SIZE / 2 - 1, SIZE, 2);
        ctx.strokeStyle = 'rgba(30,30,30,0.35)'; ctx.lineWidth = 0.7;
        for (let i = 0; i < 3; i++) { let x = r() * SIZE, y = 0; ctx.beginPath(); ctx.moveTo(x, y); while (y < SIZE) { x += (r() - 0.5) * 18; y += 8 + r() * 16; ctx.lineTo(x, y); } ctx.stroke(); }
        const streak = noiseCanvas(123, { px: 256, cells: 16, octaves: 2 }); ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.2; ctx.drawImage(streak, 0, 0, SIZE, SIZE * 6); ctx.restore(); // rain streaks
    },
    metal(ctx, h, r, stripe = true) {
        fill(ctx, '#62686f'); fill(h, grey(0.5));
        const brushed = noiseCanvas(131, { px: 256, cells: 128, octaves: 2 });
        ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.22; ctx.drawImage(brushed, 0, 0, SIZE * 16, SIZE); ctx.restore();
        wash(ctx, noiseCanvas(132, { cells: 4, octaves: 5 }), 'multiply', 0.3);
        // two plates with pressed seams
        for (const px of [4, SIZE / 2 + 2]) bevel(h, px, 4, SIZE / 2 - 6, SIZE - 8, 0.62, 3);
        ctx.strokeStyle = 'rgba(18,20,24,0.85)'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, SIZE - 8, SIZE - 8); ctx.beginPath(); ctx.moveTo(SIZE / 2, 4); ctx.lineTo(SIZE / 2, SIZE - 4); ctx.stroke();
        ctx.strokeStyle = 'rgba(200,208,218,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(6, 6, SIZE / 2 - 10, SIZE - 12); ctx.strokeRect(SIZE / 2 + 4, 6, SIZE / 2 - 10, SIZE - 12);
        for (const [rx, ry] of [[18, 18], [SIZE - 18, 18], [18, SIZE - 18], [SIZE - 18, SIZE - 18], [SIZE / 2 - 12, 18], [SIZE / 2 + 12, SIZE - 18], [SIZE / 2 - 12, SIZE - 18], [SIZE / 2 + 12, 18]]) {
            const g = ctx.createRadialGradient(rx - 1.5, ry - 1.5, 0.5, rx, ry, 5); g.addColorStop(0, '#c4ccd6'); g.addColorStop(0.5, '#6a727c'); g.addColorStop(1, '#23272c'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, 7); ctx.fill();
            const hg = h.createRadialGradient(rx, ry, 0.5, rx, ry, 4.5); hg.addColorStop(0, grey(0.95)); hg.addColorStop(1, grey(0.6)); h.fillStyle = hg; h.beginPath(); h.arc(rx, ry, 4.5, 0, 7); h.fill();
            ctx.fillStyle = 'rgba(110,60,30,0.25)'; ctx.beginPath(); ctx.ellipse(rx, ry + 6, 2, 5, 0, 0, 7); ctx.fill(); // rust run
        }
        if (stripe) {
            ctx.save(); ctx.beginPath(); ctx.rect(0, SIZE - 20, SIZE, 20); ctx.clip();
            for (let x = -SIZE; x < SIZE; x += 28) { ctx.fillStyle = 'rgba(201,162,39,0.7)'; ctx.beginPath(); ctx.moveTo(x, SIZE); ctx.lineTo(x + 14, SIZE); ctx.lineTo(x + 32, SIZE - 18); ctx.lineTo(x + 18, SIZE - 18); ctx.closePath(); ctx.fill(); }
            wash(ctx, noiseCanvas(133, { cells: 16, octaves: 3 }), 'multiply', 0.45); // chipped paint
            ctx.restore();
        }
    },
};
BUILDERS5.metalPlain = (ctx, h, r) => BUILDERS5.metal(ctx, h, r, false);

