/**
 * AUDIO SYSTEM — MODERN (GOAL_LOOP M6)
 *
 * The classic V3 engine (subtractive synth, convolution reverb, multitrack
 * sequencer) extended, not replaced:
 *   M6.1  instrument families — strings, brass, choir, piano, distorted guitar,
 *         taiko, orchestral hits, risers — on top of the classic voices
 *   M6.2  the eight classic song builders are kept byte-for-byte; an
 *         ORCHESTRATION map re-voices each track at schedule time, so every
 *         pitch, duration, BPM, swing, and form is the classic's. The victory
 *         fanfare (the ninth piece) is re-voiced the same way.
 *   M6.3  every classic SFX keeps its name and role but is layered
 *         (transient / body / tail); footsteps and reverb follow the floor's
 *         room profile; each floor has a looping ambience bed
 *   M6.4  dynamic mix: ducking under combat, muffling at low health, swells
 *         on objectives, a boss phase-2 orchestration layer with stinger
 * Everything is synthesized at runtime; there are no audio assets.
 */

import { gameLog } from './logger.js';

let G = null;          // live graph (see buildGraph)
let audioCtx = null;   // alias of G.ctx, kept for the classic code paths
let muted = false;
// Leave real mix headroom before the safety limiter. Dense combat can stack a
// full arrangement, weapon transients, barks and reverb in the same 10 ms.
const MASTER_LEVEL = 0.5;
const MUSIC_LEVEL = 0.68;
const SFX_LEVEL = 0.82;
const AMBIENCE_LEVEL_BUS = 0.68;

function holdParam(param, time) {
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
    else {
        const value = param.value;
        param.cancelScheduledValues(time);
        param.setValueAtTime(value, time);
    }
}

export function isMuted() { return muted; }

export function toggleMute() {
    muted = !muted;
    if (G) {
        const t = G.ctx.currentTime;
        holdParam(G.master.gain, t);
        G.master.gain.setTargetAtTime(muted ? 0.0001 : MASTER_LEVEL, t, 0.012);
    }
    gameLog('audio.mute-changed', { muted });
    return muted;
}

// ------------------------------------------------------------------ ROOMS (M6.3)

/** reverb + footstep profile per floor material; keyed by the song/level name */
const ROOMS = {
    menu:     { dur: 2.4, decay: 3.0, bright: 6500, send: 0.30, ret: 0.33, step: 'marble', label: 'lobby marble (menu)' },
    intro:    { dur: 3.4, decay: 2.4, bright: 3800, send: 0.20, ret: 0.36, step: 'wood',   label: 'workshop hall' },
    lobby:    { dur: 2.4, decay: 3.0, bright: 6500, send: 0.35, ret: 0.33, step: 'marble', label: 'marble atrium' },
    office:   { dur: 0.9, decay: 5.0, bright: 3000, send: 0.14, ret: 0.26, step: 'carpet', label: 'carpeted office' },
    archives: { dur: 3.2, decay: 2.6, bright: 2200, send: 0.40, ret: 0.36, step: 'concrete', label: 'concrete vault' },
    showroom: { dur: 1.6, decay: 3.5, bright: 4500, send: 0.25, ret: 0.30, step: 'wood',   label: 'wood-floor hall' },
    factory:  { dur: 3.8, decay: 2.2, bright: 5000, send: 0.45, ret: 0.34, step: 'metal',  metallic: true, label: 'steel plant' },
    boss:     { dur: 2.8, decay: 3.0, bright: 6000, send: 0.30, ret: 0.34, step: 'marble', label: 'glass penthouse' },
};
let roomKey = 'lobby';

function makeImpulse(ctx, r) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * r.dur));
    const buf = ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        for (let i = pre; i < len; i++) {
            const t = (i - pre) / (len - pre);
            // the tail darkens as it decays, like air absorption in a real room
            const k = Math.exp(-2 * Math.PI * r.bright * (1 - 0.7 * t) / rate);
            lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
            d[i] = lp * Math.pow(1 - t, r.decay);
        }
        if (r.metallic) { // hard parallel walls: short comb echoes give the plant its ring
            for (const ms of [11, 17, 23]) {
                const off = Math.floor(rate * ms / 1000);
                for (let i = len - 1; i >= off; i--) d[i] += d[i - off] * 0.3;
            }
        }
    }
    return buf;
}

function applyRoom(g, key) {
    const r = ROOMS[key] || ROOMS.lobby;
    g.reverb.buffer = makeImpulse(g.ctx, r);
    g.reverbLP.frequency.value = Math.min(12000, r.bright * 1.6);
    g.reverbReturn.gain.value = r.ret;
    g.sfxSend.gain.value = r.send;
    g.room = key;
}

/** switch the reverb and footstep material to a floor's profile (M6.3) */
export function setRoom(key) {
    if (!ROOMS[key]) return;
    roomKey = key;
    if (G && G.room !== key) applyRoom(G, key);
}

// ------------------------------------------------------------------ GRAPH

function buildGraph(ctx, offline = false) {
    const g = { ctx, offline };
    const gain = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };

    // A musical bus compressor catches sustained density; a separate fast
    // brick-wall-style stage catches the few transients that previously escaped
    // the compressor attack and reached the browser output as random clipping.
    g.comp = ctx.createDynamicsCompressor();
    g.comp.threshold.value = -18; g.comp.knee.value = 12; g.comp.ratio.value = 4;
    g.comp.attack.value = 0.008; g.comp.release.value = 0.14;
    g.limiter = ctx.createDynamicsCompressor();
    g.limiter.threshold.value = -3; g.limiter.knee.value = 0; g.limiter.ratio.value = 20;
    g.limiter.attack.value = 0.001; g.limiter.release.value = 0.06;
    g.output = gain(0.94);
    g.comp.connect(g.limiter); g.limiter.connect(g.output); g.output.connect(ctx.destination);

    g.master = gain(muted && !offline ? 0 : MASTER_LEVEL);
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 130; lowShelf.gain.value = 1.6;
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf'; highShelf.frequency.value = 5200; highShelf.gain.value = 2.4;
    g.master.connect(lowShelf); lowShelf.connect(highShelf); highShelf.connect(g.comp);
    // Meter the protected output, not the much hotter pre-compressor bus.
    g.analyser = ctx.createAnalyser(); g.analyser.fftSize = 1024; g.output.connect(g.analyser);

    // music: song bus → duck (dynamic mix) → lowpass (low-health muffle) → master
    g.music = gain(MUSIC_LEVEL);
    g.duck = gain(1);
    g.musicLP = ctx.createBiquadFilter(); g.musicLP.type = 'lowpass'; g.musicLP.frequency.value = 20000; g.musicLP.Q.value = 0.4;
    g.music.connect(g.duck); g.duck.connect(g.musicLP); g.musicLP.connect(g.master);
    g.musicAnalyser = ctx.createAnalyser(); g.musicAnalyser.fftSize = 1024;
    g.musicLP.connect(g.musicAnalyser);
    g.sfxAnalyser = ctx.createAnalyser(); g.sfxAnalyser.fftSize = 1024;

    // sfx: dry to master, plus a room send whose level follows the floor material
    g.sfx = gain(SFX_LEVEL); g.sfx.connect(g.master); g.sfx.connect(g.sfxAnalyser);
    g.sfxSend = gain(0.3); g.sfx.connect(g.sfxSend);

    // ambience bed bus with its own small send
    g.amb = gain(AMBIENCE_LEVEL_BUS); g.amb.connect(g.master);
    g.ambSend = gain(0.18); g.amb.connect(g.ambSend);

    // reverb bus
    g.reverb = ctx.createConvolver();
    g.reverbLP = ctx.createBiquadFilter(); g.reverbLP.type = 'lowpass'; g.reverbLP.frequency.value = 9000;
    g.reverbReturn = gain(0.33);
    g.reverb.connect(g.reverbLP); g.reverbLP.connect(g.reverbReturn); g.reverbReturn.connect(g.master);
    g.sfxSend.connect(g.reverb); g.ambSend.connect(g.reverb);

    // delay bus
    g.delay = ctx.createDelay(); g.delay.delayTime.value = 0.28;
    g.delayFb = gain(0.35); g.delayGain = gain(0.22);
    g.delay.connect(g.delayFb); g.delayFb.connect(g.delay); g.delay.connect(g.delayGain); g.delayGain.connect(g.master);

    applyRoom(g, roomKey);
    return g;
}

export function initAudio() {
    if (G) {
        resumeAudio('init');
        return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.addEventListener('statechange', () => {
        gameLog('audio.context-state', { state: ctx.state, song: currentSongName, muted, hidden: document.hidden });
    });
    G = buildGraph(ctx);
    audioCtx = ctx;
    if (!audioMonitorTimer) audioMonitorTimer = setInterval(monitorAudioOutput, 1000);
    if (pendingAmbience) { const k = pendingAmbience; pendingAmbience = null; startAmbience(k); }
}

// A browser/device interruption can happen after the initial start gesture.
// Resume on later gestures too, and record failures instead of swallowing them.
let resumePending = false;
export function resumeAudio(reason = 'gesture') {
    const ctx = G?.ctx;
    if (!ctx || G.offline || resumePending || !['suspended', 'interrupted'].includes(ctx.state)) return;
    resumePending = true;
    gameLog('audio.resume-requested', { reason, state: ctx.state, song: currentSongName });
    ctx.resume().then(() => gameLog('audio.resumed', { reason, state: ctx.state }))
        .catch(error => gameLog('audio.resume-failed', { reason, message: error.message }, 'warn'))
        .finally(() => { resumePending = false; });
}
window.addEventListener('pointerdown', () => resumeAudio(), { passive: true });
window.addEventListener('keydown', () => resumeAudio(), { passive: true });
document.addEventListener('visibilitychange', () => {
    gameLog('audio.visibility', { hidden: document.hidden, state: G?.ctx.state });
    if (!document.hidden) resumeAudio('visible');
});

/** User recovery also captures failures beyond the analyser, such as device output. */
export function recoverAudio() {
    gameLog('audio.recovery-requested', audioHealth(), 'warn');
    const song = playing ? currentSongName : null;
    const old = G;
    stopAmbience(0);
    stopMusic();
    G = null; audioCtx = null; noiseBuffer = null; resumePending = false;
    if (old) old.ctx.close().catch(error => gameLog('audio.close-failed', { message: error.message }, 'warn'));
    initAudio();
    if (song) startSong(song);
    applyMix('recovery');
    silentMusicSeconds = 0;
    gameLog('audio.recovered', audioHealth());
}

let noiseBuffer = null;
function getNoise() {
    if (noiseBuffer && noiseBuffer.sampleRate === audioCtx.sampleRate) return noiseBuffer;
    const len = audioCtx.sampleRate;
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

const shaperCache = new Map();
function shaperCurve(drive) {
    if (shaperCache.has(drive)) return shaperCache.get(drive);
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    shaperCache.set(drive, c);
    return c;
}

// ------------------------------------------------------------------ SYNTH

/**
 * One voice. Classic instruments use `type1/type2` (two detuned oscillators);
 * modern families add `layers` (oscillator stacks with unison), `partials`
 * (additive sines with their own decays — piano, celesta), `formant` (parallel
 * vowel filters — choir), `drive`+`cab` (waveshaper and speaker filter —
 * guitar), `pitchEnv` (scoops and drops — brass, taiko), `vibrato` (delayed),
 * `tremolo`, `chorus`, `noiseMix` (bow/breath), and `sweep` (risers).
 */
function playNote(instr, freq, time, duration, vol = 1.0, bus = null) {
    if (!G) return;
    const ctx = G.ctx;
    bus = bus || G.music;

    const vcf = ctx.createBiquadFilter();
    const vca = ctx.createGain();
    const oscs = [];   // { s, cents }
    const stops = [];  // nodes to stop at the end
    const width = instr.width ?? 0.2;
    const endT = time + duration + (instr.release ?? 0.2) + 0.3;

    const addSrc = (type, cents, pan, gain, ratio = 1, hp = 0) => {
        let s;
        if (type === 'noise') {
            s = ctx.createBufferSource(); s.buffer = getNoise(); s.loop = true;
        } else {
            s = ctx.createOscillator(); s.type = type;
            s.frequency.setValueAtTime(freq * ratio, time);
            s.detune.setValueAtTime(cents, time);
            oscs.push({ s, cents });
        }
        const g = ctx.createGain(); g.gain.value = gain;
        const p = ctx.createStereoPanner(); p.pan.value = pan;
        let head = s;
        if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; s.connect(f); head = f; }
        head.connect(g); g.connect(p); p.connect(vcf);
        s.start(time); s.stop(endT);
        stops.push(s);
        return { s, g };
    };

    if (instr.layers) {
        for (const L of instr.layers) {
            const n = L.unison || instr.unison || 1, spread = L.spread ?? instr.spread ?? 10;
            for (let u = 0; u < n; u++) {
                const f = n === 1 ? 0 : (u / (n - 1) - 0.5) * 2;
                addSrc(L.type, f * spread + (L.detune || 0) + (L.oct || 0) * 1200, n === 1 ? (L.pan ?? 0) : f * width, (L.gain ?? 1) / Math.sqrt(n));
            }
        }
    } else if (!instr.partials) {
        addSrc(instr.type1 || 'sawtooth', -(instr.detune ?? 10), -width, 1);
        addSrc(instr.type2 || 'square', instr.detune ?? 10, width, 1);
    }
    if (instr.partials) {
        const scale = Math.pow(261.6 / Math.max(freq, 20), instr.partialPitchScale ?? 0.5); // high notes ring shorter
        for (const [ratio, g, dec] of instr.partials) {
            const v = addSrc('sine', 0, 0, 0, ratio);
            v.g.gain.setValueAtTime(g, time);
            v.g.gain.exponentialRampToValueAtTime(0.001, time + dec * scale);
        }
    }
    if (instr.noiseMix) addSrc('noise', 0, 0, instr.noiseMix, 1, instr.noiseHP || 1500);

    // filter chain: vcf → [drive → cab] → [formants] → vca
    let head = vcf;
    if (instr.drive) {
        const ws = ctx.createWaveShaper(); ws.curve = shaperCurve(instr.drive); ws.oversample = '2x';
        const pre = ctx.createGain(); pre.gain.value = instr.preGain ?? 1;
        head.connect(pre); pre.connect(ws); head = ws;
        const cab = ctx.createBiquadFilter(); cab.type = 'bandpass'; cab.frequency.value = instr.cab || 1000; cab.Q.value = instr.cabQ ?? 0.6;
        head.connect(cab); head = cab;
    }
    if (instr.formant) {
        const sum = ctx.createGain();
        for (const [f, q, g] of instr.formant) {
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
            const gg = ctx.createGain(); gg.gain.value = g;
            head.connect(bp); bp.connect(gg); gg.connect(sum);
        }
        head = sum;
    }
    head.connect(vca);
    vca.connect(bus);
    if (instr.reverb) { const send = ctx.createGain(); send.gain.value = typeof instr.reverb === 'number' ? instr.reverb : 1; vca.connect(send); send.connect(G.reverb); }
    if (instr.delay) vca.connect(G.delay);
    if (instr.chorus) { // a modulated short delay, panned opposite, thickens strings and keys
        const d = ctx.createDelay(0.05); d.delayTime.value = 0.018;
        const lfo = ctx.createOscillator(); lfo.frequency.value = instr.chorus.rate || 0.8;
        const lg = ctx.createGain(); lg.gain.value = instr.chorus.depth || 0.004;
        lfo.connect(lg); lg.connect(d.delayTime);
        const p = ctx.createStereoPanner(); p.pan.value = instr.chorus.pan ?? 0.4;
        const cg = ctx.createGain(); cg.gain.value = instr.chorus.mix ?? 0.5;
        vca.connect(d); d.connect(p); p.connect(cg); cg.connect(bus);
        lfo.start(time); lfo.stop(endT); stops.push(lfo);
    }

    // modulation
    if (instr.lfo) { // classic LFO
        const lfo = ctx.createOscillator();
        lfo.type = instr.lfoType || 'sine';
        lfo.frequency.value = instr.lfoRate || 5;
        const lg = ctx.createGain(); lg.gain.value = instr.lfoDepth || 10;
        lfo.connect(lg);
        if (instr.lfoTarget === 'freq') for (const o of oscs) lg.connect(o.s.detune);
        else lg.connect(vcf.frequency);
        lfo.start(time); lfo.stop(endT); stops.push(lfo);
    }
    if (instr.vibrato) { // delayed vibrato: the bow settles, then sings
        const v = instr.vibrato;
        const lfo = ctx.createOscillator(); lfo.frequency.value = v.rate || 5.5;
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0, time);
        lg.gain.linearRampToValueAtTime(v.depth || 12, time + (v.delay || 0.3) + 0.25);
        lfo.connect(lg);
        for (const o of oscs) lg.connect(o.s.detune);
        lfo.start(time); lfo.stop(endT); stops.push(lfo);
    }
    if (instr.tremolo) {
        const lfo = ctx.createOscillator(); lfo.frequency.value = instr.tremolo.rate || 5;
        const lg = ctx.createGain(); lg.gain.value = (instr.tremolo.depth || 0.3) * (instr.vol ?? 0.5) * vol;
        lfo.connect(lg); lg.connect(vca.gain);
        lfo.start(time); lfo.stop(endT); stops.push(lfo);
    }
    if (instr.pitchEnv) { // scoop (brass) or drop (taiko): start off-pitch, settle
        for (const o of oscs) {
            o.s.detune.setValueAtTime(o.cents + instr.pitchEnv.amt, time);
            o.s.detune.linearRampToValueAtTime(o.cents, time + (instr.pitchEnv.time || 0.08));
        }
    }

    vcf.type = instr.filterType || 'lowpass';
    vcf.Q.value = instr.res || 1;
    const cutoff = instr.cutoff || 1200;
    if (instr.sweep) { // riser: the filter climbs across the whole note
        vcf.frequency.setValueAtTime(instr.sweep.from || 200, time);
        vcf.frequency.exponentialRampToValueAtTime(instr.sweep.to || 8000, time + duration);
    } else {
        vcf.frequency.setValueAtTime(cutoff, time);
        if (instr.filterEnv) {
            vcf.frequency.linearRampToValueAtTime(cutoff + (instr.filterEnvAmt || 2000), time + (instr.filterEnvAtk || 0.04));
            vcf.frequency.exponentialRampToValueAtTime(cutoff, time + (instr.filterEnvDec || 0.3));
        }
    }

    const atk = instr.attack ?? 0.01, dec = instr.decay ?? 0.1;
    const sus = instr.sustain ?? 0.5, rel = instr.release ?? 0.2;
    const v = (instr.vol ?? 0.5) * vol;
    vca.gain.setValueAtTime(0, time);
    vca.gain.linearRampToValueAtTime(v, time + atk);
    vca.gain.exponentialRampToValueAtTime(Math.max(v * sus, 0.001), time + atk + dec);
    vca.gain.setValueAtTime(Math.max(v * sus, 0.001), time + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, time + duration + rel);
}

function playDrum(type, time, vol = 1) {
    if (!G) return;
    const ctx = G.ctx, t = time, musicGain = G.music, reverbNode = G.reverb;
    // place each drum in the stereo field like a real kit
    const kitOut = (pan) => {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(musicGain);
        return p;
    };
    const hit = (out, f0, f1, dur, g0, type = 'sine', rev = 0) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.connect(g); g.connect(out);
        if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverbNode); }
        o.frequency.setValueAtTime(f0, t);
        if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
        g.gain.setValueAtTime(g0 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + dur);
        o.start(t); o.stop(t + dur + 0.02);
    };
    const burst = (out, ftype, freq, dur, g0, q = 1, rev = 0, atk = 0) => {
        const n = ctx.createBufferSource(); n.buffer = getNoise(); n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain();
        n.connect(f); f.connect(g); g.connect(out);
        if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverbNode); }
        if (atk) { g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(g0 * vol, t + atk); }
        else g.gain.setValueAtTime(g0 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + atk + dur);
        n.start(t); n.stop(t + atk + dur + 0.02);
    };
    if (type === 'kick') {
        hit(musicGain, 150, 40, 0.2, 0.75); // kick stays dead center
    } else if (type === 'snare') {
        const out = kitOut(0.08);
        burst(out, 'highpass', 900, 0.18, 0.5, 1, 1);
        hit(out, 190, 0, 0.1, 0.25);
    } else if (type === 'hat') {
        burst(kitOut(-0.25), 'highpass', 6000, 0.05, 0.16);
    } else if (type === 'ride') {
        burst(kitOut(0.3), 'highpass', 7500, 0.34, 0.09, 1, 1);
    } else if (type === 'tom') {
        hit(kitOut(Math.random() * 0.6 - 0.3), 185, 72, 0.26, 0.45, 'sine', 1); // toms roll across the kit
    // ---- modern kit and orchestral percussion (M6.1)
    } else if (type === 'kick_big') { // rock kick: click, punch, sub tail
        burst(musicGain, 'highpass', 3000, 0.015, 0.22);
        hit(musicGain, 165, 42, 0.28, 0.9);
        hit(musicGain, 60, 38, 0.36, 0.35);
    } else if (type === 'snare_big') { // wide rock snare with body and a room tail
        const out = kitOut(0.06);
        burst(out, 'bandpass', 4200, 0.03, 0.35, 0.8);
        burst(out, 'highpass', 700, 0.24, 0.55, 0.7, 0.9);
        hit(out, 205, 150, 0.14, 0.4, 'triangle');
        hit(out, 180, 120, 0.08, 0.2);
    } else if (type === 'taiko') { // deep skin drop with a mallet slap, long hall tail
        hit(musicGain, 108, 42, 0.55, 0.95, 'sine', 0.7);
        burst(musicGain, 'lowpass', 900, 0.06, 0.4, 1, 0.4);
        hit(musicGain, 180, 60, 0.12, 0.25, 'triangle');
    } else if (type === 'timpani') { // pitched roll-off with a slow settle
        hit(kitOut(-0.15), 98, 82, 0.9, 0.6, 'sine', 0.8);
        hit(kitOut(-0.15), 196, 164, 0.3, 0.12, 'triangle');
        burst(kitOut(-0.15), 'lowpass', 500, 0.04, 0.2);
    } else if (type === 'crash') {
        burst(kitOut(0.35), 'highpass', 4500, 1.3, 0.3, 0.6, 0.9);
        burst(kitOut(0.35), 'bandpass', 8500, 0.5, 0.18, 1.2);
    } else if (type === 'shaker') {
        burst(kitOut(0.4), 'bandpass', 7000, 0.06, 0.1, 2);
    }
}


// ------------------------------------------------------------------ INSTRUMENTS

const INSTRUMENTS = {
    PAD_WARM: {
        type1: 'sawtooth', type2: 'sawtooth', detune: 12,
        attack: 0.7, decay: 0.5, sustain: 0.7, release: 1.6,
        cutoff: 650, res: 2, vol: 0.22, reverb: true, width: 0.5,
        lfo: true, lfoRate: 0.5, lfoDepth: 120,
    },
    PAD_DARK: {
        type1: 'sawtooth', type2: 'triangle', detune: 8,
        attack: 1.2, decay: 0.6, sustain: 0.8, release: 2.2,
        cutoff: 380, res: 4, vol: 0.26, reverb: true, width: 0.45,
        lfo: true, lfoRate: 0.3, lfoDepth: 90,
    },
    LEAD: {
        type1: 'square', type2: 'triangle', detune: 5,
        attack: 0.04, decay: 0.1, sustain: 0.6, release: 0.25,
        cutoff: 2100, res: 3, vol: 0.3, reverb: true, delay: true, width: 0.12,
        lfo: true, lfoRate: 6, lfoDepth: 14, lfoTarget: 'freq',
    },
    LEAD_HARD: {
        type1: 'sawtooth', type2: 'square', detune: 7,
        attack: 0.01, decay: 0.08, sustain: 0.55, release: 0.15,
        cutoff: 2600, res: 4, vol: 0.27, reverb: true, width: 0.1,
        lfo: true, lfoRate: 7, lfoDepth: 18, lfoTarget: 'freq',
    },
    BASS: {
        type1: 'sawtooth', type2: 'square', detune: 8,
        attack: 0.01, decay: 0.28, sustain: 0.3, release: 0.1,
        cutoff: 420, res: 5, vol: 0.55, filterEnv: true, filterEnvAmt: 1400,
        width: 0, // bass stays mono and anchored
    },
    BASS_SUB: {
        type1: 'sine', type2: 'triangle', detune: 3,
        attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.15,
        cutoff: 300, vol: 0.6, width: 0,
    },
    ARP: {
        type1: 'square', type2: 'sawtooth', detune: 5,
        attack: 0.005, decay: 0.09, sustain: 0.1, release: 0.08,
        cutoff: 1400, res: 1, vol: 0.24, delay: true, width: 0.38,
    },
    EP: { // electric-piano-ish pluck for the lobby lounge
        type1: 'sine', type2: 'triangle', detune: 6,
        attack: 0.005, decay: 0.35, sustain: 0.25, release: 0.4,
        cutoff: 1800, res: 0.7, vol: 0.34, reverb: true, width: 0.28,
    },
    CLAV: {
        type1: 'square', type2: 'square', detune: 4,
        attack: 0.004, decay: 0.12, sustain: 0.12, release: 0.07,
        cutoff: 1700, res: 6, vol: 0.3, filterEnv: true, filterEnvAmt: 1800,
        width: 0.2,
    },
    BELL: { // glassy bell for counter-melodies
        type1: 'sine', type2: 'sine', detune: 7,
        attack: 0.004, decay: 0.5, sustain: 0.12, release: 0.6,
        cutoff: 5200, res: 0.5, vol: 0.2, reverb: true, delay: true, width: 0.34,
    },
    HORN: { // short brassy section stab
        type1: 'sawtooth', type2: 'sawtooth', detune: 14,
        attack: 0.03, decay: 0.12, sustain: 0.5, release: 0.12,
        cutoff: 1500, res: 2, vol: 0.2, reverb: true, width: 0.3,
    },
    KICK: { drum: 'kick' }, SNARE: { drum: 'snare' }, HIHAT: { drum: 'hat' },
    RIDE: { drum: 'ride' }, TOM: { drum: 'tom' },
};


// ------------------------------------------------------------------ COMPOSITIONS

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi → Hz

function song(bpm, lengthBeats, swing = 0) {
    const s = { bpm, length: lengthBeats, swing, tracks: {} };
    s.note = (instr, beat, midi, dur, vol = 1) => {
        (s.tracks[instr] = s.tracks[instr] || []).push([beat, nf(midi), dur, vol]);
    };
    s.drum = (instr, beat, vol = 1) => {
        (s.tracks[instr] = s.tracks[instr] || []).push([beat, 0, 0, vol]);
    };
    return s;
}

// — Menu: "Workshop Dreams" — wistful Am9 progression, 88 BPM
function buildMenuSong() {
    const s = song(88, 64, 0.12);
    const chords = [
        [57, 60, 64, 71], // Am9
        [53, 57, 60, 65], // Fmaj7
        [48, 55, 60, 64], // Cmaj7
        [55, 59, 62, 65], // G7
    ];
    const roots = [33, 29, 36, 31];
    for (let bar = 0; bar < 16; bar++) {
        const ch = chords[bar % 4];
        ch.forEach(m => s.note('PAD_WARM', bar * 4, m, 4));
        s.note('BASS_SUB', bar * 4, roots[bar % 4], 3.6, 0.8);
        if (bar >= 4)
            for (let i = 0; i < 8; i++)
                s.note('ARP', bar * 4 + i * 0.5, ch[i % 4] + 12, 0.12, bar >= 12 ? 0.9 : 0.7);
        // glass bell sparkle, off-beat answers in the back half of each phrase
        if (bar % 4 >= 2)
            s.note('BELL', bar * 4 + 2.5, ch[3] + 12, 0.6, 0.6);
    }
    const mel = [
        [0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 71, 1],
        [4, 69, 2], [6, 72, 0.5], [6.5, 74, 0.5], [7, 76, 1],
        [8, 77, 1.5], [9.5, 76, 0.5], [10, 74, 1], [11, 72, 1],
        [12, 71, 2], [14, 69, 2],
    ];
    mel.forEach(([b, m, d]) => {
        s.note('LEAD', 32 + b, m, d);
        s.note('LEAD', 48 + b, m, d);
        s.note('EP', 48 + b + 0.08, m - 12, d, 0.5); // soft doubling an octave down on repeat
    });
    return s;
}

// — Intro: "The Artisan's Lament" — slow D minor, 60 BPM
function buildIntroSong() {
    const s = song(60, 128);
    const chords = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
    const roots = [38, 34, 31, 33];
    for (let bar = 0; bar < 32; bar++) {
        chords[bar % 4].forEach(m => s.note('PAD_DARK', bar * 4, m, 4));
        s.note('BASS_SUB', bar * 4, roots[bar % 4], 3.5);
        if (bar >= 4)
            for (let i = 0; i < 8; i++)
                s.note('ARP', bar * 4 + i * 0.5, chords[bar % 4][i % 3] + 12, 0.3, 0.7);
    }
    const mel = [
        [32, 62, 2], [34, 65, 1], [35, 64, 1], [36, 62, 2], [38, 60, 2],
        [40, 62, 1], [41, 64, 1], [42, 65, 2], [44, 67, 2], [46, 65, 2],
        [64, 67, 2], [66, 69, 1], [67, 67, 1], [68, 65, 2], [70, 64, 2],
        [72, 62, 2], [74, 65, 1], [75, 67, 1], [76, 69, 4],
        [96, 74, 2], [98, 72, 1], [99, 69, 1], [100, 67, 2], [102, 69, 2],
        [104, 71, 2], [106, 72, 1], [107, 74, 1], [108, 76, 4],
        [112, 74, 2], [114, 72, 2], [116, 69, 2], [118, 67, 2],
        [120, 65, 2], [122, 62, 2], [124, 62, 4],
    ];
    mel.forEach(([b, m, d]) => s.note('LEAD', b, m, d));
    return s;
}

// — L1 Lobby: "Beige Carpet Lounge" — smooth groove, 112 BPM, 16 bars AABB
function buildLobbySong() {
    const s = song(112, 64, 0.16);
    const prog = [
        { bass: [41, 45, 48, 45], chord: [65, 69, 72, 76] }, // Fmaj7
        { bass: [40, 43, 47, 43], chord: [64, 67, 71, 74] }, // Em7
        { bass: [38, 41, 45, 41], chord: [62, 65, 69, 72] }, // Dm7
        { bass: [36, 43, 47, 43], chord: [60, 64, 67, 71] }, // Cmaj7
    ];
    for (let bar = 0; bar < 16; bar++) {
        const p = prog[bar % 4];
        const t = bar * 4;
        const bSection = bar >= 8;
        for (let b = 0; b < 4; b++) {
            s.note('BASS_SUB', t + b, p.bass[b], 0.7, 0.9);
            // ghost note pickup into the next beat
            if (b === 2) s.note('BASS_SUB', t + b + 0.75, p.bass[3] - 12, 0.2, 0.5);
            if (bSection) s.drum('RIDE', t + b, 0.8);
            s.drum('HIHAT', t + b + 0.5, bSection ? 0.6 : 1);
            if (b === 1 || b === 3) s.drum('SNARE', t + b, 0.5);
            if (b === 0) s.drum('KICK', t + b, 0.7);
            if (b === 2) s.drum('KICK', t + b + 0.5, 0.6);
        }
        // EP comping: and-of-2 stab, plus an answering stab in B section
        p.chord.forEach(m => s.note('EP', t + 1.5, m, 0.8, 0.8));
        if (bSection) p.chord.forEach(m => s.note('EP', t + 3.25, m, 0.4, 0.55));
        if (bar >= 4 && !bSection) p.chord.forEach((m, i) => s.note('EP', t + 3 + i * 0.12, m + 12, 0.4, 0.5));
        // drum fill at the end of each 8-bar phrase
        if (bar % 8 === 7) for (let f = 0; f < 4; f++) s.drum('SNARE', t + 3 + f * 0.25, 0.35 + f * 0.16);
    }
    // A melody (bars 5-8) on EP, B melody (bars 13-16) on LEAD with bell echoes
    const melA = [[0, 81, 1], [1, 79, 0.5], [1.5, 76, 1], [3, 74, 1], [4, 76, 2], [6, 72, 1.5],
        [8, 74, 1], [9, 72, 0.5], [9.5, 71, 1], [11, 69, 1], [12, 67, 2], [14, 71, 2]];
    melA.forEach(([b, m, d]) => s.note('EP', 16 + b, m + 12, d, 0.9));
    const melB = [[0, 84, 1.5], [1.5, 83, 0.5], [2, 81, 1], [3, 79, 1], [4, 81, 2], [6, 76, 2],
        [8, 77, 1], [9, 79, 0.5], [9.5, 81, 1], [11, 83, 1], [12, 84, 2.5], [15, 79, 1]];
    melB.forEach(([b, m, d]) => {
        s.note('LEAD', 48 + b, m, d, 0.8);
        s.note('BELL', 48 + b + 0.06, m + 12, 0.4, 0.4);
    });
    return s;
}

// — L2 Office: "Cubicle Crusade" — driving anthem, 135 BPM, 16 bars
function buildOfficeSong() {
    const s = song(135, 64, 0.05);
    const bassA = [40, 40, 43, 40, 45, 40, 47, 40]; // E G A B drive
    const bassB = [45, 45, 48, 45, 43, 43, 47, 43]; // lift to A / G for the B section
    for (let i = 0; i < 64; i++) {
        const bar = Math.floor(i / 4);
        const bSection = bar % 16 >= 8;
        const line = bSection ? bassB : bassA;
        s.note('BASS', i, line[i % 8], 0.2);
        s.note('BASS', i + 0.5, line[(i + 2) % 8], 0.2);
        s.drum('KICK', i);
        if (i % 2 === 1) s.drum('SNARE', i);
        s.drum('HIHAT', i + 0.5);
        if (bSection) s.drum('HIHAT', i + 0.25, 0.5); // double-time hats raise the energy
        if (i % 16 === 15) { s.drum('SNARE', i + 0.5, 0.5); s.drum('SNARE', i + 0.75, 0.7); }
        // chugging arp under the verse
        if (bar % 16 < 8 && bar >= 2) s.note('ARP', i + 0.5, line[i % 8] + 24, 0.15, 0.6);
    }
    const mel = [
        [0, 76, 0.5], [0.5, 76, 0.5], [1, 74, 0.5], [1.5, 72, 0.5], [2, 71, 1], [3, 67, 1],
        [4, 64, 2], [6, 69, 0.5], [6.5, 71, 0.5], [7, 72, 1],
    ];
    // A statements (bars 5-8), B statements with harmony a third up (bars 13-16)
    mel.forEach(([b, m, d]) => {
        s.note('LEAD', 16 + b, m, d);
        s.note('LEAD', 24 + b, m, d);
        s.note('LEAD', 48 + b, m, d);
        s.note('LEAD_HARD', 48 + b, m + 4, d, 0.55);
        s.note('LEAD', 56 + b, m + 12, d, 0.8);
    });
    return s;
}

// — L3 Archives: "Dust & Echoes" — dark phrygian, 96 BPM, 16 bars
function buildArchivesSong() {
    const s = song(96, 64, 0.1);
    const bass = [38, 38, 39, 38, 41, 38, 39, 36]; // D Eb phrygian motion
    for (let i = 0; i < 64; i++) {
        const bar = Math.floor(i / 4);
        const bSection = bar % 16 >= 8;
        if (i % 2 === 0) s.note('BASS', i, bass[i % 8], 0.35);
        // low drone under everything
        if (i % 16 === 0) s.note('BASS_SUB', i, 26, 15, 0.5);
        if (i % 4 === 0) s.drum('KICK', i);
        if (i % 4 === 2) s.drum('SNARE', i, 0.6);
        if (i % 8 === 7) s.drum('HIHAT', i + 0.5, 0.6);
        // tom heartbeat creeps in for the B section
        if (bSection && i % 4 === 3) { s.drum('TOM', i, 0.7); s.drum('TOM', i + 0.5, 0.45); }
        if (i % 32 === 31) { s.drum('TOM', i, 0.8); s.drum('TOM', i + 0.25, 0.6); s.drum('TOM', i + 0.5, 0.9); }
    }
    const arpNotes = [62, 63, 65, 69, 65, 63]; // d eb f a
    for (let bar = 0; bar < 16; bar++)
        if (bar % 2 === 0)
            for (let j = 0; j < 6; j++)
                s.note('ARP', bar * 4 + j * 0.5, arpNotes[j], 0.25, 0.7);
    [[50, 53, 57], [51, 55, 58]].forEach((ch, k) => {
        for (let bar = k; bar < 16; bar += 2)
            ch.forEach(m => s.note('PAD_DARK', bar * 4, m, 4));
    });
    // music-box motif drifting overhead, off the main grid
    const box = [[1, 86], [3.5, 87], [6, 89], [11, 86], [13.5, 81], [22, 87], [27, 89], [29.5, 93]];
    box.forEach(([b, m]) => s.note('BELL', b, m, 0.9, 0.45));
    const mel = [[0, 74, 2], [2, 75, 1.5], [3.5, 74, 0.5], [4, 72, 2], [6, 69, 2],
        [8, 70, 2], [10, 69, 1], [11, 67, 1], [12, 65, 3]];
    mel.forEach(([b, m, d]) => {
        s.note('LEAD', 16 + b, m, d, 0.85);
        s.note('LEAD', 48 + b, m, d, 0.9);
        s.note('PAD_DARK', 48 + b, m - 24, d, 0.5); // low shadow doubling on the reprise
    });
    return s;
}

// — L4 Showroom: "Particle Board Funk" — G mixolydian funk, 122 BPM, 16 bars
function buildShowroomSong() {
    const s = song(122, 64, 0.18);
    const bass = [43, 43, 50, 43, 41, 43, 38, 41];
    for (let i = 0; i < 64; i++) {
        const bar = Math.floor(i / 4);
        const bSection = bar % 16 >= 8;
        s.note('BASS', i, bass[i % 8], 0.18);
        if (i % 2 === 0) s.note('BASS', i + 0.75, bass[(i + 1) % 8], 0.12, 0.8);
        // slap octave pops in the B section
        if (bSection && i % 2 === 1) s.note('BASS', i + 0.5, bass[i % 8] + 12, 0.1, 0.7);
        s.drum('KICK', i);
        if (i % 2 === 1) s.drum('SNARE', i);
        s.drum('HIHAT', i + 0.25, 0.7);
        s.drum('HIHAT', i + 0.75, 0.5);
        if (bSection) s.drum('RIDE', i, 0.7);
        // ghost snares for funk feel
        if (i % 4 === 2) s.drum('SNARE', i + 0.75, 0.18);
        if (i % 16 === 15) for (let f = 0; f < 4; f++) s.drum('SNARE', i + f * 0.25, 0.3 + f * 0.18);
    }
    // clav riff (verse) + horn section stabs (chorus)
    const riff = [[0, 67], [0.5, 67], [1.25, 70], [2, 67], [2.75, 65], [3.5, 67]];
    for (let bar = 0; bar < 16; bar++) {
        if (bar % 16 < 8) riff.forEach(([b, m]) => s.note('CLAV', bar * 4 + b, m, 0.18, bar % 2 ? 0.9 : 1));
        else {
            [[0.5, [67, 71, 74]], [2.5, [65, 69, 72]], [3.25, [67, 71, 74]]].forEach(([b, ch]) =>
                ch.forEach(m => s.note('HORN', bar * 4 + b, m, 0.3, 0.8)));
        }
    }
    const mel = [[0, 79, 0.75], [1, 77, 0.75], [2, 74, 1], [3.5, 72, 0.5],
        [4, 74, 1.5], [6, 77, 1], [7, 79, 0.75],
        [8, 81, 0.75], [9, 79, 0.75], [10, 77, 1], [11.5, 74, 0.5],
        [12, 72, 1.5], [14, 67, 2]];
    mel.forEach(([b, m, d]) => {
        s.note('LEAD', 16 + b, m, d, 0.9);
        s.note('LEAD', 48 + b, m, d, 0.9);
        s.note('CLAV', 48 + b + 0.04, m - 12, Math.min(d, 0.4), 0.6);
    });
    return s;
}

// — L5 Factory: "Assembly Line Fury" — industrial, 152 BPM, 16 bars w/ halftime breakdown
function buildFactorySong() {
    const s = song(152, 64);
    const bass = [45, 45, 48, 45, 50, 48, 45, 43];
    for (let i = 0; i < 64; i++) {
        const bar = Math.floor(i / 4);
        const breakdown = bar % 16 >= 8 && bar % 16 < 12; // bars 9-12: halftime menace
        s.note('BASS', i, bass[i % 8], 0.15);
        if (!breakdown) {
            s.note('BASS', i + 0.25, bass[(i + 1) % 8] - 12, 0.1, 0.7);
            s.note('BASS', i + 0.5, bass[(i + 2) % 8], 0.15);
            s.note('BASS', i + 0.75, bass[(i + 3) % 8] - 12, 0.1, 0.7);
            s.drum('KICK', i);
            s.drum('KICK', i + 0.5);
            if (i % 2 === 1) s.drum('SNARE', i);
            s.drum('HIHAT', i + 0.25);
            s.drum('HIHAT', i + 0.75);
        } else {
            // halftime: heavy kick on 1, cracking snare on 3, toms rumbling
            if (i % 4 === 0) s.drum('KICK', i);
            if (i % 4 === 2) { s.drum('SNARE', i); s.drum('TOM', i + 0.5, 0.6); }
            s.drum('RIDE', i, 0.8);
        }
        // klaxon arp blares over the last 4 bars
        if (bar % 16 >= 12) {
            s.note('ARP', i, 81, 0.12, 0.7);
            s.note('ARP', i + 0.5, 80, 0.12, 0.55);
        }
        if (i % 32 === 31) for (let f = 0; f < 6; f++) s.drum('TOM', i - 0.5 + f * 0.25, 0.4 + f * 0.1);
    }
    const mel = [
        [0, 69, 0.25], [0.5, 69, 0.25], [1, 72, 0.25], [1.5, 69, 0.25],
        [2, 67, 0.5], [3, 65, 0.5],
        [4, 64, 0.25], [4.5, 64, 0.25], [5, 67, 0.25], [5.5, 69, 0.25],
        [6, 71, 1], [7, 69, 1],
    ];
    mel.forEach(([b, m, d]) => {
        s.note('LEAD_HARD', 16 + b, m, d);
        s.note('LEAD_HARD', 24 + b, m, d);
        s.note('LEAD_HARD', 48 + b, m, d);
        s.note('LEAD_HARD', 56 + b, m + 12, d, 0.8); // final lap screams an octave up
        s.note('BASS', 56 + b, m - 24, d, 0.8);
    });
    return s;
}

// — L6 Boss: "The Final Critique" — epic phrygian assault, 168 BPM, 16 bars
function buildBossSong() {
    const s = song(168, 64);
    const bass = [40, 40, 41, 40, 43, 41, 40, 38]; // E phrygian
    for (let i = 0; i < 64; i++) {
        const bar = Math.floor(i / 4);
        s.note('BASS', i, bass[i % 8], 0.2);
        if (i % 2 === 0) s.note('BASS', i + 0.5, bass[(i + 4) % 8] - 12, 0.15, 0.8);
        s.drum('KICK', i);
        s.drum('KICK', i + 0.5);
        if (i % 2 === 1) { s.drum('SNARE', i); s.drum('SNARE', i + 0.25, 0.5); }
        for (let h = 0; h < 4; h++) s.drum('HIHAT', i + h * 0.25, 0.8);
        // tom avalanches close each phrase
        if (i % 16 === 14) for (let f = 0; f < 8; f++) s.drum('TOM', i + f * 0.25, 0.35 + f * 0.08);
    }
    const chords = [[40, 47, 52], [41, 48, 53], [38, 45, 50], [43, 50, 55]];
    for (let bar = 0; bar < 16; bar++) {
        chords[bar % 4].forEach(m => s.note('PAD_DARK', bar * 4, m, 4));
        // ominous choir swell layers in the back half
        if (bar >= 8) chords[bar % 4].forEach(m => s.note('PAD_WARM', bar * 4, m + 24, 4, 0.5));
    }
    const mel = [
        [0, 76, 0.5], [0.5, 77, 0.5], [1, 76, 0.5], [1.5, 74, 0.5],
        [2, 72, 1], [3, 71, 0.5], [3.5, 69, 0.5],
        [4, 67, 1], [5, 69, 0.5], [5.5, 71, 0.5], [6, 72, 0.5], [6.5, 74, 0.5],
        [7, 76, 1],
    ];
    mel.forEach(([b, m, d]) => {
        s.note('LEAD_HARD', 16 + b, m, d);
        s.note('LEAD_HARD', 24 + b, m + 12, d, 0.8);
        s.note('LEAD_HARD', 48 + b, m + 12, d);
        s.note('LEAD', 48 + b, m + 7, d, 0.6); // harmony a fifth up for the climax
    });
    // chromatic descent of doom, bars 15-16
    [76, 75, 74, 73, 72, 71, 70, 69].forEach((m, k) =>
        s.note('LEAD_HARD', 56 + k, m, 0.9, 0.9));
    return s;
}

let SONGS = null;
function getSongs() {
    if (!SONGS) SONGS = {
        menu: buildMenuSong(),
        intro: buildIntroSong(),
        lobby: buildLobbySong(),
        office: buildOfficeSong(),
        archives: buildArchivesSong(),
        showroom: buildShowroomSong(),
        factory: buildFactorySong(),
        boss: buildBossSong(),
    };
    return SONGS;
}


// ------------------------------------------------------------------ MODERN INSTRUMENT FAMILIES (M6.1)

const FAMILIES = {
    strings: ['STRINGS', 'STRINGS_LOW', 'STRINGS_STACC'],
    brass: ['BRASS', 'BRASS_LOW'],
    choir: ['CHOIR', 'CHOIR_DARK'],
    piano: ['PIANO', 'PIANO_SOFT', 'EP_RHODES', 'CELESTA', 'HARP'],
    guitar: ['GUITAR_DIST', 'GUITAR_PALM', 'GUITAR_CLEAN', 'GUITAR_FUNK', 'BASS_ELEC', 'BASS_SLAP'],
    taiko: ['TAIKO', 'TIMPANI', 'CRASH', 'KICK_BIG', 'SNARE_BIG', 'SHAKER'],
    hits: ['ORCH_HIT', 'STAB'],
    risers: ['RISER', 'RISER_TONAL'],
};

const MODERN_INSTRUMENTS = {
    // ---- strings: saw stacks, slow bow, delayed vibrato, chorus width
    STRINGS: {
        layers: [{ type: 'sawtooth', unison: 3, spread: 9 }, { type: 'sawtooth', oct: 1, gain: 0.35, unison: 2, spread: 7 }],
        attack: 0.32, decay: 0.4, sustain: 0.85, release: 0.9,
        cutoff: 2100, res: 0.6, vol: 0.2, reverb: 0.9, width: 0.6,
        vibrato: { rate: 5.4, depth: 10, delay: 0.35 }, chorus: { rate: 0.7, depth: 0.004 }, noiseMix: 0.03, noiseHP: 2500,
    },
    STRINGS_LOW: {
        layers: [{ type: 'sawtooth', oct: -1, unison: 3, spread: 8 }, { type: 'sawtooth', gain: 0.4, unison: 2, spread: 6 }],
        attack: 0.4, decay: 0.5, sustain: 0.85, release: 1.1,
        cutoff: 800, res: 0.7, vol: 0.26, reverb: 0.8, width: 0.5,
        vibrato: { rate: 4.8, depth: 8, delay: 0.45 }, chorus: { rate: 0.5, depth: 0.005 },
    },
    STRINGS_STACC: {
        layers: [{ type: 'sawtooth', unison: 3, spread: 10 }, { type: 'sawtooth', oct: 1, gain: 0.3 }],
        attack: 0.02, decay: 0.16, sustain: 0.3, release: 0.12,
        cutoff: 2600, res: 0.8, vol: 0.24, reverb: 0.7, width: 0.5, noiseMix: 0.05, noiseHP: 3000,
    },
    // ---- brass: bright saws with a filter bloom and a pitch scoop into every note
    BRASS: {
        layers: [{ type: 'sawtooth', unison: 2, spread: 6 }, { type: 'square', gain: 0.25 }],
        attack: 0.05, decay: 0.15, sustain: 0.7, release: 0.18,
        cutoff: 1300, res: 1.4, vol: 0.24, reverb: 0.8, width: 0.3,
        filterEnv: true, filterEnvAmt: 2400, filterEnvAtk: 0.08, filterEnvDec: 0.45,
        pitchEnv: { amt: -70, time: 0.09 }, vibrato: { rate: 5, depth: 6, delay: 0.4 },
    },
    BRASS_LOW: {
        layers: [{ type: 'sawtooth', oct: -1, unison: 2, spread: 5 }, { type: 'sawtooth', gain: 0.3 }],
        attack: 0.07, decay: 0.2, sustain: 0.75, release: 0.25,
        cutoff: 700, res: 1.2, vol: 0.28, reverb: 0.8, width: 0.25,
        filterEnv: true, filterEnvAmt: 1400, filterEnvAtk: 0.1, filterEnvDec: 0.5, pitchEnv: { amt: -60, time: 0.1 },
    },
    // ---- choir: saw stack through vowel formants ('ah'), slow swell
    CHOIR: {
        layers: [{ type: 'sawtooth', unison: 3, spread: 11 }, { type: 'sawtooth', oct: 1, gain: 0.25, unison: 2, spread: 8 }],
        attack: 0.6, decay: 0.5, sustain: 0.9, release: 1.4,
        cutoff: 4000, res: 0.5, vol: 0.55, reverb: 1, width: 0.7,
        formant: [[660, 8, 1], [1120, 10, 0.55], [2750, 12, 0.22]],
        vibrato: { rate: 5.2, depth: 9, delay: 0.6 }, chorus: { rate: 0.4, depth: 0.006, pan: -0.5 }, noiseMix: 0.04, noiseHP: 3500,
    },
    CHOIR_DARK: { // 'oh' vowel, lower and hooded — the boss's cathedral
        layers: [{ type: 'sawtooth', unison: 3, spread: 12 }, { type: 'sawtooth', oct: -1, gain: 0.4, unison: 2, spread: 6 }],
        attack: 0.8, decay: 0.6, sustain: 0.9, release: 1.8,
        cutoff: 3000, res: 0.5, vol: 0.6, reverb: 1, width: 0.7,
        formant: [[450, 8, 1], [800, 10, 0.6], [2830, 12, 0.15]],
        vibrato: { rate: 4.6, depth: 8, delay: 0.7 }, chorus: { rate: 0.3, depth: 0.007, pan: 0.5 },
    },
    // ---- piano family: additive partials with their own decays, hammer noise
    PIANO: {
        partials: [[1, 1, 2.6], [2, 0.5, 1.4], [3, 0.28, 0.9], [4, 0.14, 0.6], [5.02, 0.08, 0.4], [6.05, 0.04, 0.3]],
        attack: 0.004, decay: 1.6, sustain: 0.0, release: 0.35,
        cutoff: 6000, res: 0.4, vol: 0.5, reverb: 0.7, width: 0.3, noiseMix: 0.12, noiseHP: 2000, chorus: { rate: 0.3, depth: 0.002, mix: 0.25 },
    },
    PIANO_SOFT: { // felt piano: fewer partials, darker, longer
        partials: [[1, 1, 3.2], [2, 0.32, 1.6], [3, 0.12, 0.8], [4, 0.05, 0.5]],
        attack: 0.008, decay: 2.2, sustain: 0.0, release: 0.5,
        cutoff: 2600, res: 0.4, vol: 0.5, reverb: 0.9, width: 0.3, noiseMix: 0.05, noiseHP: 1200,
    },
    EP_RHODES: {
        partials: [[1, 1, 1.8], [2, 0.18, 0.6], [3.01, 0.08, 0.4], [7, 0.03, 0.15]],
        attack: 0.004, decay: 1.2, sustain: 0.0, release: 0.4,
        cutoff: 3200, res: 0.5, vol: 0.5, reverb: 0.7, width: 0.35, tremolo: { rate: 4.6, depth: 0.35 }, chorus: { rate: 0.9, depth: 0.003 },
    },
    CELESTA: { // glassy, bell-like: inharmonic partials
        partials: [[1, 1, 1.4], [2.76, 0.35, 0.6], [5.4, 0.15, 0.3], [8.9, 0.05, 0.15]],
        attack: 0.003, decay: 0.9, sustain: 0.0, release: 0.5,
        cutoff: 9000, res: 0.3, vol: 0.32, reverb: 1, delay: true, width: 0.45,
    },
    HARP: {
        partials: [[1, 1, 1.1], [2, 0.4, 0.5], [3, 0.2, 0.3], [4, 0.08, 0.2]],
        attack: 0.003, decay: 0.7, sustain: 0.0, release: 0.3,
        cutoff: 5000, res: 0.4, vol: 0.34, reverb: 0.9, delay: true, width: 0.45, noiseMix: 0.06, noiseHP: 3000,
    },
    // ---- guitars and basses
    GUITAR_DIST: { // double-tracked: two panned stacks with different detune into a tanh stage and a cab
        layers: [{ type: 'sawtooth', detune: -4, pan: -0.4 }, { type: 'sawtooth', detune: 5, pan: 0.4 }, { type: 'square', oct: -1, gain: 0.5 }],
        attack: 0.004, decay: 0.12, sustain: 0.8, release: 0.08,
        cutoff: 5200, res: 0.6, vol: 0.3, drive: 9, preGain: 2.2, cab: 1100, cabQ: 0.5, reverb: 0.35, width: 0.5,
        vibrato: { rate: 5.5, depth: 9, delay: 0.5 },
    },
    GUITAR_PALM: { // palm-muted chug: same rig, clipped short and dark
        layers: [{ type: 'sawtooth', detune: -3, pan: -0.35 }, { type: 'sawtooth', detune: 4, pan: 0.35 }, { type: 'square', oct: -1, gain: 0.6 }],
        attack: 0.003, decay: 0.09, sustain: 0.25, release: 0.05,
        cutoff: 1400, res: 0.8, vol: 0.34, drive: 10, preGain: 2.5, cab: 700, cabQ: 0.6, width: 0.4,
        filterEnv: true, filterEnvAmt: 1800, filterEnvAtk: 0.01, filterEnvDec: 0.1,
    },
    GUITAR_CLEAN: {
        layers: [{ type: 'triangle' }, { type: 'sawtooth', gain: 0.3, detune: 3 }],
        attack: 0.004, decay: 0.5, sustain: 0.2, release: 0.25,
        cutoff: 3200, res: 0.7, vol: 0.32, reverb: 0.6, delay: true, width: 0.3, chorus: { rate: 1.1, depth: 0.003 }, noiseMix: 0.04, noiseHP: 3500,
    },
    GUITAR_FUNK: { // clean, snappy, wah-ish filter bump on every pick
        layers: [{ type: 'triangle' }, { type: 'square', gain: 0.35, detune: 2 }],
        attack: 0.003, decay: 0.14, sustain: 0.12, release: 0.08,
        cutoff: 1500, res: 3, vol: 0.3, width: 0.25, filterEnv: true, filterEnvAmt: 2600, filterEnvAtk: 0.015, filterEnvDec: 0.14, noiseMix: 0.05, noiseHP: 3000,
    },
    BASS_ELEC: { // fingered electric bass: pick noise, warm body, mono
        layers: [{ type: 'triangle' }, { type: 'sawtooth', gain: 0.35 }, { type: 'sine', oct: -1, gain: 0.5 }],
        attack: 0.006, decay: 0.3, sustain: 0.55, release: 0.12,
        cutoff: 620, res: 1.2, vol: 0.6, width: 0, noiseMix: 0.06, noiseHP: 1200, filterEnv: true, filterEnvAmt: 900, filterEnvAtk: 0.01, filterEnvDec: 0.2,
    },
    BASS_SLAP: {
        layers: [{ type: 'sawtooth' }, { type: 'square', gain: 0.4, detune: 3 }],
        attack: 0.003, decay: 0.16, sustain: 0.25, release: 0.08,
        cutoff: 900, res: 4, vol: 0.55, width: 0, filterEnv: true, filterEnvAmt: 3200, filterEnvAtk: 0.008, filterEnvDec: 0.12, noiseMix: 0.1, noiseHP: 2000,
    },
    // ---- orchestral hits and risers
    ORCH_HIT: { // the whole section on one hit: octave stack, fast decay, hall
        layers: [{ type: 'sawtooth', unison: 3, spread: 14 }, { type: 'sawtooth', oct: -1, gain: 0.7, unison: 2, spread: 8 }, { type: 'sawtooth', oct: 1, gain: 0.4 }],
        attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.35,
        cutoff: 2600, res: 1, vol: 0.5, reverb: 1, width: 0.6, filterEnv: true, filterEnvAmt: 3000, filterEnvAtk: 0.01, filterEnvDec: 0.35, noiseMix: 0.1, noiseHP: 800,
    },
    STAB: {
        layers: [{ type: 'sawtooth', unison: 2, spread: 10 }, { type: 'square', oct: -1, gain: 0.4 }],
        attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.2,
        cutoff: 2000, res: 2, vol: 0.4, reverb: 0.8, width: 0.4, filterEnv: true, filterEnvAmt: 2500, filterEnvAtk: 0.01, filterEnvDec: 0.2,
    },
    RISER: { // filtered noise climbing across the note
        layers: [{ type: 'noise', pan: -0.4 }, { type: 'noise', pan: 0.4 }],
        attack: 0.4, decay: 0.2, sustain: 1.0, release: 0.15,
        sweep: { from: 180, to: 9000 }, res: 6, vol: 0.28, reverb: 1, width: 0.6,
    },
    RISER_TONAL: { // saw stack whose filter opens while vibrato widens
        layers: [{ type: 'sawtooth', unison: 3, spread: 30 }, { type: 'sawtooth', oct: 1, gain: 0.4, unison: 2, spread: 20 }],
        attack: 0.5, decay: 0.2, sustain: 1.0, release: 0.2,
        sweep: { from: 300, to: 7000 }, res: 3, vol: 0.22, reverb: 1, width: 0.7, vibrato: { rate: 6, depth: 30, delay: 0.2 },
    },
    // drum aliases so orchestration maps can name them like instruments
    KICK_BIG: { drum: 'kick_big' }, SNARE_BIG: { drum: 'snare_big' }, TAIKO: { drum: 'taiko' },
    TIMPANI: { drum: 'timpani' }, CRASH: { drum: 'crash' }, SHAKER: { drum: 'shaker' },
};
Object.assign(INSTRUMENTS, MODERN_INSTRUMENTS);

// ------------------------------------------------------------------ ORCHESTRATION (M6.2)
/**
 * Per song, per classic track: the voices that play it now. Each entry is
 * [instrument, gain, opts]; every mapped voice plays the classic note (same
 * pitch, same beat, same duration) — opts.oct doubles at the octave (the
 * classic orchestrator's device), opts.minDur restricts a doubling to held
 * notes, opts.phase2 marks the boss's phase-2 layer (M6.4). Tracks not listed
 * keep their classic voice.
 */
/** headroom per song: the doubled arrangements are trimmed so peaks stay under 0.9 */
const ORCH_LEVEL = { menu: 1, intro: 1, lobby: 0.95, office: 0.72, archives: 1, showroom: 0.85, factory: 0.62, boss: 0.5 };

const ORCHESTRATION = {
    menu: { // "Workshop Dreams": string section under a warm piano, harp for the arpeggio
        PAD_WARM: [['STRINGS', 0.7], ['CHOIR', 0.28]],
        BASS_SUB: [['BASS_SUB', 0.8], ['STRINGS_LOW', 0.4]],
        ARP: [['HARP', 0.85], ['PIANO_SOFT', 0.3]],
        BELL: [['CELESTA', 0.9]],
        LEAD: [['PIANO', 1.0], ['STRINGS', 0.4]],
        EP: [['PIANO_SOFT', 0.9]],
    },
    intro: { // "The Artisan's Lament": felt piano carries the lament over low strings and a hooded choir
        PAD_DARK: [['STRINGS_LOW', 0.7], ['CHOIR_DARK', 0.35]],
        BASS_SUB: [['BASS_SUB', 0.8], ['STRINGS_LOW', 0.35, { oct: -1 }]],
        ARP: [['HARP', 0.7]],
        LEAD: [['PIANO', 0.95], ['STRINGS', 0.55]],
    },
    lobby: { // "Beige Carpet Lounge": rhodes, fingered bass, clean guitar on the B melody
        BASS_SUB: [['BASS_ELEC', 0.9]],
        EP: [['EP_RHODES', 0.9]],
        LEAD: [['GUITAR_CLEAN', 0.9], ['EP_RHODES', 0.35]],
        BELL: [['CELESTA', 0.8]],
        KICK: [['KICK', 0.9]], SNARE: [['SNARE', 0.9]], HIHAT: [['HIHAT', 1]], RIDE: [['RIDE', 1]],
    },
    office: { // "Cubicle Crusade": palm-muted guitars drive it, brass on the anthem line, rock kit
        BASS: [['BASS_ELEC', 0.9], ['GUITAR_PALM', 0.55]],
        ARP: [['GUITAR_PALM', 0.7]],
        LEAD: [['GUITAR_DIST', 0.9], ['BRASS', 0.4]],
        LEAD_HARD: [['GUITAR_DIST', 0.9]],
        KICK: [['KICK_BIG', 1]], SNARE: [['SNARE_BIG', 1]],
    },
    archives: { // "Dust & Echoes": choir and low strings, harp motif, taiko heartbeat, timpani
        PAD_DARK: [['CHOIR_DARK', 0.6], ['STRINGS_LOW', 0.5]],
        BASS: [['BASS_ELEC', 0.7], ['STRINGS_LOW', 0.45]],
        ARP: [['HARP', 0.7], ['PIANO_SOFT', 0.35]],
        BELL: [['CELESTA', 0.9]],
        LEAD: [['STRINGS', 0.95], ['PIANO_SOFT', 0.35]],
        KICK: [['KICK', 0.8], ['TAIKO', 0.55]], SNARE: [['SNARE_BIG', 0.8]], TOM: [['TIMPANI', 0.9]],
    },
    showroom: { // "Particle Board Funk": slap bass, funk guitar under the clav, a brass section
        BASS: [['BASS_SLAP', 0.9]],
        CLAV: [['CLAV', 0.8], ['GUITAR_FUNK', 0.6]],
        HORN: [['BRASS', 0.9]],
        LEAD: [['BRASS', 0.8], ['GUITAR_FUNK', 0.45]],
        KICK: [['KICK_BIG', 0.8]], SNARE: [['SNARE', 1]], HIHAT: [['HIHAT', 1], ['SHAKER', 0.6]],
    },
    factory: { // "Assembly Line Fury": chugging guitars, taiko under the kick, brass on the klaxon
        BASS: [['GUITAR_PALM', 0.85], ['BASS_ELEC', 0.7]],
        ARP: [['GUITAR_DIST', 0.6], ['BRASS', 0.35]],
        LEAD_HARD: [['GUITAR_DIST', 0.95], ['BRASS', 0.45]],
        KICK: [['KICK_BIG', 1], ['TAIKO', 0.35]], SNARE: [['SNARE_BIG', 1]], TOM: [['TAIKO', 0.9]],
    },
    boss: { // "The Final Critique": cathedral choir, full strings and brass, taiko and timpani; phase 2 adds the low brass, hits, and doubled taiko
        BASS: [['GUITAR_PALM', 0.85], ['BASS_ELEC', 0.7], ['STRINGS_LOW', 0.5, { phase2: true }]],
        PAD_DARK: [['CHOIR_DARK', 0.7], ['STRINGS_LOW', 0.5], ['BRASS_LOW', 0.55, { phase2: true }]],
        PAD_WARM: [['CHOIR', 0.7], ['STRINGS', 0.5]],
        LEAD_HARD: [['GUITAR_DIST', 0.95], ['BRASS', 0.5], ['STRINGS', 0.3], ['ORCH_HIT', 0.55, { phase2: true, minDur: 0.9 }]],
        LEAD: [['STRINGS', 0.8], ['BRASS', 0.5]],
        KICK: [['KICK_BIG', 1], ['TAIKO', 0.5], ['TAIKO', 0.6, { phase2: true }]], SNARE: [['SNARE_BIG', 1]],
        TOM: [['TAIKO', 0.8], ['TIMPANI', 0.6]],
    },
};

// ------------------------------------------------------------------ SEQUENCER

let currentSong = null;
let currentSongName = null;
let nextNoteTime = 0;
let step16 = 0;
let playing = false;
let schedTimer = null;
let schedulerUnderruns = 0;
let schedulerSkippedSteps = 0;
let lastUnderrunLogAt = -Infinity;
let lastSchedulerAt = 0;
let schedulerErrors = 0;
// Keep enough music queued to ride through a heavy render/GC frame without an
// audible hole. Web Audio plays these nodes off the main thread once scheduled.
const SCHEDULE_AHEAD_SECONDS = 0.85;
const SCHEDULER_TICK_MS = 40;

/** which ambience bed a song implies (levels pass their own key) */
const SONG_AMBIENCE = { menu: 'menu', intro: null, lobby: 'lobby', office: 'office', archives: 'archives', showroom: 'showroom', factory: 'factory', boss: 'boss' };

export function startSong(name) {
    initAudio();
    const s = getSongs()[name];
    if (!s) return;
    stopMusic({ fadeInNew: true });
    currentSong = s;
    currentSongName = name;
    step16 = 0;
    nextNoteTime = G.ctx.currentTime + 0.05;
    playing = true;
    if (ROOMS[name]) setRoom(name);              // M6.3: the song's room follows the floor
    if (name in SONG_AMBIENCE) startAmbience(SONG_AMBIENCE[name]);
    gameLog('audio.song-started', { song: name, state: G.ctx.state });
    scheduler();
}

export function stopMusic({ fadeInNew = false } = {}) {
    if (playing) gameLog('audio.song-stopped', { song: currentSongName });
    playing = false;
    if (schedTimer) { clearTimeout(schedTimer); schedTimer = null; }
    if (G) {
        // Scheduled voices cannot be cancelled as a group, so fade their old bus
        // before disconnecting it. The former hard disconnect was an audible pop.
        const oldMusic = G.music;
        const t = G.ctx.currentTime;
        holdParam(oldMusic.gain, t);
        oldMusic.gain.setTargetAtTime(0.0001, t, 0.018);
        const nextMusic = G.ctx.createGain();
        nextMusic.gain.setValueAtTime(fadeInNew ? 0.0001 : MUSIC_LEVEL, t);
        if (fadeInNew) nextMusic.gain.setTargetAtTime(MUSIC_LEVEL, t, 0.025);
        nextMusic.connect(G.duck);
        G.music = nextMusic;
        if (!G.offline) setTimeout(() => { try { oldMusic.disconnect(); } catch { /* already gone */ } }, 180);
    }
}

function scheduler() {
    if (!playing || !G) return;
    lastSchedulerAt = performance.now();
    try {
        const step16Dur = (60 / currentSong.bpm) / 4;
        // A busy render thread can delay this timer. Never replay every missed beat:
        // doing so creates a burst of audio nodes that makes the CPU stall worse and
        // can starve the output completely. Skip cleanly to the current musical step.
        const lag = G.ctx.currentTime - nextNoteTime;
        if (lag > 0.04) {
            const skipped = Math.floor(lag / step16Dur) + 1;
            nextNoteTime += skipped * step16Dur;
            step16 = (step16 + skipped) % (currentSong.length * 4);
            schedulerUnderruns += 1;
            schedulerSkippedSteps += skipped;
            if (performance.now() - lastUnderrunLogAt > 2000) {
                lastUnderrunLogAt = performance.now();
                gameLog('audio.scheduler-underrun', {
                    song: currentSongName,
                    lagMs: Math.round(lag * 1000),
                    skippedSteps: skipped,
                    lookaheadMs: Math.round(SCHEDULE_AHEAD_SECONDS * 1000),
                    contextState: G.ctx.state,
                }, 'warn');
            }
        }
        while (nextNoteTime < G.ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
            // swing: every off-16th leans late for a human pocket
            const lean = (step16 % 2) ? (currentSong.swing || 0) * step16Dur : 0;
            scheduleStep(currentSong, ORCHESTRATION[currentSongName], step16, nextNoteTime + lean);
            nextNoteTime += step16Dur;
            step16++;
            if (step16 >= currentSong.length * 4) step16 = 0;
        }
    } catch (error) {
        schedulerErrors++;
        if (schedulerErrors === 1 || performance.now() - lastUnderrunLogAt > 2000) {
            lastUnderrunLogAt = performance.now();
            gameLog('audio.scheduler-error', { song: currentSongName, step: step16, message: error.message, count: schedulerErrors }, 'error');
        }
        // Skip a bad step and keep the timer alive; one bad voice must not kill music.
        step16 = (step16 + 1) % (currentSong.length * 4);
        nextNoteTime = G.ctx.currentTime + 0.05;
    } finally {
        if (playing) schedTimer = setTimeout(scheduler, SCHEDULER_TICK_MS);
    }
}

function scheduleStep(song, orch, step, time, bus = null) {
    const beat = step / 4;
    const spb = 60 / song.bpm;
    const level = orch ? (ORCH_LEVEL[song === currentSong ? currentSongName : songNameOf(song)] ?? 1) : 1;
    for (const [trackName, notes] of Object.entries(song.tracks)) {
        const voices = (orch && orch[trackName]) || [[trackName, 1]];
        for (const n of notes) {
            if (Math.abs(n[0] - beat) >= 0.001) continue;
            for (const [instrName, gain, opts] of voices) {
                if (opts) {
                    if (opts.phase2 && !mix.bossPhase2) continue;
                    if (opts.minDur && n[2] < opts.minDur) continue;
                }
                const instr = INSTRUMENTS[instrName];
                if (!instr) continue;
                const vol = (n[3] ?? 1) * gain * level;
                if (instr.drum) playDrum(instr.drum, time, vol);
                else playNote(instr, n[1] * Math.pow(2, opts?.oct || 0), time, n[2] * spb, vol, bus);
            }
        }
    }
    // M6.4: in phase 2 the boss track gets a riser into every loop
    if (mix.bossPhase2 && song === currentSong && currentSongName === 'boss' && beat === song.length - 4)
        playNote(INSTRUMENTS.RISER, 200, time, 4 * spb, 0.8 * level, bus);
}

function songNameOf(song) { for (const [k, v] of Object.entries(getSongs())) if (v === song) return k; return null; }

/** note data of a song, for the preservation diff (M6.2) */
export function songData(name) {
    const s = getSongs()[name];
    if (!s) return null;
    const tracks = {};
    for (const [k, v] of Object.entries(s.tracks)) tracks[k] = v.map(n => n.map(x => +x.toFixed(4)));
    return { bpm: s.bpm, length: s.length, swing: s.swing, tracks };
}

// ------------------------------------------------------------------ DYNAMIC MIX (M6.4)

const mix = { combat: false, lowHealth: false, bossPhase2: false, objective: 0 };
const mixLog = [];
let mixStartedAt = 0;

function mixDuckTarget() {
    let target = 1;
    if (mix.combat) target *= 0.7;
    if (mix.lowHealth) target *= 0.8;
    if (mix.bossPhase2) target *= 1.08;
    return target;
}

function applyMix(reason) {
    if (!G || G.offline) return;
    const t = G.ctx.currentTime;
    const target = mixDuckTarget();
    holdParam(G.duck.gain, t);
    G.duck.gain.setTargetAtTime(target, t, mix.combat ? 0.12 : 0.7); // fast in, slow out
    holdParam(G.musicLP.frequency, t);
    G.musicLP.frequency.setTargetAtTime(mix.lowHealth ? 900 : 20000, t, 0.25);
    holdParam(G.sfx.gain, t);
    G.sfx.gain.setTargetAtTime(mix.lowHealth ? SFX_LEVEL * 0.85 : SFX_LEVEL, t, 0.3);
    mixLog.push({ t: +(t - mixStartedAt).toFixed(2), reason, combat: mix.combat, lowHealth: mix.lowHealth, bossPhase2: mix.bossPhase2, duck: +target.toFixed(2) });
    if (mixLog.length > 80) mixLog.shift();
}

/** set mix flags; only changes are applied and logged */
export function setMix(patch) {
    let changed = null;
    for (const k of ['combat', 'lowHealth', 'bossPhase2']) {
        if (k in patch && !!patch[k] !== mix[k]) { mix[k] = !!patch[k]; changed = k; }
    }
    if (!changed) return false;
    if (changed === 'bossPhase2' && mix.bossPhase2) bossStinger();
    applyMix(changed);
    return true;
}

/** a short lift under an objective pickup (tables, gates): +30 % for a beat, then settle (M6.4) */
export function musicSwell(amount = 1.3) {
    mix.objective++;
    if (!G || G.offline) return;
    const t = G.ctx.currentTime;
    const base = mixDuckTarget();
    holdParam(G.duck.gain, t);
    G.duck.gain.linearRampToValueAtTime(Math.min(1.25, base * amount), t + 0.1);
    G.duck.gain.setTargetAtTime(base, t + 0.5, 0.6);
    mixLog.push({ t: +(t - mixStartedAt).toFixed(2), reason: 'swell', duck: +Math.min(1.25, base * amount).toFixed(2) });
    if (mixLog.length > 80) mixLog.shift();
}

/** the phase-2 transition: hit, taiko roll, crash, riser into the next bar */
function bossStinger() {
    if (!G) return;
    const t = G.ctx.currentTime + 0.02, bus = G.music;
    playNote(INSTRUMENTS.ORCH_HIT, 82.4, t, 0.5, 1.0, bus);           // E2 section hit
    playNote(INSTRUMENTS.BRASS_LOW, 82.4, t + 0.05, 1.2, 0.8, bus);
    for (let i = 0; i < 6; i++) playDrum('taiko', t + 0.3 + i * 0.11, 0.5 + i * 0.09);
    playDrum('crash', t + 0.96, 0.9);
    playNote(INSTRUMENTS.RISER_TONAL, 164.8, t + 0.9, 1.6, 0.7, bus);
}

export function resetMix() {
    mix.combat = false; mix.lowHealth = false; mix.bossPhase2 = false; mix.objective = 0;
    if (G) { mixStartedAt = G.ctx.currentTime; applyMix('reset'); }
}

// ------------------------------------------------------------------ SFX (M6.3)

/** every classic cue keeps its name and role (30 classic + hitmark/killmark from M3) */
export const SFX_TYPES = ['shoot', 'spray', 'nail', 'roller_fire', 'roller_boom', 'swing', 'whack', 'hit', 'hitmark', 'killmark', 'splat',
    'pain', 'enemy_pain', 'door_close', 'wood_hit', 'wood_break', 'heartbeat', 'munch', 'collect', 'money', 'table',
    'step', 'jump', 'land', 'alert', 'door_open', 'gate', 'enemy_death', 'elevator', 'boss_roar', 'fanfare',
    'weapon_switch', 'empty', 'menu_move', 'menu_select'];
let lastSfx = null;

export function playSound(type, opts = {}) {
    if (!G) return;
    const ctx = G.ctx;
    const now = ctx.currentTime;
    const out = G.sfx;
    const reverbNode = G.reverb;
    lastSfx = type;

    const osc = (type, f0, f1, t0, dur, vol, ramp = 'exponential', pan = 0) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g);
        if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
        o.type = type;
        const start = now + t0, attack = Math.min(0.003, dur * 0.2);
        o.frequency.setValueAtTime(f0, start);
        if (f1) o.frequency[ramp + 'RampToValueAtTime'](Math.max(f1, 1), start + dur);
        // Even a 2 ms ramp removes the square/saw discontinuity that reads as a
        // random digital click while preserving the intended sharp transient.
        g.gain.setValueAtTime(0.001, start);
        g.gain.linearRampToValueAtTime(vol, start + attack);
        g.gain.exponentialRampToValueAtTime(0.01, start + dur);
        o.start(start); o.stop(start + dur + 0.05);
        return g;
    };
    const noise = (filterType, freq, t0, dur, vol, q = 1, atk = 0) => {
        const n = ctx.createBufferSource();
        n.buffer = getNoise(); n.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = filterType; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain();
        n.connect(f); f.connect(g); g.connect(out);
        const start = now + t0, attack = atk || Math.min(0.003, dur * 0.2);
        g.gain.setValueAtTime(0.001, start);
        g.gain.linearRampToValueAtTime(vol, start + attack);
        g.gain.exponentialRampToValueAtTime(0.01, start + attack + dur);
        n.start(start); n.stop(start + attack + dur + 0.02);
        return g;
    };
    const wet = (g, amt = 1) => { const s = ctx.createGain(); s.gain.value = amt; g.connect(s); s.connect(reverbNode); return g; };
    const tone = (instr, f, t0, dur, vol) => playNote(instr, f, now + t0, dur, vol, out);

    switch (type) {
        case 'shoot': // paintbrush flick: bristle snap, wet body, short whip tail
            noise('highpass', 5000, 0, 0.02, 0.18);
            osc('sawtooth', 620, 90, 0, 0.18, 0.16);
            noise('bandpass', 1400, 0.01, 0.1, 0.1, 2);
            noise('highpass', 2000, 0, 0.08, 0.08);
            break;
        case 'spray': // pressurized hiss with a valve click
            osc('square', 2600, 1800, 0, 0.012, 0.05);
            noise('bandpass', 3000 + Math.random() * 1000, 0, 0.09, 0.12, 2);
            noise('highpass', 6500, 0, 0.12, 0.05);
            osc('square', 300 + Math.random() * 100, 120, 0, 0.06, 0.05);
            break;
        case 'nail': // pneumatic snap: piston crack, air exhaust, wood thock
            osc('square', 1900 + Math.random() * 300, 300, 0, 0.05, 0.1);
            noise('highpass', 4500, 0, 0.04, 0.1);
            noise('highpass', 3200, 0.04, 0.09, 0.05); // exhaust
            osc('sine', 140, 90, 0, 0.05, 0.08);
            osc('triangle', 420, 200, 0.005, 0.03, 0.06);
            break;
        case 'roller_fire': // heavy pneumatic thump with a mechanical clank and pressure release
            osc('sine', 130, 55, 0, 0.2, 0.3);
            noise('lowpass', 700, 0, 0.14, 0.16);
            osc('triangle', 900, 300, 0.02, 0.05, 0.07);
            noise('bandpass', 2400, 0.03, 0.12, 0.05, 1.5);
            wet(noise('lowpass', 400, 0.05, 0.25, 0.08), 0.6);
            break;
        case 'roller_boom': { // wet paint detonation: sub thump, slap, splatter crackle, hall tail
            const g = osc('sine', 95, 30, 0, 0.4, 0.4);
            wet(g);
            osc('sine', 48, 28, 0, 0.5, 0.3);
            noise('lowpass', 520, 0, 0.32, 0.3);
            noise('bandpass', 1100, 0.03, 0.18, 0.18, 1.5);
            osc('sine', 200, 70, 0.02, 0.16, 0.18);
            for (let i = 0; i < 5; i++) noise('bandpass', 1800 + Math.random() * 2500, 0.05 + i * 0.045, 0.04, 0.09, 3);
            wet(noise('lowpass', 900, 0.08, 0.5, 0.1), 0.8);
            break;
        }
        case 'swing': // broad, weighty air displacement before the club lands
            noise('bandpass', 520, 0, 0.24, 0.22, 2.2);
            noise('bandpass', 1250, 0.025, 0.17, 0.11, 1.7);
            osc('sine', 210, 85, 0, 0.2, 0.07, 'linear');
            break;
        case 'whack': // dry wood crack plus a short low body thump
            osc('triangle', 170, 58, 0, 0.18, 0.34, 'linear');
            noise('bandpass', 1550, 0, 0.055, 0.28, 4.5);
            noise('lowpass', 520, 0.008, 0.14, 0.22);
            wet(osc('sine', 92, 42, 0.005, 0.24, 0.16, 'linear'), 0.38);
            break;
        case 'hit': // impact: body thud, crack, dust
            osc('sawtooth', 110, 25, 0, 0.16, 0.25, 'linear');
            noise('lowpass', 800, 0, 0.1, 0.12);
            noise('highpass', 2500, 0, 0.02, 0.1);
            break;
        case 'hitmark': // MODERN: the CoD tick — two short clicks
            osc('square', 1800, 1400, 0, 0.025, 0.09);
            osc('square', 2400, 1900, 0.03, 0.025, 0.07);
            break;
        case 'killmark': // MODERN: lower, longer confirm
            osc('square', 1200, 700, 0, 0.05, 0.12);
            osc('triangle', 500, 240, 0.04, 0.12, 0.14);
            noise('bandpass', 2600, 0, 0.05, 0.05, 3);
            break;
        case 'splat': { // paint lands: wet slap, drips
            noise('lowpass', 900, 0, 0.12, 0.2);
            osc('sine', 200, 60, 0, 0.1, 0.15);
            noise('bandpass', 2200, 0.02, 0.05, 0.06, 2);
            osc('sine', 900, 400, 0.08, 0.06, 0.03);
            break;
        }
        case 'pain': // Sandy takes one: grunt, breath, low thump
            osc('square', 280, 160, 0, 0.18, 0.18);
            noise('bandpass', 1200, 0, 0.12, 0.05, 1.5);
            osc('sine', 90, 50, 0, 0.12, 0.12);
            break;
        case 'enemy_pain': // staff grunt when splattered
            osc('square', 170 + Math.random() * 70, 110, 0, 0.13, 0.11);
            noise('bandpass', 850, 0, 0.07, 0.05, 2);
            osc('sawtooth', 320 + Math.random() * 80, 200, 0.02, 0.08, 0.04);
            break;
        case 'door_close': // hinge sweep, latch thunk, room tail
            osc('sawtooth', 52, 72, 0, 0.4, 0.08, 'linear');
            noise('bandpass', 400, 0, 0.3, 0.04, 4);
            noise('lowpass', 240, 0.34, 0.12, 0.13); // soft thunk at the end
            wet(osc('triangle', 180, 90, 0.34, 0.1, 0.06), 0.7);
            break;
        case 'wood_hit': // furniture takes a knock
            osc('triangle', 220 + Math.random() * 60, 90, 0, 0.08, 0.18);
            noise('lowpass', 1200, 0, 0.05, 0.1);
            noise('bandpass', 3200, 0, 0.02, 0.06, 2);
            break;
        case 'wood_break': { // furniture gives up
            noise('lowpass', 900, 0, 0.22, 0.28);
            osc('triangle', 160, 50, 0, 0.18, 0.25);
            osc('sine', 70, 40, 0, 0.25, 0.2);
            // splinter crackle
            for (let i = 0; i < 6; i++)
                noise('bandpass', 2200 + Math.random() * 1800, 0.02 + i * 0.035, 0.04, 0.1, 3);
            wet(noise('lowpass', 600, 0.1, 0.4, 0.08), 0.7);
            // pieces landing
            osc('triangle', 300, 200, 0.28, 0.05, 0.05); osc('triangle', 240, 160, 0.4, 0.05, 0.04);
            break;
        }
        case 'heartbeat': // low-health pulse: lub-dub with a sub layer
            osc('sine', 58, 36, 0, 0.12, 0.3);
            osc('sine', 50, 32, 0.16, 0.1, 0.2);
            noise('lowpass', 120, 0, 0.1, 0.1); noise('lowpass', 110, 0.16, 0.08, 0.07);
            break;
        case 'munch': // health pickup
            [0, 0.12, 0.24].forEach((t, i) => {
                noise('highpass', 6000, t, 0.05, 0.4 / (i + 1));
                noise('bandpass', 1600, t, 0.13, 0.3 / (i + 1), 1.5);
                noise('lowpass', 600, t, 0.09, 0.4 / (i + 1));
                osc('triangle', 260 - i * 30, 160, t, 0.06, 0.06);
            });
            break;
        case 'collect': { // supply pickup: the classic rising triad, now on celesta with a harp brush
            tone(INSTRUMENTS.CELESTA, 880, 0, 0.3, 0.7); tone(INSTRUMENTS.CELESTA, 1175, 0.05, 0.3, 0.7); tone(INSTRUMENTS.CELESTA, 1760, 0.1, 0.4, 0.7);
            noise('highpass', 7000, 0, 0.08, 0.05);
            break;
        }
        case 'money': { // coin: bright ticks and a glock ring
            [2400, 3200, 4000].forEach((f, i) => osc('square', f, f * 0.8, i * 0.05, 0.08, 0.08));
            tone(INSTRUMENTS.CELESTA, 1318, 0.15, 0.5, 0.8);
            noise('highpass', 8000, 0, 0.03, 0.06);
            break;
        }
        case 'table': { // grand fanfare blip for the main objective: brass triad, celesta, a soft crash
            [523, 659, 784, 1047].forEach((f, i) => tone(INSTRUMENTS.BRASS, f, i * 0.07, 0.45, 0.55));
            [523, 784, 1047].forEach((f, i) => tone(INSTRUMENTS.CELESTA, f * 2, i * 0.07 + 0.02, 0.5, 0.35));
            wet(noise('highpass', 5000, 0.2, 0.6, 0.06, 0.6), 1);
            break;
        }
        case 'step': { // surface follows the floor's room profile
            const surf = ROOMS[roomKey]?.step || 'concrete';
            const v = opts.vol ?? 1;
            if (surf === 'marble') { noise('bandpass', 1800 + Math.random() * 400, 0, 0.04, 0.16 * v, 2); osc('triangle', 900, 500, 0, 0.03, 0.06 * v); wet(noise('lowpass', 500, 0, 0.05, 0.09 * v), 0.8); }
            else if (surf === 'carpet') { noise('lowpass', 300 + Math.random() * 80, 0, 0.06, 0.12 * v); noise('bandpass', 900, 0, 0.03, 0.05 * v, 1.5); }
            else if (surf === 'wood') { osc('triangle', 180 + Math.random() * 40, 100, 0, 0.05, 0.1 * v); noise('lowpass', 700, 0, 0.05, 0.1 * v); }
            else if (surf === 'metal') { osc('triangle', 260 + Math.random() * 60, 140, 0, 0.06, 0.1 * v); noise('bandpass', 2400, 0, 0.05, 0.07 * v, 3); wet(noise('lowpass', 400, 0, 0.08, 0.08 * v), 0.9); }
            else { noise('lowpass', 350 + Math.random() * 100, 0, 0.05, 0.1 * v); noise('bandpass', 1500, 0, 0.02, 0.05 * v, 2); }
            break;
        }
        case 'jump': // push-off: cloth, breath, scuff
            noise('bandpass', 700, 0, 0.13, 0.07, 2);
            osc('sine', 220, 330, 0, 0.12, 0.05);
            noise('lowpass', 500, 0, 0.05, 0.05);
            break;
        case 'land': // landing: thud, scuff, gear rattle
            noise('lowpass', 320, 0, 0.09, 0.14);
            osc('sine', 130, 60, 0, 0.08, 0.1);
            noise('bandpass', 1800, 0.01, 0.04, 0.04, 2);
            osc('triangle', 600, 300, 0.02, 0.03, 0.03);
            break;
        case 'alert': // staff spotted Sandy: the classic rising blip plus a stab under it
            osc('sawtooth', 440, 880, 0, 0.2, 0.09, 'linear');
            tone(INSTRUMENTS.STAB, 220, 0, 0.25, 0.35);
            break;
        case 'door_open': // motor sweep, air, rail rumble, stop thunk
            osc('sawtooth', 80, 50, 0, 0.45, 0.13, 'linear');
            noise('bandpass', 320, 0, 0.45, 0.1, 5);
            noise('highpass', 3000, 0, 0.4, 0.02);
            wet(osc('triangle', 120, 80, 0.42, 0.08, 0.06), 0.6);
            break;
        case 'gate': // security gate: hydraulic lift, chain rattle, confirmation chime
            osc('triangle', 55, 110, 0, 0.7, 0.16, 'linear');
            noise('lowpass', 240, 0, 0.7, 0.1);
            for (let i = 0; i < 6; i++) osc('triangle', 800 + Math.random() * 400, 500, 0.05 + i * 0.1, 0.03, 0.03);
            tone(INSTRUMENTS.CELESTA, 880, 0.75, 0.5, 0.8);
            break;
        case 'enemy_death': // the classic fall, plus a paint slap and a dropped-weapon clatter
            osc('sawtooth', 400, 50, 0, 0.4, 0.2);
            osc('sine', 80, 30, 0.1, 0.3, 0.25);
            noise('lowpass', 700, 0.12, 0.15, 0.12);
            osc('triangle', 500, 300, 0.32, 0.05, 0.05); osc('triangle', 380, 250, 0.4, 0.05, 0.04);
            break;
        case 'elevator': // car arrival: motor, cable, doors, bell
            osc('triangle', 60, 120, 0, 0.9, 0.15, 'linear');
            noise('lowpass', 200, 0, 0.9, 0.06);
            noise('bandpass', 900, 0.1, 0.7, 0.03, 4);
            tone(INSTRUMENTS.CELESTA, 880, 0.85, 0.6, 0.9);
            break;
        case 'boss_roar': { // Head Designer: layered growl, choir dissonance, taiko and hall
            const g1 = osc('sawtooth', 50, 40, 0, 1.1, 0.3, 'linear');
            const g2 = osc('square', 52, 42, 0, 1.1, 0.22, 'linear');
            wet(g1); wet(g2);
            noise('lowpass', 300, 0, 1.0, 0.12);
            tone(INSTRUMENTS.CHOIR_DARK, 82.4, 0, 1.2, 0.9); tone(INSTRUMENTS.CHOIR_DARK, 87.3, 0.05, 1.2, 0.7);
            playDrum('taiko', now + 0.05, 0.9);
            tone(INSTRUMENTS.BRASS_LOW, 41.2, 0.1, 1.0, 0.7);
            break;
        }
        case 'fanfare': { // the ninth piece: victory fanfare on brass and timpani with a crash
            const mk = (f, t, d, v = 0.7) => tone(INSTRUMENTS.BRASS, f, t, d, v);
            mk(523, 0, 0.2); mk(659, 0.15, 0.2); mk(784, 0.3, 0.2); mk(1047, 0.45, 0.5);
            mk(523, 0.85, 0.8); mk(659, 0.85, 0.8); mk(784, 0.85, 0.8); mk(1047, 0.85, 0.8);
            [523, 659, 784, 1047].forEach((f, i) => tone(INSTRUMENTS.STRINGS, f, 0.85 + i * 0.01, 1.2, 0.5));
            playDrum('timpani', now + 0.0, 0.8); playDrum('timpani', now + 0.45, 0.8); playDrum('timpani', now + 0.85, 1);
            playDrum('crash', now + 0.85, 0.8);
            break;
        }
        case 'weapon_switch': // holster click, strap, draw
            osc('square', 600, 900, 0, 0.07, 0.1);
            noise('bandpass', 2400, 0, 0.05, 0.05, 2);
            noise('lowpass', 800, 0.06, 0.06, 0.05);
            break;
        case 'empty': // dry trigger
            osc('square', 220, 180, 0, 0.05, 0.08);
            noise('highpass', 3500, 0, 0.015, 0.08);
            break;
        case 'menu_move':
            osc('square', 700, null, 0, 0.04, 0.06);
            noise('highpass', 6000, 0, 0.02, 0.03);
            break;
        case 'menu_select':
            osc('square', 880, 1320, 0, 0.1, 0.1);
            tone(INSTRUMENTS.CELESTA, 1320, 0.02, 0.3, 0.4);
            break;
    }
}

// ------------------------------------------------------------------ AMBIENCE BEDS (M6.3)

let AMB = null;              // { key, nodes, timers, out }
let pendingAmbience = null;

const AMBIENCE_LEVEL = { menu: 0.55, lobby: 1, office: 1, archives: 1, showroom: 1, factory: 1, boss: 1 };

/** start (or switch to) a floor's looping bed; safe to call before the context exists */
export function startAmbience(key) {
    if (key === null || key === undefined) { stopAmbience(); return; }
    if (!G) { pendingAmbience = key; return; }
    if (AMB && AMB.key === key) return;
    stopAmbience();
    const ctx = G.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.001, ctx.currentTime);
    out.gain.linearRampToValueAtTime(AMBIENCE_LEVEL[key] ?? 1, ctx.currentTime + 1.2);
    out.connect(G.amb);
    const A = { key, nodes: [], timers: [], out };
    AMB = A;
    const t0 = ctx.currentTime;

    const loopNoise = (ftype, freq, q, gain, pan = 0) => {
        const n = ctx.createBufferSource(); n.buffer = getNoise(); n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = gain;
        const p = ctx.createStereoPanner(); p.pan.value = pan;
        n.connect(f); f.connect(g); g.connect(p); p.connect(out);
        n.start(t0); A.nodes.push(n);
        return { n, f, g };
    };
    const drone = (type, freq, cutoff, gain) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
        const g = ctx.createGain(); g.gain.value = gain;
        o.connect(f); f.connect(g); g.connect(out);
        o.start(t0); A.nodes.push(o);
        return { o, f, g };
    };
    const lfo = (param, rate, depth, type = 'sine') => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = rate;
        const g = ctx.createGain(); g.gain.value = depth;
        o.connect(g); g.connect(param); o.start(t0); A.nodes.push(o);
    };
    const every = (minS, maxS, fn) => { // timed one-shots (skipped in offline renders)
        if (G.offline) return;
        const tick = () => {
            if (AMB !== A) return;
            fn();
            A.timers.push(setTimeout(tick, (minS + Math.random() * (maxS - minS)) * 1000));
        };
        A.timers.push(setTimeout(tick, (minS * 0.5 + Math.random() * minS) * 1000));
    };
    // one-shot helpers that route into the bed (and its reverb send)
    const shot = (type, f0, f1, dur, vol, pan = 0, t = 0) => {
        const now = ctx.currentTime + t;
        const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
        o.type = type; p.pan.value = pan; o.connect(g); g.connect(p); p.connect(out);
        o.frequency.setValueAtTime(f0, now); if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
        const attack = Math.min(0.006, dur * 0.15);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(vol, now + attack);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.start(now); o.stop(now + dur + 0.02);
    };
    const puff = (ftype, freq, dur, vol, atk = 0.01, pan = 0, q = 1) => {
        const now = ctx.currentTime;
        const n = ctx.createBufferSource(); n.buffer = getNoise(); n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = pan;
        n.connect(f); f.connect(g); g.connect(p); p.connect(out);
        g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(vol, now + atk);
        g.gain.exponentialRampToValueAtTime(0.001, now + atk + dur);
        n.start(now); n.stop(now + atk + dur + 0.02);
    };

    switch (key) {
        case 'menu':
        case 'lobby': { // air handling, marble air, a distant elevator chime
            loopNoise('lowpass', 260, 0.7, 0.05);
            loopNoise('highpass', 7000, 0.5, 0.005);
            const h = drone('triangle', 60, 200, 0.012); lfo(h.g.gain, 0.09, 0.006);
            every(9, 16, () => { shot('sine', 1046, 0, 0.6, 0.02, 0.5); shot('sine', 1318, 0, 0.8, 0.016, 0.5, 0.35); });
            break;
        }
        case 'office': { // fluorescent buzz, HVAC, a printer, a phone nobody answers
            loopNoise('lowpass', 220, 0.7, 0.035);
            const b = drone('sawtooth', 120, 380, 0.009); lfo(b.g.gain, 7, 0.002);
            every(6, 11, () => { for (let i = 0; i < 6; i++) setTimeout(() => AMB === A && puff('highpass', 2500, 0.012, 0.04, 0.002, 0.6), i * 70 + Math.random() * 30); });
            every(20, 35, () => { [0, 0.55].forEach(t => { shot('sine', 440, 0, 0.4, 0.014, -0.6, t); shot('sine', 480, 0, 0.4, 0.014, -0.6, t); }); });
            break;
        }
        case 'archives': { // vault room tone, a fan, drips, the building settling
            loopNoise('lowpass', 140, 0.5, 0.06);
            const f = drone('triangle', 48, 120, 0.02); lfo(f.g.gain, 0.2, 0.008);
            every(3, 8, () => shot('sine', 1900, 1200, 0.07, 0.05, Math.random() * 1.2 - 0.6));
            every(25, 40, () => { shot('sawtooth', 90, 70, 0.6, 0.02, 0.3); });
            break;
        }
        case 'showroom': { // mall hum, crowd murmur, a PA chime
            loopNoise('bandpass', 420, 0.6, 0.04);
            const m = loopNoise('bandpass', 950, 0.8, 0.03); lfo(m.g.gain, 0.13, 0.015);
            loopNoise('lowpass', 200, 0.7, 0.03);
            every(18, 30, () => { shot('sine', 784, 0, 0.4, 0.03); shot('sine', 988, 0, 0.4, 0.03, 0, 0.3); shot('sine', 1175, 0, 0.8, 0.03, 0, 0.6); });
            break;
        }
        case 'factory': { // machine thrum, conveyor rattle, steam, clanks
            const th = drone('sawtooth', 55, 180, 0.055); lfo(th.g.gain, 2.1, 0.02);
            const r = loopNoise('highpass', 3000, 0.7, 0.01); lfo(r.g.gain, 6, 0.008, 'square');
            loopNoise('lowpass', 120, 0.6, 0.04);
            every(5, 9, () => puff('highpass', 1800, 0.45, 0.06, 0.05, Math.random() * 1.4 - 0.7));
            every(8, 14, () => { const pan = Math.random() * 1.4 - 0.7; shot('triangle', 420, 330, 0.14, 0.05, pan); puff('bandpass', 2600, 0.03, 0.04, 0.002, pan, 3); });
            break;
        }
        case 'boss': { // rain on glass, wind gusts, distant thunder
            const rain = loopNoise('highpass', 2400, 0.5, 0.045); lfo(rain.g.gain, 0.07, 0.012);
            const wind = loopNoise('bandpass', 320, 0.4, 0.05); lfo(wind.f.frequency, 0.08, 200); lfo(wind.g.gain, 0.11, 0.025);
            loopNoise('lowpass', 90, 0.5, 0.03);
            every(14, 28, () => { puff('lowpass', 90, 2.2, 0.22, 0.4, Math.random() * 1.2 - 0.6); });
            break;
        }
        default: break;
    }
}

export function stopAmbience(fade = 0.6) {
    pendingAmbience = null;
    if (!AMB) return;
    const A = AMB; AMB = null;
    for (const t of A.timers) clearTimeout(t);
    const ctx = G.ctx, now = ctx.currentTime;
    A.out.gain.cancelScheduledValues(now);
    A.out.gain.setValueAtTime(A.out.gain.value, now);
    A.out.gain.linearRampToValueAtTime(0.001, now + fade);
    for (const n of A.nodes) { try { n.stop(now + fade + 0.05); } catch (_) { /* already stopped */ } }
    setTimeout(() => { try { A.out.disconnect(); } catch (_) { /* gone */ } }, (fade + 0.2) * 1000);
}

// ------------------------------------------------------------------ DEBUG + OFFLINE RENDERS

const meterBuf = new Float32Array(1024);
let audioMonitorTimer = null;
let limiterEvents = 0;
let maxOutputPeak = 0;
let worstLimiterReduction = 0;
let lastLimiterLogAt = -Infinity;
/** master peak (0..1) for the on-screen meter */
export function getMeter() {
    if (!G) return { peak: 0, db: -90 };
    G.analyser.getFloatTimeDomainData(meterBuf);
    let peak = 0;
    for (let i = 0; i < meterBuf.length; i++) peak = Math.max(peak, Math.abs(meterBuf[i]));
    return { peak, db: peak > 0 ? 20 * Math.log10(peak) : -90, sfx: lastSfx };
}

let silentMusicSeconds = 0;
function busDb(analyser) {
    if (!analyser) return -90;
    analyser.getFloatTimeDomainData(meterBuf);
    let peak = 0;
    for (const value of meterBuf) peak = Math.max(peak, Math.abs(value));
    return peak > 0 ? Math.max(-90, 20 * Math.log10(peak)) : -90;
}
export function audioHealth() {
    return {
        state: G?.ctx.state ?? 'uninitialized', song: currentSongName, playing, muted,
        contextTime: +(G?.ctx.currentTime ?? 0).toFixed(2), step: step16,
        queuedMs: G && playing ? Math.round((nextNoteTime - G.ctx.currentTime) * 1000) : 0,
        schedulerAgeMs: playing ? Math.round(performance.now() - lastSchedulerAt) : 0,
        schedulerErrors, underruns: schedulerUnderruns,
        musicDb: +busDb(G?.musicAnalyser).toFixed(1), sfxDb: +busDb(G?.sfxAnalyser).toFixed(1),
        outputDb: +getMeter().db.toFixed(1),
        masterGain: G?.master.gain.value, musicGain: G?.music.gain.value, duckGain: G?.duck.gain.value,
        hidden: document.hidden,
    };
}
function monitorAudioOutput() {
    if (G && !G.offline && !document.hidden) resumeAudio('monitor');
    if (!G || G.offline || G.ctx.state !== 'running') return;
    const musicDb = busDb(G.musicAnalyser);
    silentMusicSeconds = playing && !muted && !document.hidden && musicDb < -75 ? silentMusicSeconds + 1 : 0;
    if (silentMusicSeconds === 5) gameLog('audio.music-silent', audioHealth(), 'warn');
    const meter = getMeter();
    const reduction = Number(G.limiter.reduction) || 0;
    maxOutputPeak = Math.max(maxOutputPeak, meter.peak);
    worstLimiterReduction = Math.min(worstLimiterReduction, reduction);
    if ((meter.peak > 0.985 || reduction < -6) && performance.now() - lastLimiterLogAt > 5000) {
        lastLimiterLogAt = performance.now();
        limiterEvents += 1;
        gameLog('audio.limiter-engaged', {
            peak: +meter.peak.toFixed(3),
            peakDb: +meter.db.toFixed(1),
            reductionDb: +reduction.toFixed(1),
            song: currentSongName,
            sfx: lastSfx,
        }, 'warn');
    }
}

export function audioDebug() {
    const meter = getMeter();
    return {
        health: audioHealth(),
        ctxState: G?.ctx.state ?? 'uninitialized',
        playing,
        song: currentSongName,
        step: step16,
        songBpm: currentSong?.bpm ?? null,
        muted,
        room: roomKey,
        roomLabel: ROOMS[roomKey]?.label,
        schedulerUnderruns,
        schedulerSkippedSteps,
        outputPeak: +meter.peak.toFixed(3),
        outputPeakDb: +meter.db.toFixed(1),
        maxOutputPeak: +maxOutputPeak.toFixed(3),
        mixReductionDb: +(Number(G?.comp?.reduction) || 0).toFixed(1),
        limiterReductionDb: +(Number(G?.limiter?.reduction) || 0).toFixed(1),
        worstLimiterReductionDb: +worstLimiterReduction.toFixed(1),
        limiterEvents,
        ambience: AMB?.key ?? null,
        mix: { ...mix },
        mixLog: mixLog.slice(),
        instruments: Object.keys(INSTRUMENTS),
        families: FAMILIES,
        sfx: SFX_TYPES.slice(),
        songs: Object.keys(getSongs()),
        orchestration: Object.fromEntries(Object.entries(ORCHESTRATION).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([t, vs]) => [t, vs.map(x => x[0] + (x[2] ? '*' : ''))]))])),
    };
}

/** run fn against a temporary offline graph and return the rendered buffer */
async function withOffline(seconds, fn, rate = 22050) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const saved = { G, audioCtx, noiseBuffer };
    try {
        G = buildGraph(ctx, true); audioCtx = ctx; noiseBuffer = null;
        fn(ctx);
        return ctx.startRendering();
    } finally {
        G = saved.G; audioCtx = saved.audioCtx; noiseBuffer = saved.noiseBuffer;
    }
}

function analyse(buf, sliceSec = 0.5) {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    let peak = 0, sum = 0;
    const slices = [];
    const per = Math.floor(buf.sampleRate * sliceSec);
    let acc = 0, n = 0;
    for (let i = 0; i < L.length; i++) {
        const v = (L[i] + R[i]) * 0.5;
        peak = Math.max(peak, Math.abs(v)); sum += v * v; acc += v * v; n++;
        if (n === per) { slices.push(+Math.sqrt(acc / n).toFixed(4)); acc = 0; n = 0; }
    }
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / L.length).toFixed(4), slices, seconds: +(L.length / buf.sampleRate).toFixed(2) };
}

/** render one note (or hit) of each instrument offline and report its level — the M6.1 demo */
export async function renderDemo(names = Object.keys(INSTRUMENTS)) {
    const out = {};
    for (const name of names) {
        const instr = INSTRUMENTS[name];
        if (!instr) continue;
        const isRiser = /RISER/.test(name);
        const buf = await withOffline(isRiser ? 2.6 : 2.0, () => {
            if (instr.drum) playDrum(instr.drum, 0.05, 1);
            else playNote(instr, name.includes('LOW') || name.includes('BASS') ? 65.4 : 261.6, 0.05, isRiser ? 2.0 : 0.8, 1);
        }, 44100);
        out[name] = analyse(buf);
    }
    return out;
}

/** render the first `seconds` of a song's modern orchestration offline; returns levels and (optionally) PCM */
export async function renderSong(name, seconds = 8, { pcm = false, rate = 22050 } = {}) {
    const s = getSongs()[name];
    if (!s) return null;
    const buf = await withOffline(seconds, () => {
        const step16Dur = (60 / s.bpm) / 4;
        let t = 0.05, step = 0;
        while (t < seconds) {
            const lean = (step % 2) ? (s.swing || 0) * step16Dur : 0;
            scheduleStep(s, ORCHESTRATION[name], step, t + lean);
            t += step16Dur; step++;
            if (step >= s.length * 4) step = 0;
        }
    }, rate);
    const res = { name, ...analyse(buf) };
    if (pcm) {
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        const mono = new Int16Array(L.length);
        for (let i = 0; i < L.length; i++) mono[i] = Math.max(-1, Math.min(1, (L[i] + R[i]) * 0.5)) * 32767;
        res.rate = rate;
        const bytes = new Uint8Array(mono.buffer); let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        res.pcm16 = btoa(bin);
    }
    return res;
}

/** render a cue (SFX) offline */
export async function renderSfx(type, seconds = 1.5) {
    const buf = await withOffline(seconds, () => { playSound(type); }, 44100);
    return { type, ...analyse(buf, 0.1) };
}
