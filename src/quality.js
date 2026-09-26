/**
 * QUALITY PRESETS — Table Quest 5 (docs/v5/GOAL_LOOP.md V2)
 *
 * One setting shared by the campaign and Arena. Ultra is the default on a
 * capable GPU (this project's reference is an M3 Max) and keeps the full
 * post stack at native Retina resolution; lower presets trade resolution,
 * ambient occlusion and shadow size for frame rate. Saved per browser.
 */
const KEY = 'tq5-quality';
export const QUALITY_ORDER = ['ultra', 'high', 'medium', 'low'];
export const QUALITY = {
    //         pixel cap, pixel budget, MSAA, AO,    AO scale, shadow map, anisotropy, bloom
    ultra:  { label: 'ULTRA',  maxDpr: 2,    maxPixels: 9_000_000, samples: 4, ao: true,  aoScale: 1,   shadow: 4096, anisotropy: 16, bloom: true },
    high:   { label: 'HIGH',   maxDpr: 1.5,  maxPixels: 5_000_000, samples: 4, ao: true,  aoScale: 0.5, shadow: 2048, anisotropy: 12, bloom: true },
    medium: { label: 'MEDIUM', maxDpr: 1.25, maxPixels: 3_200_000, samples: 2, ao: false, aoScale: 0.5, shadow: 2048, anisotropy: 8,  bloom: true },
    low:    { label: 'LOW',    maxDpr: 1,    maxPixels: 2_000_000, samples: 0, ao: false, aoScale: 0.5, shadow: 1024, anisotropy: 4,  bloom: false },
};

/** Best guess from the GPU: Apple silicon Pro/Max/Ultra and discrete GPUs start on Ultra. */
export function detectQuality(renderer) {
    try {
        const gl = renderer.getContext();
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
        if (/apple m\d+ (pro|max|ultra)|nvidia|radeon rx|geforce|rtx/i.test(name)) return 'ultra';
        if (/apple m\d+/i.test(name)) return 'high';
        if (/intel/i.test(name)) return 'medium';
    } catch {}
    return 'high';
}

export function loadQuality(renderer) {
    try { const saved = localStorage.getItem(KEY); if (QUALITY[saved]) return saved; } catch {}
    return detectQuality(renderer);
}
export function saveQuality(name) { try { localStorage.setItem(KEY, name); } catch {} }

/** Device pixel ratio for a preset at the current window size. */
export function pixelRatioFor(name, scale = 1) {
    const q = QUALITY[name] || QUALITY.high;
    const css = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.min(window.devicePixelRatio || 1, q.maxDpr, Math.sqrt(q.maxPixels / css)) * scale;
}
