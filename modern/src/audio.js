/**
 * AUDIO SYSTEM V3 — subtractive synthesis, convolution reverb, multitrack
 * sequencer. All-new compositions for the 3D remaster; engine architecture
 * carried forward from the original Table Quest.
 */

let audioCtx = null;
let masterGain, musicGain, sfxGain, reverbNode, delayNode, delayFeedback, delayGain, compressorNode;
let muted = false;

export function isMuted() { return muted; }

export function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.6;
    return muted;
}

export function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.value = -12;
    compressorNode.knee.value = 35;
    compressorNode.ratio.value = 11;
    compressorNode.release.value = 0.25;
    compressorNode.connect(audioCtx.destination);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.6;
    // gentle smile EQ: a little warmth below, a little air on top
    const lowShelf = audioCtx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 130;
    lowShelf.gain.value = 1.6;
    const highShelf = audioCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 5200;
    highShelf.gain.value = 2.4;
    masterGain.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(compressorNode);

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.74;
    musicGain.connect(masterGain);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 1.0;
    sfxGain.connect(masterGain);

    // reverb bus
    reverbNode = audioCtx.createConvolver();
    const rate = audioCtx.sampleRate, dur = 2.6, len = rate * dur;
    const impulse = audioCtx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    }
    reverbNode.buffer = impulse;
    const reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.33;
    reverbNode.connect(reverbGain);
    reverbGain.connect(masterGain);

    // delay bus
    delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.28;
    delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.35;
    delayGain = audioCtx.createGain();
    delayGain.gain.value = 0.22;
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayGain);
    delayGain.connect(masterGain);
}

let noiseBuffer = null;
function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const len = audioCtx.sampleRate;
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

// ------------------------------------------------------------------ SYNTH

function playNote(instr, freq, time, duration, vol = 1.0, bus = null) {
    if (!audioCtx) return;
    bus = bus || musicGain;

    const mkSrc = (type, det) => {
        if (type === 'noise') {
            const s = audioCtx.createBufferSource();
            s.buffer = getNoise();
            s.loop = true;
            return s;
        }
        const o = audioCtx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, time);
        o.detune.value = det;
        return o;
    };

    const src1 = mkSrc(instr.type1 || 'sawtooth', -(instr.detune ?? 10));
    const src2 = mkSrc(instr.type2 || 'square', instr.detune ?? 10);

    const vcf = audioCtx.createBiquadFilter();
    const vca = audioCtx.createGain();
    // stereo staging: the two detuned voices sit left/right of center
    const width = instr.width ?? 0.2;
    const panL = audioCtx.createStereoPanner();
    const panR = audioCtx.createStereoPanner();
    panL.pan.value = -width;
    panR.pan.value = width;
    src1.connect(panL);
    src2.connect(panR);
    panL.connect(vcf);
    panR.connect(vcf);
    vcf.connect(vca);
    vca.connect(bus);
    if (instr.reverb) vca.connect(reverbNode);
    if (instr.delay) vca.connect(delayNode);

    if (instr.lfo) {
        const lfo = audioCtx.createOscillator();
        lfo.type = instr.lfoType || 'sine';
        lfo.frequency.value = instr.lfoRate || 5;
        const lg = audioCtx.createGain();
        lg.gain.value = instr.lfoDepth || 10;
        lfo.connect(lg);
        if (instr.lfoTarget === 'freq') {
            if (src1.detune) lg.connect(src1.detune);
            if (src2.detune) lg.connect(src2.detune);
        } else lg.connect(vcf.frequency);
        lfo.start(time);
        lfo.stop(time + duration + 0.5);
    }

    vcf.type = instr.filterType || 'lowpass';
    vcf.Q.value = instr.res || 1;
    const cutoff = instr.cutoff || 1200;
    vcf.frequency.setValueAtTime(cutoff, time);
    if (instr.filterEnv) {
        vcf.frequency.linearRampToValueAtTime(cutoff + (instr.filterEnvAmt || 2000), time + 0.04);
        vcf.frequency.exponentialRampToValueAtTime(cutoff, time + 0.3);
    }

    const atk = instr.attack ?? 0.01, dec = instr.decay ?? 0.1;
    const sus = instr.sustain ?? 0.5, rel = instr.release ?? 0.2;
    const v = (instr.vol ?? 0.5) * vol;
    vca.gain.setValueAtTime(0, time);
    vca.gain.linearRampToValueAtTime(v, time + atk);
    vca.gain.exponentialRampToValueAtTime(Math.max(v * sus, 0.001), time + atk + dec);
    vca.gain.setValueAtTime(Math.max(v * sus, 0.001), time + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, time + duration + rel);

    src1.start(time); src2.start(time);
    src1.stop(time + duration + rel + 0.3);
    src2.stop(time + duration + rel + 0.3);
}

function playDrum(type, time, vol = 1) {
    if (!audioCtx) return;
    const t = time;
    // place each drum in the stereo field like a real kit
    const kitOut = (pan) => {
        const p = audioCtx.createStereoPanner();
        p.pan.value = pan;
        p.connect(musicGain);
        return p;
    };
    if (type === 'kick') {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(musicGain); // kick stays dead center
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        g.gain.setValueAtTime(0.75 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        o.start(t); o.stop(t + 0.2);
    } else if (type === 'snare') {
        const out = kitOut(0.08);
        const n = audioCtx.createBufferSource();
        n.buffer = getNoise();
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 900;
        const g = audioCtx.createGain();
        n.connect(f); f.connect(g); g.connect(out); g.connect(reverbNode);
        g.gain.setValueAtTime(0.5 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
        n.start(t); n.stop(t + 0.2);
        const o = audioCtx.createOscillator(), og = audioCtx.createGain();
        o.connect(og); og.connect(out);
        o.frequency.setValueAtTime(190, t);
        og.gain.setValueAtTime(0.25 * vol, t);
        og.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        o.start(t); o.stop(t + 0.1);
    } else if (type === 'hat') {
        const out = kitOut(-0.25);
        const n = audioCtx.createBufferSource();
        n.buffer = getNoise();
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        const g = audioCtx.createGain();
        n.connect(f); f.connect(g); g.connect(out);
        g.gain.setValueAtTime(0.16 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        n.start(t); n.stop(t + 0.05);
    } else if (type === 'ride') {
        const out = kitOut(0.3);
        const n = audioCtx.createBufferSource();
        n.buffer = getNoise();
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7500;
        const g = audioCtx.createGain();
        n.connect(f); f.connect(g); g.connect(out); g.connect(reverbNode);
        g.gain.setValueAtTime(0.09 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.005, t + 0.34);
        n.start(t); n.stop(t + 0.36);
    } else if (type === 'tom') {
        const out = kitOut(Math.random() * 0.6 - 0.3); // toms roll across the kit
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(out); g.connect(reverbNode);
        o.type = 'sine';
        o.frequency.setValueAtTime(185, t);
        o.frequency.exponentialRampToValueAtTime(72, t + 0.22);
        g.gain.setValueAtTime(0.45 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.26);
        o.start(t); o.stop(t + 0.28);
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

// ------------------------------------------------------------------ SEQUENCER

let currentSong = null;
let nextNoteTime = 0;
let step16 = 0;
let playing = false;
let schedTimer = null;

export function startSong(name) {
    initAudio();
    const s = getSongs()[name];
    if (!s) return;
    stopMusic();
    currentSong = s;
    step16 = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;
    playing = true;
    scheduler();
}

export function audioDebug() {
    return {
        ctxState: audioCtx?.state ?? 'uninitialized',
        playing,
        step: step16,
        songBpm: currentSong?.bpm ?? null,
        muted,
    };
}

export function stopMusic() {
    playing = false;
    if (schedTimer) { clearTimeout(schedTimer); schedTimer = null; }
    if (musicGain && audioCtx) {
        // hard-cut any scheduled tails by swapping the bus
        musicGain.disconnect();
        musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.8;
        musicGain.connect(masterGain);
    }
}

function scheduler() {
    if (!playing || !audioCtx) return;
    while (nextNoteTime < audioCtx.currentTime + 0.12) {
        const step16Dur = (60 / currentSong.bpm) / 4;
        // swing: every off-16th leans late for a human pocket
        const lean = (step16 % 2) ? (currentSong.swing || 0) * step16Dur : 0;
        scheduleStep(step16, nextNoteTime + lean);
        nextNoteTime += step16Dur;
        step16++;
        if (step16 >= currentSong.length * 4) step16 = 0;
    }
    schedTimer = setTimeout(scheduler, 25);
}

function scheduleStep(step, time) {
    const beat = step / 4;
    const spb = 60 / currentSong.bpm;
    for (const [instrName, notes] of Object.entries(currentSong.tracks)) {
        const instr = INSTRUMENTS[instrName];
        if (!instr) continue;
        for (const n of notes) {
            if (Math.abs(n[0] - beat) < 0.001) {
                if (instr.drum) playDrum(instr.drum, time, n[3] ?? 1);
                else playNote(instr, n[1], time, n[2] * spb, n[3] ?? 1);
            }
        }
    }
}

// ------------------------------------------------------------------ SFX

export function playSound(type, opts = {}) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const out = sfxGain;

    const osc = (type, f0, f1, t0, dur, vol, ramp = 'exponential') => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(out);
        o.type = type;
        o.frequency.setValueAtTime(f0, now + t0);
        if (f1) o.frequency[ramp + 'RampToValueAtTime'](Math.max(f1, 1), now + t0 + dur);
        g.gain.setValueAtTime(vol, now + t0);
        g.gain.exponentialRampToValueAtTime(0.01, now + t0 + dur);
        o.start(now + t0); o.stop(now + t0 + dur + 0.05);
        return g;
    };
    const noise = (filterType, freq, t0, dur, vol, q = 1) => {
        const n = audioCtx.createBufferSource();
        n.buffer = getNoise(); n.loop = true;
        const f = audioCtx.createBiquadFilter();
        f.type = filterType; f.frequency.value = freq; f.Q.value = q;
        const g = audioCtx.createGain();
        n.connect(f); f.connect(g); g.connect(out);
        g.gain.setValueAtTime(vol, now + t0);
        g.gain.exponentialRampToValueAtTime(0.01, now + t0 + dur);
        n.start(now + t0); n.stop(now + t0 + dur + 0.02);
        return g;
    };

    switch (type) {
        case 'shoot':
            osc('sawtooth', 620, 90, 0, 0.18, 0.16);
            noise('highpass', 2000, 0, 0.08, 0.08);
            break;
        case 'spray':
            noise('bandpass', 3000 + Math.random() * 1000, 0, 0.09, 0.12, 2);
            osc('square', 300 + Math.random() * 100, 120, 0, 0.06, 0.05);
            break;
        case 'nail': // pneumatic snap
            osc('square', 1900 + Math.random() * 300, 300, 0, 0.05, 0.1);
            noise('highpass', 4500, 0, 0.04, 0.1);
            osc('sine', 140, 90, 0, 0.05, 0.08);
            break;
        case 'roller_fire': // heavy pneumatic thump
            osc('sine', 130, 55, 0, 0.2, 0.3);
            noise('lowpass', 700, 0, 0.14, 0.16);
            break;
        case 'roller_boom': { // wet paint detonation
            const g = osc('sine', 95, 30, 0, 0.4, 0.4);
            g.connect(reverbNode);
            noise('lowpass', 520, 0, 0.32, 0.3);
            noise('bandpass', 1100, 0.03, 0.18, 0.18, 1.5);
            osc('sine', 200, 70, 0.02, 0.16, 0.18);
            break;
        }
        case 'swing':
            noise('bandpass', 700, 0, 0.16, 0.14, 3);
            break;
        case 'hit':
            osc('sawtooth', 110, 25, 0, 0.16, 0.25, 'linear');
            noise('lowpass', 800, 0, 0.1, 0.12);
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
        case 'splat': {
            noise('lowpass', 900, 0, 0.12, 0.2);
            osc('sine', 200, 60, 0, 0.1, 0.15);
            break;
        }
        case 'pain':
            osc('square', 280, 160, 0, 0.18, 0.18);
            break;
        case 'enemy_pain': // staff grunt when splattered
            osc('square', 170 + Math.random() * 70, 110, 0, 0.13, 0.11);
            noise('bandpass', 850, 0, 0.07, 0.05, 2);
            break;
        case 'door_close':
            osc('sawtooth', 52, 72, 0, 0.4, 0.08, 'linear');
            noise('lowpass', 240, 0.34, 0.12, 0.13); // soft thunk at the end
            break;
        case 'wood_hit': // furniture takes a knock
            osc('triangle', 220 + Math.random() * 60, 90, 0, 0.08, 0.18);
            noise('lowpass', 1200, 0, 0.05, 0.1);
            break;
        case 'wood_break': { // furniture gives up
            noise('lowpass', 900, 0, 0.22, 0.28);
            osc('triangle', 160, 50, 0, 0.18, 0.25);
            // splinter crackle
            for (let i = 0; i < 4; i++)
                noise('bandpass', 2200 + Math.random() * 1800, 0.02 + i * 0.035, 0.04, 0.1, 3);
            break;
        }
        case 'heartbeat': // low-health pulse
            osc('sine', 58, 36, 0, 0.12, 0.3);
            osc('sine', 50, 32, 0.16, 0.1, 0.2);
            break;
        case 'munch': // health pickup
            [0, 0.12, 0.24].forEach((t, i) => {
                noise('highpass', 6000, t, 0.05, 0.4 / (i + 1));
                noise('bandpass', 1600, t, 0.13, 0.3 / (i + 1), 1.5);
                noise('lowpass', 600, t, 0.09, 0.4 / (i + 1));
            });
            break;
        case 'collect': {
            const mk = (f, t) => {
                const g = osc('sine', f, null, t, 0.18, 0.22);
                g.connect(reverbNode);
            };
            mk(880, 0); mk(1175, 0.05); mk(1760, 0.1);
            break;
        }
        case 'money': {
            [2400, 3200, 4000].forEach((f, i) => osc('square', f, f * 0.8, i * 0.05, 0.08, 0.1));
            const g = osc('sine', 1318, null, 0.15, 0.35, 0.2);
            g.connect(reverbNode);
            break;
        }
        case 'table': {
            // grand fanfare blip for the main objective
            [523, 659, 784, 1047].forEach((f, i) => {
                const g = osc('triangle', f, null, i * 0.07, 0.3, 0.2);
                g.connect(reverbNode);
            });
            break;
        }
        case 'step':
            noise('lowpass', 350 + Math.random() * 100, 0, 0.05, 0.05);
            break;
        case 'jump':
            noise('bandpass', 700, 0, 0.13, 0.07, 2);
            osc('sine', 220, 330, 0, 0.12, 0.05);
            break;
        case 'land':
            noise('lowpass', 320, 0, 0.09, 0.14);
            osc('sine', 130, 60, 0, 0.08, 0.1);
            break;
        case 'alert':
            osc('sawtooth', 440, 880, 0, 0.2, 0.09, 'linear');
            break;
        case 'door_open':
            osc('sawtooth', 80, 50, 0, 0.45, 0.13, 'linear');
            noise('bandpass', 320, 0, 0.45, 0.1, 5);
            break;
        case 'gate':
            osc('triangle', 55, 110, 0, 0.7, 0.16, 'linear');
            noise('lowpass', 240, 0, 0.7, 0.1);
            osc('sine', 880, null, 0.75, 0.4, 0.16);
            break;
        case 'enemy_death':
            osc('sawtooth', 400, 50, 0, 0.4, 0.2);
            osc('sine', 80, 30, 0.1, 0.3, 0.25);
            break;
        case 'elevator':
            osc('triangle', 60, 120, 0, 0.9, 0.15, 'linear');
            noise('lowpass', 200, 0, 0.9, 0.06);
            osc('sine', 880, null, 0.85, 0.4, 0.18);
            break;
        case 'boss_roar': {
            const g1 = osc('sawtooth', 50, 40, 0, 1.1, 0.3, 'linear');
            const g2 = osc('square', 52, 42, 0, 1.1, 0.22, 'linear');
            g1.connect(reverbNode); g2.connect(reverbNode);
            noise('lowpass', 300, 0, 1.0, 0.12);
            break;
        }
        case 'fanfare': {
            const mk = (f, t, d) => {
                const g = osc('square', f, null, t, d, 0.16);
                g.connect(reverbNode);
            };
            mk(523, 0, 0.2); mk(659, 0.15, 0.2); mk(784, 0.3, 0.2); mk(1047, 0.45, 0.5);
            mk(523, 0.85, 0.8); mk(659, 0.85, 0.8); mk(784, 0.85, 0.8); mk(1047, 0.85, 0.8);
            break;
        }
        case 'weapon_switch':
            osc('square', 600, 900, 0, 0.07, 0.1);
            break;
        case 'empty':
            osc('square', 220, 180, 0, 0.05, 0.08);
            break;
        case 'menu_move':
            osc('square', 700, null, 0, 0.04, 0.06);
            break;
        case 'menu_select':
            osc('square', 880, 1320, 0, 0.1, 0.1);
            break;
    }
}
