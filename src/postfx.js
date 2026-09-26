/**
 * POST-PROCESSING — MODERN (GOAL_LOOP M1.3)
 *
 * The 2005–2007 look in one stack:
 *   RenderPass  → scene into a half-float HDR target
 *   OutputPass  → ACES tone mapping + sRGB (same as the plain renderer)
 *   UnrealBloom → highlights (fixture lenses, elevator pad, paint) bleed,
 *                 thresholded on the tone-mapped image so only true
 *                 highlights glow
 *   GradePass   → per-floor colour grade (tint, saturation, contrast, lift),
 *                 vignette, animated film grain, light horizontal motion blur
 *                 driven by yaw speed
 *
 * The HUD is DOM over the canvas, so it stays crisp. Everything here is
 * togglable (pause menu → "Post FX"); with it off, `render()` falls back to
 * the plain renderer so the game looks exactly like M1.2.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { QUALITY } from './quality.js';

const GradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        tint: { value: new THREE.Vector3(1, 1, 1) },
        saturation: { value: 0.9 },
        contrast: { value: 1.06 },
        lift: { value: 0.0 },
        vignette: { value: 0.4 },
        grain: { value: 0.05 },
        time: { value: 0 },
        motion: { value: 0 },      // horizontal blur amount in UV units
        aspect: { value: 1.6 },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec3 tint;
        uniform float saturation, contrast, lift, vignette, grain, time, motion, aspect;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
            // light horizontal motion blur (5 taps) when the view is whipping round
            vec3 c;
            if (motion > 0.0002) {
                vec2 d = vec2(motion, 0.0);
                c  = texture2D(tDiffuse, vUv - d * 2.0).rgb * 0.12;
                c += texture2D(tDiffuse, vUv - d).rgb * 0.22;
                c += texture2D(tDiffuse, vUv).rgb * 0.32;
                c += texture2D(tDiffuse, vUv + d).rgb * 0.22;
                c += texture2D(tDiffuse, vUv + d * 2.0).rgb * 0.12;
            } else {
                c = texture2D(tDiffuse, vUv).rgb;
            }
            // grade: lift, tint, contrast around mid-grey, saturation
            c = c + lift;
            c *= tint;
            c = (c - 0.5) * contrast + 0.5;
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(vec3(l), c, saturation);
            // vignette (aspect-corrected, soft)
            vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
            float v = smoothstep(1.35, 0.35, length(q));
            c *= mix(1.0, v, vignette);
            // animated film grain, luminance-weighted so shadows carry more
            float g = hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 61.0) - 0.5;
            c += g * grain * (1.0 - l * 0.6);
            gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }
    `,
};

export const DEFAULT_GRADE = {
    tint: [1, 1, 1], saturation: 0.9, contrast: 1.06, lift: 0.0,
    vignette: 0.4, grain: 0.05,
    bloom: { strength: 0.35, radius: 0.4, threshold: 0.9 },
};

export class PostFX {
    constructor(renderer, scene, camera, { vmCamera = null, quality = 'high' } = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.enabled = true;
        this.motion = 0;

        const size = renderer.getSize(new THREE.Vector2());
        // 5.0: edges are anti-aliased by one SMAA pass at the end. (Canvas MSAA
        // never applied through the composer; multisampled composer targets made
        // every full-screen pass resolve and halved the frame rate.)
        const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
        this.composer = new EffectComposer(renderer, target);
        this.renderPass = new RenderPass(scene, camera);
        // K7: the hands and weapon are drawn by their own narrow camera (48°) on top of the world
        // (depth cleared), the way shooters of the era avoided wide-FOV distortion on the arms.
        // Layer 1 holds the viewmodel meshes, flashes, and their lights; the world camera draws layer 0.
        this.vmCamera = vmCamera || new THREE.PerspectiveCamera(56, size.x / Math.max(1, size.y), 0.02, 20); // Q1: wider lens so tools and hands stop filling the frame
        this.vmCamera.layers.set(1);
        if (!vmCamera) camera.add(this.vmCamera);
        this.vmPass = new RenderPass(scene, this.vmCamera);
        this.vmPass.clear = false; this.vmPass.clearDepth = true;
        // The viewmodel layer must not redraw the scene background or fog over
        // the world (Arena's scene has a solid background colour).
        const vmRender = this.vmPass.render.bind(this.vmPass);
        this.vmPass.render = (...args) => this.withoutBackground(() => vmRender(...args));
        // 5.0: ground-truth ambient occlusion on the world layer only (the
        // viewmodel is drawn afterwards). Contact shadows under desks, in room
        // corners and along the ceiling line are the biggest single realism step.
        this.gtao = new GTAOPass(scene, camera, size.x, size.y);
        this.gtao.output = GTAOPass.OUTPUT.Default;
        this.gtao.blendIntensity = 0.92;
        this.gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1 });
        this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
        // 5.2: the denoiser was a second 16-tap pass over the AO buffer; 8 taps at half resolution look the same
        this.gtao.updatePdMaterial({ samples: 8 });
        // 5.2: AO reads the depth the main pass already wrote and rebuilds normals from it, instead of
        // drawing every mesh a second time with a normal material (that re-draw was ~600 calls a frame).
        for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
            rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.UnsignedIntType;
        }
        this.gtao.setGBuffer(this.composer.renderTarget1.depthTexture);
        this.bloom = new UnrealBloomPass(size.clone(), 0.35, 0.4, 0.85);
        this.output = new OutputPass();
        this.grade = new ShaderPass(GradeShader);
        // Order matters: bloom runs AFTER tone mapping (LDR bloom, the 2005
        // way). On the HDR buffer, anything the key light pushes past 1.0
        // blooms and whole rooms wash out; post-tonemap only true highlights do.
        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.gtao);
        this.composer.addPass(this.vmPass);
        this.composer.addPass(this.output);
        this.composer.addPass(this.bloom);
        this.composer.addPass(this.grade);
        this.smaa = new SMAAPass(); this.composer.addPass(this.smaa);
        this.setQuality(quality);
        this.setSize(size.x, size.y);
        this.applyGrade(DEFAULT_GRADE);
    }

    /** Apply a quality preset (see quality.js). Pixel ratio is set by the caller. */
    setQuality(name) {
        const q = QUALITY[name] || QUALITY.high;
        this.quality = q;
        this.updateSmaa();
        this.gtao.enabled = q.ao;
        this.bloom.enabled = q.bloom && !this.performanceMode;
        this.aoScale = q.aoScale; this.bloomScale = q.bloomScale ?? 1;
        this.gtao.updateGtaoMaterial({ samples: q.aoSamples ?? 16 });
        if (this.width) this.setSize(this.width, this.height);
    }

    setSize(w, h) {
        this.width = w; this.height = h;
        this.vmCamera.aspect = w / Math.max(1, h); this.vmCamera.updateProjectionMatrix();
        this.composer.setSize(w, h);
        this.bloom.setSize(Math.round(w * (this.bloomScale ?? 1)), Math.round(h * (this.bloomScale ?? 1)));
        // AO runs at a fraction of the drawing-buffer size on lower presets.
        // 5.2: capped at 0.8x the window size. AO is soft shading; at Retina 2x the half-res buffer
        // was still one sample per screen point and the single most expensive pass.
        const ratio = Math.min(0.8, this.renderer.getPixelRatio() * (this.aoScale ?? 1));
        this.gtao.setSize(Math.round(w * ratio), Math.round(h * ratio));
        this.grade.uniforms.aspect.value = w / h;
    }

    setPixelRatio(value) {
        this.composer.setPixelRatio(value);
        this.updateSmaa();
        if (this.width) this.setSize(this.width, this.height);
    }

    /** 5.2: SMAA only below Retina density. At 2x the pixels are too small for stair-steps to read, and the pass cost 1.4 ms. */
    updateSmaa(force = null) {
        const dense = this.renderer.getPixelRatio() >= 1.75;
        this.smaa.enabled = force ?? ((this.quality?.samples ?? 0) > 0 && !dense);
    }

    setPerformanceMode(on = true) {
        this.performanceMode = on;
        this.bloom.enabled = !on && (this.quality?.bloom ?? true);
        if (on) this.gtao.enabled = false;
    }

    withoutBackground(draw) {
        const background = this.scene.background, fog = this.scene.fog;
        this.scene.background = null; this.scene.fog = null;
        try { draw(); } finally { this.scene.background = background; this.scene.fog = fog; }
    }

    /** Apply a floor's grade block (see lighting.js rigs). Missing keys fall back to defaults. */
    applyGrade(g = {}) {
        const cfg = { ...DEFAULT_GRADE, ...g, bloom: { ...DEFAULT_GRADE.bloom, ...(g.bloom || {}) } };
        const u = this.grade.uniforms;
        u.tint.value.set(...cfg.tint);
        u.saturation.value = cfg.saturation;
        u.contrast.value = cfg.contrast;
        u.lift.value = cfg.lift;
        u.vignette.value = cfg.vignette;
        u.grain.value = cfg.grain;
        this.bloom.strength = cfg.bloom.strength;
        this.bloom.radius = cfg.bloom.radius;
        this.bloom.threshold = cfg.bloom.threshold;
        this.current = cfg;
    }

    /**
     * @param time   seconds (grain animation)
     * @param yawRate radians/second of camera yaw (drives motion blur)
     */
    render(time = 0, yawRate = 0) {
        if (!this.enabled) {
            this.renderer.render(this.scene, this.camera);
            if (this.vmPass.enabled) { this.renderer.autoClear = false; this.renderer.clearDepth(); this.withoutBackground(() => this.renderer.render(this.scene, this.vmCamera)); this.renderer.autoClear = true; }
            return;
        }
        const u = this.grade.uniforms;
        u.time.value = time;
        // Keep fast turns readable: a restrained smear, eased in and out.
        const target = Math.min(0.0018, Math.abs(yawRate) * 0.00028);
        this.motion += (target - this.motion) * 0.25;
        u.motion.value = this.motion;
        if (this.gtao.enabled) { // the scene lands in whichever buffer the composer reads from this frame
            const depth = this.composer.readBuffer.depthTexture;
            this.gtao.gtaoMaterial.uniforms.tDepth.value = depth; this.gtao.pdMaterial.uniforms.tDepth.value = depth;
        }
        this.composer.render();
    }
}
