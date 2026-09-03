/**
 * MAIN — boot sequence, menus, state machine, render loop.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LEVELS } from './levels.js';
import { getSurfaces } from './textures.js';
import { PostFX } from './postfx.js';
import { PROP_BUILDERS } from './props.js';
import { Game } from './game.js';
import { hud } from './hud.js';
import { initInput, onKeyPress, requestPointerLock, exitPointerLock, clearFrameInput, input, releaseAllKeys } from './input.js';
import { initAudio, startSong, stopMusic, playSound, toggleMute, isMuted, audioDebug, stopAmbience, getMeter, renderDemo, renderSong, renderSfx, songData, setMix } from './audio.js';

// original artwork, preserved from the 199X release
import memoryScreenUrl from './assets/memory_screen.png'; // DOS boot/memory screen
import titleScreenUrl from './assets/title_screen.png';   // pixel-art title card
import boxArtUrl from './assets/tableboxart2.png';        // box art (remaster edition)
import menuWorkbenchUrl from './assets/menu_workbench_bg.png';
import menuBrushUrl from './assets/menu_paintbrush_cursor.png';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ RENDERER

const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
// MODERN: shadow maps on (one directional key per floor, see lighting.js)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
scene.add(camera);

// MODERN: a procedural room environment (three's RoomEnvironment, no files)
// gives StandardMaterials something to reflect so roughness maps read.
// Kept faint so each floor's own lighting palette still sets the mood.
{
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.18;
    pmrem.dispose();
}

// MODERN: post-processing stack (bloom, grade, vignette, grain, motion blur)
const postfx = new PostFX(renderer, scene, camera);
postfx.enabled = localStorage.getItem('tq3d-postfx') !== 'off';

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    postfx.setSize(window.innerWidth, window.innerHeight);
});

function applyFloorLook() {
    renderer.toneMappingExposure = game.world?.rig?.exposure ?? 1.1;
    postfx.applyGrade(game.world?.rig?.grade || {});
}

// ------------------------------------------------------------------ STATE

let state = 'boot-memory'; // boot-memory, boot-title, menu, intro, play, pause, transition, gameover, victory
let menuIdx = 0;
let pauseIdx = 0;
let levelIdx = 0;
let menuSub = null; // null | 'instructions' | 'levels'
let introTimer = null;
let introFrame = null;
let introStartedAt = 0;
let levelSnapshot = null;
let menuBackdrop = false; // MODERN: Floor 1 loaded as the menu's live scene
let audioMeterOn = false;  // MODERN M6.3: on-screen audio debug meter (harness)
let menuCamT = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let highScore = Number(localStorage.getItem('tq3d-highscore') || 0);

const game = new Game(scene, camera, {
    onHUD: () => hud.update(game.player, game),
    onDeath: () => {
        setTimeout(() => {
            if (state !== 'play') return;
            setState('gameover');
        }, 900);
    },
    onLevelComplete: (stats) => {
        setState('transition');
        $('transition-stats').textContent =
            `Cartel staff splattered: ${stats.kills}/${stats.total} · Time: ${stats.time}s`;
        $('transition-bonus').textContent = `FLOOR BONUS +${stats.bonus}`;
        setTimeout(() => {
            const next = game.levelIndex + 1;
            noteFloorReached(next + 1);
            if (next < LEVELS.length) {
                window.TQ?.botCancel?.();
                game.loadLevel(next, { keepStats: true, silent: true });
                applyFloorLook();
                renderer.compile(scene, camera); // pre-warm shaders behind the card
                snapshotLevel();
                showLoading(next, () => { setState('play'); startSong(LEVELS[next].music); hud.floorCard(next + 1, LEVELS[next].name, LEVELS[next].subtitle); });
            }
        }, 2400);
    },
    onBossRage: () => { // MODERN M4.4: hotter, redder grade while he rages
        postfx.applyGrade({ ...(game.world?.rig?.grade || {}), tint: [1.12, 0.92, 0.9], contrast: 1.14, saturation: 0.95, vignette: 0.6, grain: 0.08, bloom: { strength: 0.6, threshold: 0.84 } });
    },
    onBossDefeated: () => {
        playSound('fanfare');
        stopMusic();
        stopAmbience(1.5);
        setTimeout(() => {
            game.player.score += 5000; // masterpiece bonus
            saveHighScore();
            $('victory-score').textContent = `FINAL SCORE: ${game.player.score.toLocaleString()}` +
                (game.player.score >= highScore ? '  ★ NEW RECORD ★' : '');
            setState('victory');
        }, 1800);
    },
});

function snapshotLevel() {
    const p = game.player;
    levelSnapshot = {
        score: p.score, ammo: p.ammo, health: p.health,
        weapons: [...p.weapons], currentWeapon: p.currentWeapon,
    };
}

function saveHighScore() {
    if (game.player.score > highScore) {
        highScore = game.player.score;
        localStorage.setItem('tq3d-highscore', String(highScore));
    }
}

const SCREENS = ['boot-memory', 'boot-title', 'menu-screen', 'menu-instructions', 'menu-levels', 'menu-options', 'screen-loading',
    'intro-screen', 'screen-transition', 'screen-gameover', 'screen-pause', 'screen-victory'];

function showOnly(...ids) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', !ids.includes(s));
}

function setState(next) {
    state = next;
    // leaving play must never carry held movement keys into the next context
    if (next !== 'play') {
        releaseAllKeys();
        // resolve pending autopilot orders so test scripts never freeze
        if (bot.resolve) { bot.resolve(next); bot.resolve = null; bot.target = null; }
        if (bot.fightResolve) { bot.fightResolve(next); bot.fightResolve = null; bot.fightFor = 0; }
    }
    switch (next) {
        case 'boot-memory': showOnly('boot-memory'); break;
        case 'boot-title': showOnly('boot-title'); break;
        case 'menu':
            showOnly('menu-screen');
            hud.hide();
            exitPointerLock();
            menuSub = null;
            // MODERN: the Lobby is the live backdrop (loaded silently: no music, no card)
            if (!menuBackdrop) { game.player = null; game.loadLevel(0, { keepStats: false, silent: true }); applyFloorLook(); renderer.compile(scene, camera); menuBackdrop = true; }
            menuCamT = 0;
            $('menu-highscore').textContent = String(highScore || 0).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            renderMenu();
            break;
        case 'intro': showOnly('intro-screen'); break;
        case 'loading': showOnly('screen-loading'); hud.hide(); exitPointerLock(); break;
        case 'play':
            showOnly();
            hud.show();
            hud.update(game.player, game);
            break;
        case 'pause':
            showOnly('screen-pause');
            exitPointerLock();
            pauseIdx = 0;
            $('pause-postfx-value').textContent = postfx.enabled ? 'ON' : 'OFF';
            renderPause();
            break;
        case 'transition': showOnly('screen-transition'); break;
        case 'gameover':
            saveHighScore();
            $('gameover-score').textContent = `SCORE: ${game.player.score.toLocaleString()}`;
            showOnly('screen-gameover');
            exitPointerLock();
            stopMusic();
            stopAmbience(1.0);
            break;
        case 'victory':
            showOnly('screen-victory');
            hud.hide();
            exitPointerLock();
            break;
    }
}

// ------------------------------------------------------------------ MENU

const MENU_ITEMS = ['New Game', 'Level Select', 'Options', 'Instructions', 'Toggle Sound'];
const MENU_DETAILS = [
    ['CASE FILE T-17', 'RECOVER THE TABLES', 'Begin the break-in at Cartel HQ.'],
    ['FLOOR PLANS', 'CHOOSE AN OPERATION', 'Jump to any unlocked cartel floor.'],
    ['FIELD SETTINGS', 'OPTIONS', 'Post-processing, field of view, mouse, sound.'],
    ['FIELD MANUAL', 'TOOLS OF THE TRADE', 'Review movement, weapons, and objectives.'],
    ['WORKSHOP AUDIO', 'SOUND SYSTEM', 'Toggle music and effects for this session.'],
];

// ------------------------------------------------------------------ OPTIONS (MODERN M3.3)
const OPTIONS = ['postfx', 'fov', 'sens', 'invert', 'sound'];
let optIdx = 0;
function renderOptions() {
    document.querySelectorAll('#option-rows .opt-row').forEach((el, i) => el.classList.toggle('selected', i === optIdx));
    $('opt-postfx').textContent = postfx.enabled ? 'ON' : 'OFF';
    $('opt-fov').textContent = String(Math.round(game.baseFov));
    $('opt-sens').textContent = (game.sens * 1000).toFixed(1);
    $('opt-invert').textContent = game.invertY ? 'ON' : 'OFF';
    $('opt-sound').textContent = isMuted() ? 'OFF' : 'ON';
}
function adjustOption(dir) {
    const key = OPTIONS[optIdx];
    if (key === 'postfx') { postfx.enabled = !postfx.enabled; localStorage.setItem('tq3d-postfx', postfx.enabled ? 'on' : 'off'); }
    else if (key === 'fov') {
        game.baseFov = Math.max(60, Math.min(100, game.baseFov + (dir || 1) * 2));
        camera.fov = game.baseFov; camera.updateProjectionMatrix();
        localStorage.setItem('tq3d-fov', String(game.baseFov));
    }
    else if (key === 'sens') game.adjustSensitivity((dir || 1) * 0.0002);
    else if (key === 'invert') { game.invertY = !game.invertY; localStorage.setItem('tq3d-invert', game.invertY ? '1' : '0'); }
    else if (key === 'sound') updateMute(toggleMute());
    playSound('menu_move');
    renderOptions();
}
document.querySelectorAll('#option-rows .opt-row').forEach((el, i) => {
    el.addEventListener('mouseenter', () => { optIdx = i; renderOptions(); });
    el.addEventListener('click', (e) => {
        optIdx = i;
        const arrows = [...el.querySelectorAll('.opt-arrow')];
        const which = arrows.indexOf(e.target);
        adjustOption(which === 0 ? -1 : 1);
    });
});

function renderMenu() {
    const items = document.querySelectorAll('#menu-items .menu-item');
    items.forEach((el, i) => {
        el.classList.toggle('selected', i === menuIdx);
        el.setAttribute('aria-selected', String(i === menuIdx));
        el.tabIndex = i === menuIdx ? 0 : -1;
    });
    $('menu-screen').dataset.menuSelection = String(menuIdx);
    const [eyebrow, title, copy] = MENU_DETAILS[menuIdx];
    $('menu-detail-eyebrow').textContent = eyebrow;
    $('menu-detail-title').textContent = title;
    $('menu-detail-copy').textContent = copy;
    $('menu-sound-value').textContent = isMuted() ? 'OFF' : 'ON';
    items[4].setAttribute('aria-pressed', String(isMuted()));
}

function renderPause() {
    document.querySelectorAll('#pause-items .menu-item').forEach((el, i) => {
        el.classList.toggle('selected', i === pauseIdx);
    });
}

// MODERN M3.4: floor facts read straight from the canonical maps
const WEAPON_CHAR = { L: 'TABLE LEG', N: 'NAIL GUN', R: 'ROLLER LAUNCHER', P: 'PAINT SPRAYER' };
function floorFacts(lvl) {
    const count = {};
    for (const row of lvl.map) for (const ch of row) count[ch] = (count[ch] || 0) + 1;
    const tables = count.T || 0;
    const staff = (count.g || 0) + (count.m || 0) + (count.x || 0) + (count.D || 0) + (count.G || 0);
    const menace = (count.g || 0) * 1 + (count.m || 0) * 2 + (count.x || 0) * 3.5 + (count.D || 0) * 2;
    const threat = lvl.boss ? ['BOSS', 't-boss'] : menace < 9 ? ['LOW', 't-low'] : menace < 16 ? ['MEDIUM', 't-med'] : ['HIGH', 't-high'];
    const finds = Object.keys(WEAPON_CHAR).filter(c => count[c]).map(c => WEAPON_CHAR[c]);
    return { tables, staff, threat, finds };
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const bestFloor = () => Number(localStorage.getItem('tq3d-best') || 1);
function noteFloorReached(n) { if (n > bestFloor()) localStorage.setItem('tq3d-best', String(n)); }

function buildLevelList() {
    const list = $('level-list');
    list.innerHTML = '';
    const best = bestFloor();
    // the elevation stacks top floor first; DOM order is still floor 1..6 for the key handler
    [...LEVELS].forEach((lvl, i) => {
        const el = document.createElement('div');
        el.className = 'level-item' + (i === levelIdx ? ' selected' : '') + (i + 1 > best ? ' uncharted' : '') + (lvl.boss ? ' boss' : '');
        el.style.order = String(LEVELS.length - i); // flex order draws floor 6 at the top
        el.innerHTML = `<span class="fs-num">FLOOR ${i + 1}</span><span class="fs-name">${lvl.name}</span>${i + 1 > best ? '<span class="fs-tag">UNCHARTED</span>' : ''}<span class="fs-windows"></span>`;
        el.addEventListener('click', () => { levelIdx = i; startGameAt(i); });
        el.addEventListener('mouseenter', () => { levelIdx = i; renderLevelList(); });
        list.appendChild(el);
    });
    const shaft = $('fs-shaft');
    shaft.innerHTML = LEVELS.map((_, i) => `<span>${LEVELS.length - i}</span>`).join('');
    renderLevelList();
}

function renderLevelList() {
    document.querySelectorAll('#level-list .level-item').forEach((el, i) => el.classList.toggle('selected', i === levelIdx));
    document.querySelectorAll('#fs-shaft span').forEach((el, i) => el.classList.toggle('lit', LEVELS.length - i === levelIdx + 1));
    const lvl = LEVELS[levelIdx];
    const f = floorFacts(lvl);
    const uncharted = levelIdx + 1 > bestFloor();
    $('fs-detail').innerHTML = `
        <div class="fd-eyebrow">OPERATION ${String(levelIdx + 1).padStart(2, '0')} · ${uncharted ? 'UNCHARTED' : 'CLEARED FOR ENTRY'}</div>
        <div class="fd-name">${lvl.name}</div>
        <div class="fd-sub">${lvl.subtitle}</div>
        <div class="fd-stats">
            <div class="fd-stat"><span>TABLES</span><b>${lvl.boss ? '—' : f.tables}</b></div>
            <div class="fd-stat"><span>STAFF</span><b>${f.staff}</b></div>
            <div class="fd-stat"><span>THREAT</span><b class="${f.threat[1]}">${f.threat[0]}</b></div>
        </div>
        <div class="fd-row">FIELD FIND <b>${f.finds.length ? f.finds.join(' · ') : (lvl.boss ? 'THE HEAD DESIGNER' : 'NONE')}</b></div>
        <div class="fd-row">PALETTE <span class="fd-palette"><i style="background:${hex(lvl.fogColor)}"></i><i style="background:${hex(lvl.ambient)}"></i><i style="background:${hex(lvl.accent)}"></i><i style="background:${hex(lvl.decor?.rugColor ?? 0x333333)}"></i></span></div>
        <div class="fd-row">SCORE <b>${lvl.music.toUpperCase()}</b></div>
        <div class="fd-note">FLOOR SELECT GRANTS THE ARSENAL A RUN WOULD HAVE FOUND BY NOW. HIGH SCORES COUNT.</div>`;
}

function menuSelect() {
    playSound('menu_select');
    const item = MENU_ITEMS[menuIdx];
    if (item === 'New Game') startIntro();
    else if (item === 'Level Select') { menuSub = 'levels'; levelIdx = 0; buildLevelList(); showOnly('menu-screen', 'menu-levels'); }
    else if (item === 'Options') { menuSub = 'options'; optIdx = 0; renderOptions(); showOnly('menu-screen', 'menu-options'); }
    else if (item === 'Instructions') { menuSub = 'instructions'; showOnly('menu-screen', 'menu-instructions'); }
    else if (item === 'Toggle Sound') updateMute(toggleMute());
}

function updateMute(m) {
    $('mute-indicator').classList.toggle('hidden', !m);
    $('menu-sound-value').textContent = m ? 'OFF' : 'ON';
    document.querySelectorAll('#menu-items .menu-item')[4].setAttribute('aria-pressed', String(m));
    if ($('opt-sound')) $('opt-sound').textContent = m ? 'OFF' : 'ON';
}

// menu mouse support
document.querySelectorAll('#menu-items .menu-item').forEach((el, i) => {
    el.addEventListener('click', () => { menuIdx = i; renderMenu(); menuSelect(); });
    el.addEventListener('mouseenter', () => { menuIdx = i; renderMenu(); });
    el.addEventListener('focus', () => { menuIdx = i; renderMenu(); });
});
document.querySelectorAll('#pause-items .menu-item').forEach((el, i) => {
    el.addEventListener('click', () => { pauseIdx = i; renderPause(); pauseSelect(); });
    el.addEventListener('mouseenter', () => { pauseIdx = i; renderPause(); });
});

// ------------------------------------------------------------------ FLOW

function startIntro() {
    setState('intro');
    startSong('intro');
    // MODERN M3.5: typewriter briefing over the live Lobby. The lines come
    // straight out of the classic crawl markup, so the text can never drift.
    brief.lines = [];
    document.querySelectorAll('.intro-beat').forEach((beat, bi) => {
        for (const el of beat.children) {
            const text = el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+\n/g, '\n').replace(/\s*\n\s*/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
            const cls = el.tagName === 'H1' ? 'h1' : el.tagName === 'H2' ? 'h2'
                : el.classList.contains('intro-overline') ? 'overline'
                : el.classList.contains('dramatic') ? 'dramatic'
                : el.classList.contains('intro-final-title') ? 'final-title'
                : el.classList.contains('emphasis') ? 'emphasis' : 'p';
            brief.lines.push({ text, cls, beat: bi });
        }
    });
    brief.total = brief.lines.reduce((n, l) => n + l.text.length, 0);
    // wall-clock timeline: each line starts after the previous one plus a breath
    // (longer between beats), so the briefing lasts the same on any frame rate
    let t = 0.6;
    brief.lines.forEach((l, i) => {
        l.start = t;
        t += l.text.length / CPS;
        l.end = t;
        const beatEnds = i + 1 < brief.lines.length && brief.lines[i + 1].beat !== l.beat;
        t += beatEnds ? 0.9 : 0.26;
    });
    brief.endAt = t;
    brief.i = 0; brief.c = 0; brief.doneAt = 0; brief.pauseUntil = 0;
    const box = $('briefing-text');
    box.innerHTML = '';
    brief.els = brief.lines.map((l) => { const d = document.createElement('div'); d.className = 'bl ' + l.cls; box.appendChild(d); return d; });
    introStartedAt = performance.now();
    brief.last = introStartedAt;
    if (introFrame) cancelAnimationFrame(introFrame);
    updateIntroPresentation();
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(finishIntro, (brief.endAt + 3.5 + 6) * 1000); // safety cap; the briefing ends itself sooner
}

const brief = { lines: [], els: [], i: 0, c: 0, total: 0, last: 0, doneAt: 0, pauseUntil: 0, satFloor: -1 };
const CPS = 42; // characters per second

function updateIntroPresentation() {
    if (state !== 'intro') return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - brief.last) / 1000);
    brief.last = now;

    // ---- typewriter (timeline-driven)
    const T = (now - introStartedAt) / 1000;
    let typed = 0, current = brief.lines.length;
    brief.lines.forEach((l, i) => {
        const el = brief.els[i];
        let n;
        if (T >= l.end) n = l.text.length;
        else if (T <= l.start) n = 0;
        else n = Math.floor((T - l.start) * CPS);
        typed += n;
        if (n < l.text.length && current === brief.lines.length) current = i;
        const shown = l.text.slice(0, n);
        if (el.textContent !== shown) el.textContent = shown;
        el.classList.toggle('typing', n > 0 && n < l.text.length);
    });
    brief.i = current; // beat index for the sat plan
    const box = $('briefing-text');
    box.scrollTop = box.scrollHeight;
    if (T > brief.endAt + 3.5) { finishIntro(); return; }

    // ---- progress bar (typed characters)
    const progress = brief.total ? typed / brief.total : 0;
    $('intro-screen').style.setProperty('--intro-progress', `${(progress * 100).toFixed(2)}%`);

    // ---- satellite plan: one floor per beat, scanning
    const beat = Math.min(LEVELS.length - 1, brief.i < brief.lines.length ? brief.lines[brief.i].beat : LEVELS.length - 1);
    drawSatPlan(beat, (now - introStartedAt) / 1000);
    introFrame = requestAnimationFrame(updateIntroPresentation);
}

const SAT_WALLS = new Set(['#', 'W', 'B', 'M', 'O', 'C']);
function drawSatPlan(floor, t) {
    if (brief.satFloor !== floor) { brief.satFloor = floor; brief.satT0 = t; $('mb-sat-floor').textContent = `FLOOR ${floor + 1} · ${LEVELS[floor].name.toUpperCase()}`; }
    drawSatPlanTo($('briefing-sat'), floor, Math.min(1, (t - brief.satT0) / 2.2), $('mb-sat-scan'));
}
/** blueprint scan of a floor into any canvas; reveal 0..1 draws it in from the top */
function drawSatPlanTo(c, floor, reveal, scanEl = null) {
    const ctx = c.getContext('2d');
    const lvl = LEVELS[floor];
    const rows = lvl.map, w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const k = Math.min((c.width - 20) / w, (c.height - 20) / h);
    const ox = (c.width - w * k) / 2, oy = (c.height - h * k) / 2;
    ctx.fillStyle = '#0a1a30'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = 'rgba(120,160,210,0.10)'; ctx.lineWidth = 1;
    for (let gx = 0; gx < c.width; gx += 18) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, c.height); ctx.stroke(); }
    for (let gy = 0; gy < c.height; gy += 18) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(c.width, gy); ctx.stroke(); }
    if (scanEl) scanEl.textContent = `${Math.round(reveal * 100).toString().padStart(2, '0')}%`;
    for (let y = 0; y < h; y++) {
        if (y / h > reveal) break;
        const row = rows[y].padEnd(w, lvl.wallChar);
        for (let x = 0; x < w; x++) {
            const ch = row[x];
            if (SAT_WALLS.has(ch)) ctx.fillStyle = '#a8c8e8';
            else if (ch === '+') ctx.fillStyle = '#c9a227';
            else if (ch === 'X') ctx.fillStyle = '#cc4433';
            else if (ch === 'E') ctx.fillStyle = '#3ae07a';
            else if (ch === 'T') ctx.fillStyle = '#ffd35a';
            else if (ch === 'G') ctx.fillStyle = '#ff3322';
            else continue;
            ctx.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
        }
    }
    // scan line + reticle
    const sy = oy + Math.min(1, reveal) * h * k;
    ctx.fillStyle = 'rgba(125,255,154,0.35)'; ctx.fillRect(0, sy - 1, c.width, 2);
    ctx.strokeStyle = 'rgba(255,211,90,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(ox - 4, oy - 4, w * k + 8, h * k + 8);
    for (const [cx, cy] of [[ox - 4, oy - 4], [ox + w * k + 4, oy - 4], [ox - 4, oy + h * k + 4], [ox + w * k + 4, oy + h * k + 4]]) {
        ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
    }
}

function finishIntro() {
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    if (introFrame) { cancelAnimationFrame(introFrame); introFrame = null; }
    startGameAt(0);
}

// ------------------------------------------------------------------ LOADING CARD (MODERN M3.6)
const FLOOR_TIPS = [
    'Break rooms hide Fritos. Cabinets hide cash. Everything hides splinters.',
    'Cubicle walls stop staff, not paint. Aim over them with the nail gun from the supply room.',
    'The reading rooms are dark. Let the compass bearings lead you to the tables.',
    'Display pods are glass: you can see the tables, but you still have to walk in.',
    'Fifteen staff on the line. The sprayer at the top of the floor pays for itself.',
    'The Head Designer rages under half health and knocks supplies loose. Keep moving.',
];
let loadingTimer = null, loadingNext = null, loadingStart = 0, loadingDur = 0;
const WEAPON_LABEL = { paintbrush: 'BRUSH', tableLeg: 'LEG', nailgun: 'NAILS', roller: 'ROLLER', sprayer: 'SPRAYER' };
function showLoading(idx, then, dur = 3400) {
    const lvl = LEVELS[idx];
    const facts = floorFacts(lvl);
    $('ml-num').textContent = idx + 1;
    $('ml-name').textContent = lvl.name;
    $('ml-sub').textContent = lvl.subtitle;
    $('ml-objective').textContent = lvl.boss ? 'DEFEAT THE HEAD DESIGNER' : `COLLECT ${facts.tables} TABLES · REACH THE ELEVATOR`;
    $('ml-tip').textContent = FLOOR_TIPS[idx] || '';
    $('ml-sat-label').textContent = `FLOOR ${idx + 1} · ${facts.staff} STAFF`;
    const owned = game.player?.weapons || ['paintbrush'];
    $('ml-arsenal').innerHTML = Object.entries(WEAPON_LABEL).map(([k, l]) => `<span class="${owned.includes(k) ? 'have' : ''}">${l}</span>`).join('');
    loadingNext = then; loadingStart = performance.now(); loadingDur = dur;
    setState('loading');
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = setTimeout(finishLoading, dur);
    drawSatPlanTo($('loading-sat'), idx, 0);
    const tick = () => {
        if (state !== 'loading') return;
        const t = (performance.now() - loadingStart) / 1000;
        $('screen-loading').style.setProperty('--ml-progress', `${Math.min(100, t / (loadingDur / 1000) * 100).toFixed(1)}%`);
        drawSatPlanTo($('loading-sat'), idx, Math.min(1, t / 2.0));
        requestAnimationFrame(tick);
    };
    tick();
}
function finishLoading() {
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    const fn = loadingNext; loadingNext = null;
    if (fn) fn();
}

function startGameAt(idx) {
    initAudio();
    window.TQ?.botCancel?.();
    menuBackdrop = false;
    game.player = null; // fresh run
    game.loadLevel(idx, { keepStats: false, silent: true });
    // floor-select fairness: grant the weapons a player would have found by now
    if (idx >= 2 && !game.player.weapons.includes('tableLeg')) game.player.weapons.push('tableLeg');
    if (idx >= 3 && !game.player.weapons.includes('nailgun')) game.player.weapons.push('nailgun');
    if (idx >= 4 && !game.player.weapons.includes('roller')) game.player.weapons.push('roller');
    if (idx >= 5 && !game.player.weapons.includes('sprayer')) game.player.weapons.push('sprayer');
    applyFloorLook();
    renderer.compile(scene, camera); // pre-warm shaders so play starts hitch-free
    snapshotLevel();
    // MODERN M3.6: floor card first, then deploy (Enter skips)
    showLoading(idx, () => { setState('play'); startSong(LEVELS[idx].music); hud.floorCard(idx + 1, LEVELS[idx].name, LEVELS[idx].subtitle); });
}

function retryFloor() {
    window.TQ?.botCancel?.();
    // restore the stats the player had when the floor began (with a mercy floor)
    if (levelSnapshot) {
        game.player = { ...game.newPlayer(), ...levelSnapshot, weapons: [...levelSnapshot.weapons] };
        game.player.health = Math.max(game.player.health, 75);
        game.player.ammo = Math.max(game.player.ammo, 20);
    }
    game.loadLevel(game.levelIndex, { keepStats: true, silent: true });
    applyFloorLook();
    renderer.compile(scene, camera);
    showLoading(game.levelIndex, () => { setState('play'); startSong(game.level.music); hud.floorCard(game.levelIndex + 1, game.level.name, game.level.subtitle); }, 1800);
}

function pauseSelect() {
    playSound('menu_select');
    const items = ['Resume', 'Restart Floor', 'Toggle Sound', 'Post FX', 'Quit to Menu'];
    const item = items[pauseIdx];
    if (item === 'Resume') { setState('play'); requestPointerLock(); }
    else if (item === 'Restart Floor') retryFloor();
    else if (item === 'Toggle Sound') updateMute(toggleMute());
    else if (item === 'Post FX') {
        postfx.enabled = !postfx.enabled;
        localStorage.setItem('tq3d-postfx', postfx.enabled ? 'on' : 'off');
        $('pause-postfx-value').textContent = postfx.enabled ? 'ON' : 'OFF';
    }
    else if (item === 'Quit to Menu') { stopMusic(); setState('menu'); startSong('menu'); }
}

$('btn-retry').addEventListener('click', () => { playSound('menu_select'); retryFloor(); });
$('btn-quit-menu').addEventListener('click', () => { setState('menu'); startSong('menu'); });
$('btn-victory-menu').addEventListener('click', () => { setState('menu'); startSong('menu'); });

// ------------------------------------------------------------------ INPUT

initInput(canvas);

onKeyPress((e) => {
    switch (state) {
        case 'boot-memory':
            setState('boot-title');
            initAudio();
            startSong('menu');
            armTitleTimer();
            break;
        case 'boot-title':
            clearTimeout(bootTimer);
            setState('menu');
            break;
        case 'menu':
            if (menuSub === 'instructions') {
                if (['Enter', 'Escape', 'Space'].includes(e.code)) { menuSub = null; showOnly('menu-screen'); }
            } else if (menuSub === 'options') {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { optIdx = (optIdx + OPTIONS.length - 1) % OPTIONS.length; playSound('menu_move'); renderOptions(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { optIdx = (optIdx + 1) % OPTIONS.length; playSound('menu_move'); renderOptions(); }
                else if (e.code === 'ArrowLeft' || e.code === 'KeyA') adjustOption(-1);
                else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Enter' || e.code === 'Space') adjustOption(1);
                else if (e.code === 'Escape') { menuSub = null; showOnly('menu-screen'); }
            } else if (menuSub === 'levels') {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { levelIdx = (levelIdx + LEVELS.length - 1) % LEVELS.length; playSound('menu_move'); renderLevelList(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { levelIdx = (levelIdx + 1) % LEVELS.length; playSound('menu_move'); renderLevelList(); }
                else if (e.code === 'Enter') startGameAt(levelIdx);
                else if (e.code === 'Escape') { menuSub = null; showOnly('menu-screen'); }
            } else {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { menuIdx = (menuIdx + MENU_ITEMS.length - 1) % MENU_ITEMS.length; playSound('menu_move'); renderMenu(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { menuIdx = (menuIdx + 1) % MENU_ITEMS.length; playSound('menu_move'); renderMenu(); }
                else if (e.code === 'Enter' || e.code === 'Space') menuSelect();
            }
            break;
        case 'intro':
            if (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space') finishIntro();
            break;
        case 'loading':
            if (e.code === 'Enter' || e.code === 'Space') finishLoading();
            break;
        case 'play':
            if (e.code === 'Escape') setState('pause');
            else if (e.code === 'Digit1') game.switchWeapon(1);
            else if (e.code === 'Digit2') game.switchWeapon(2);
            else if (e.code === 'Digit3') game.switchWeapon(3);
            else if (e.code === 'Digit4') game.switchWeapon(4);
            else if (e.code === 'Digit5') game.switchWeapon(5);
            else if (e.code === 'Tab') hud.toggleMinimap();
            else if (e.code === 'KeyU') updateMute(toggleMute());
            else if (e.code === 'BracketLeft') game.adjustSensitivity(-0.0004);
            else if (e.code === 'BracketRight') game.adjustSensitivity(0.0004);
            break;
        case 'pause':
            if (e.code === 'Escape') setState('play');
            else if (e.code === 'ArrowUp' || e.code === 'KeyW') { pauseIdx = (pauseIdx + 4) % 5; playSound('menu_move'); renderPause(); }
            else if (e.code === 'ArrowDown' || e.code === 'KeyS') { pauseIdx = (pauseIdx + 1) % 5; playSound('menu_move'); renderPause(); }
            else if (e.code === 'Enter') pauseSelect();
            break;
        case 'gameover':
            if (e.code === 'Enter') retryFloor();
            break;
        case 'victory':
            if (e.code === 'Enter') { setState('menu'); startSong('menu'); }
            break;
    }
});

// click anywhere advances boot screens; click canvas during play locks pointer
$('boot-memory').addEventListener('click', () => {
    if (state === 'boot-memory') { setState('boot-title'); initAudio(); startSong('menu'); armTitleTimer(); }
});
$('boot-title').addEventListener('click', () => {
    if (state === 'boot-title') { clearTimeout(bootTimer); setState('menu'); }
});
canvas.addEventListener('click', () => {
    if (state === 'play') requestPointerLock();
});

// losing pointer lock during play = pause (browser Esc behavior)
document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state === 'play' && input.everLocked) {
        setState('pause');
    }
});

// window losing focus during play = pause (and never leave keys stuck)
window.addEventListener('blur', () => {
    releaseAllKeys();
    if (state === 'play' && !testMode) setState('pause');
});

// ------------------------------------------------------------------ BOOT VISUALS

// MODERN M3.7: the untouched 199X screens go on the CRT tubes
$('tube-memory').style.backgroundImage = `url(${memoryScreenUrl})`;
$('tube-title').style.backgroundImage = `url(${titleScreenUrl})`;
// legacy boot auto-advances (any key or click still skips; §5-E default: once per session)
let bootTimer = setTimeout(() => { if (state === 'boot-memory') { setState('boot-title'); initAudio(); startSong('menu'); armTitleTimer(); } }, 4500);
function armTitleTimer() { clearTimeout(bootTimer); bootTimer = setTimeout(() => { if (state === 'boot-title') setState('menu'); }, 5000); }
$('menu-boxart').src = boxArtUrl;
$('menu-screen').style.setProperty('--menu-workbench-bg', `url(${menuWorkbenchUrl})`);
$('menu-screen').style.setProperty('--menu-brush-cursor', `url(${menuBrushUrl})`);
// (MODERN: the briefing renders over the live Lobby; the workbench backdrop is no longer used here)

const menuScreen = $('menu-screen');
menuScreen.addEventListener('pointermove', (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = menuScreen.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    menuScreen.style.setProperty('--menu-shift-x', `${(x * 10).toFixed(1)}px`);
    menuScreen.style.setProperty('--menu-shift-y', `${(y * 8).toFixed(1)}px`);
});
menuScreen.addEventListener('pointerleave', () => {
    menuScreen.style.setProperty('--menu-shift-x', '0px');
    menuScreen.style.setProperty('--menu-shift-y', '0px');
});

// ------------------------------------------------------------------ LOOP

let lastTime = performance.now();
let elapsed = 0;
let testMode = false; // lets automated playtests run while the tab is hidden

function step(now, render = true) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // game-time sleep for test scripts (DOM timers throttle in hidden tabs)
    if (bot.sleep > 0) {
        bot.sleep -= dt;
        if (bot.sleep <= 0 && bot.sleepResolve) { bot.sleepResolve(); bot.sleepResolve = null; }
    }
    if ((state === 'menu' || state === 'intro') && menuBackdrop) {
        // slow dolly along the Lobby entry hall toward the reception, gentle yaw sway
        if (!reducedMotion()) menuCamT += dt;
        const t = menuCamT;
        const x = 3.2 + ((Math.sin(t * 0.045) + 1) / 2) * 5.5;
        camera.position.set(x, 0.86 + Math.sin(t * 0.3) * 0.015, 2.6 + Math.sin(t * 0.11) * 0.4);
        camera.rotation.order = 'YXZ';
        camera.rotation.set(0.02 + Math.sin(t * 0.17) * 0.01, -Math.PI / 2 + 0.35 + Math.sin(t * 0.13) * 0.09, 0);
        game.vmRoot.visible = false;
    } else game.vmRoot.visible = true;
    if (state === 'play') {
        elapsed += dt;
        if (testMode) botStep(dt);
        game.update(dt, elapsed);
        hud.update(game.player, game);
        hud.drawFace(game.player, elapsed); // portrait lives on the pause panel now; cheap when hidden
        hud.drawMinimap(game, game.player);
        hud.setLockHint(!input.pointerLocked);
    }
    if (audioMeterOn) hud.audioMeter(audioDebug(), getMeter());
    if (state === 'pause') hud.drawFace(game.player, elapsed);
    if (render && (state === 'play' || state === 'pause' || state === 'transition' || state === 'gameover' || ((state === 'menu' || state === 'intro') && menuBackdrop))) {
        postfx.render(state === 'play' ? elapsed : menuCamT, state === 'play' ? (game.yawRate || 0) : 0);
    }
    clearFrameInput();
}

function loop(now) {
    requestAnimationFrame(loop);
    step(now);
}
requestAnimationFrame(loop);

// rAF stops in hidden tabs. For automated tests we pump the simulation from a
// self-posting MessageChannel, which (unlike DOM timers) is never throttled,
// and catch up to wall-clock with fixed substeps.
const pump = new MessageChannel();
let pumpActive = false;
pump.port1.onmessage = () => {
    if (!testMode || !document.hidden) { pumpActive = false; return; }
    const nowMs = performance.now();
    if (nowMs - lastTime >= 16.7) {
        const n = Math.min(12, Math.floor((nowMs - lastTime) / 16.7));
        for (let k = 0; k < n; k++) step(lastTime + 16.7, k === n - 1);
    }
    pump.port2.postMessage(0);
};
setInterval(() => {
    if (testMode && document.hidden && !pumpActive) {
        pumpActive = true;
        pump.port2.postMessage(0);
    }
}, 250);

// pause when the tab is hidden mid-game (players shouldn't get shot while away)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play' && !testMode) setState('pause');
});

// ---- test autopilot: runs inside the simulation, immune to timer throttling ----
const bot = { target: null, fightFor: 0, stuck: 0, lastD: 1e9, resolve: null, fightResolve: null, deadline: 0, sleep: 0, sleepResolve: null };

function botRelease() {
    input.forward = input.back = input.strafeL = input.strafeR = false;
    input.fireKeyHeld = false;
}

function botStep(dt) {
    // a level change invalidates any pending bot orders
    if (bot.levelIndex !== undefined && bot.levelIndex !== game.levelIndex) {
        bot.target = null; bot.fightFor = 0;
        botRelease();
        if (bot.resolve) { bot.resolve('level-changed'); bot.resolve = null; }
        if (bot.fightResolve) { bot.fightResolve('level-changed'); bot.fightResolve = null; }
        bot.levelIndex = game.levelIndex;
        return;
    }
    const p = game.player;
    if (!p || !p.alive) {
        if (bot.resolve) { bot.resolve('dead'); bot.resolve = null; bot.target = null; }
        if (bot.fightResolve) { bot.fightResolve('dead'); bot.fightResolve = null; bot.fightFor = 0; }
        botRelease();
        return;
    }
    if (bot.fightFor > 0) {
        bot.fightFor -= dt;
        const foes = game.enemies.filter(e => e.alive &&
            Math.hypot(e.x - p.x, e.y - p.y) < 11 && game.world.lineOfSight(p.x, p.y, e.x, e.y));
        if (foes.length && bot.fightFor > 0) {
            foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
            const e = foes[0];
            p.rot = Math.atan2(e.y - p.y, e.x - p.x);
            input.fireKeyHeld = true;
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            // out of paint? swing the table leg instead of starving
            const meleeIdx = p.weapons.indexOf('tableLeg');
            const usingMelee = p.weapons[p.currentWeapon] === 'tableLeg';
            if (p.ammo <= 0 && meleeIdx >= 0 && !usingMelee) game.switchWeapon(meleeIdx + 1);
            else if (p.ammo > 6 && usingMelee) game.switchWeapon(1);
            const isBoss = e.variant === 'boss';
            if (usingMelee && !isBoss) {
                input.forward = d > 1.2;
                input.back = false;
            } else {
                // kite: bosses get a wide berth, mobs a modest one
                input.back = d < (isBoss ? 5.5 : 2.4);
                input.forward = d > (isBoss ? 9 : 12);
            }
            // erratic dodge: sharp randomized strafe flips, like a human juking
            bot.swayTimer = (bot.swayTimer ?? 0) - dt;
            if (bot.swayTimer <= 0) {
                bot.swayTimer = 0.35 + Math.random() * 0.55;
                bot.swayDir = Math.random() < 0.5;
            }
            input.strafeL = bot.swayDir; input.strafeR = !bot.swayDir;
            return;
        }
        bot.fightFor = 0;
        botRelease();
        if (bot.fightResolve) { bot.fightResolve('clear'); bot.fightResolve = null; }
    }
    if (bot.target) {
        const [tx, ty] = bot.target;
        const d = Math.hypot(tx - p.x, ty - p.y);
        bot.deadline -= dt;
        if (d < 0.35 || bot.deadline <= 0) {
            const r = bot.resolve;
            bot.target = null; bot.resolve = null;
            input.forward = false;
            if (r) r(d < 0.35 ? 'arrived' : 'timeout');
            return;
        }
        p.rot = Math.atan2(ty - p.y, tx - p.x);
        input.forward = true;
        if (d > bot.lastD - 0.001) {
            bot.stuck += dt;
            if (bot.stuck > 0.35) { input.interact = true; bot.stuck = 0; }
        } else bot.stuck = 0;
        bot.lastD = d;
    }
}

// ------------------------------------------------------------------ DEBUG / PLAYTEST API

window.TQ = {
    get state() { return state; },
    get game() { return game; },
    get renderer() { return renderer; },
    get postfx() { return postfx; },
    get hud() { return hud; },
    openOptions() { setState('menu'); menuIdx = 2; renderMenu(); menuSelect(); return 'options'; },
    setPostFX(on = true) { postfx.enabled = !!on; return 'postfx ' + postfx.enabled; },
    get scene() { return scene; },
    get player() { return game.player; },
    setState,
    startGameAt(idx) { startGameAt(idx); finishLoading(); }, // harness: skip the loading card
    deploy() { finishLoading(); return state; },                   // harness: dismiss a loading card
    get propBuilders() { return PROP_BUILDERS; },
    /** MODERN M5.7 harness: lay every prop out in three rows (intact / damaged / wreck) */
    propSheetLayout(builders = PROP_BUILDERS) {
        const w = game.world;
        for (const rec of w.props.values()) w.propStore.remove(rec.mesh);
        w.props.clear(); w.propCells.clear(); w.tallProps.clear();
        for (const m of w.wrecks) w.propStore.remove(m); w.wrecks = [];
        const names = Object.keys(builders);
        names.forEach((name, i) => {
            ['intact', 'damaged', 'wreck'].forEach((st, row) => {
                const g = builders[name].build(st);
                g.position.set(2.5 + i * 1.5, 0, 2.0 + row * 2.2);
                w.propStore.add(g);
            });
        });
        w.rebuildPropBatch();
        return { placed: names.length * 3, drawCalls: w.propDrawCalls };
    },
    skipBoot() { setState('menu'); initAudio(); },
    godmode(on = true) { game.godmode = on; return 'godmode ' + on; },
    giveAll() {
        const p = game.player;
        p.weapons = ['paintbrush', 'tableLeg', 'nailgun', 'roller', 'sprayer'];
        p.ammo = 99;
        p.health = 100;
        game.updateViewmodel();
        return 'ok';
    },
    teleport(x, y) { game.player.x = x; game.player.y = y; return [x, y]; },
    collectAllTables() {
        for (const item of game.pickups)
            if (item.kind === 'table' && item.active) {
                game.player.x = item.x; game.player.y = item.y;
                game.updatePickups(0.016, elapsed);
            }
        return game.player.tables;
    },
    killAll() {
        for (const e of game.enemies) if (e.alive) game.damageEnemy(e, 99999);
        return 'ok';
    },
    warpElevator() {
        const [x, y] = game.world.elevatorCells[0] || [1, 1];
        game.player.x = x + 0.5; game.player.y = y + 0.5;
        return [x, y];
    },
    audioDebug,
    renderDemo, renderSong, renderSfx, songData, setMix, // MODERN M6: offline evidence renders + mix control
    showAudioMeter(on = true) { audioMeterOn = on; $('audio-meter').classList.toggle('hidden', !on); return on; },
    setTestMode(on = true) { testMode = on; return 'testMode ' + on; },
    botGoto(x, y, timeout = 25) {
        if (state !== 'play') return Promise.resolve(state);
        return new Promise(res => {
            bot.target = [x, y];
            bot.deadline = timeout;
            bot.lastD = 1e9;
            bot.resolve = res;
            bot.levelIndex = game.levelIndex;
        });
    },
    botSleep(seconds) {
        return new Promise(res => { bot.sleep = seconds; bot.sleepResolve = res; });
    },
    botCancel() {
        bot.target = null; bot.fightFor = 0; bot.resolve = null; bot.fightResolve = null;
        bot.levelIndex = undefined;
        return 'cancelled';
    },
    botFight(seconds = 12) {
        if (state !== 'play') return Promise.resolve(state);
        return new Promise(res => {
            bot.fightFor = seconds;
            bot.fightResolve = res;
            bot.levelIndex = game.levelIndex;
        });
    },
    /** MODERN debug: overlay a sheet of every surface's colour / normal / roughness maps. */
    textureSheet(show = true) {
        let el = document.getElementById('tq-texsheet');
        if (!show) { el?.remove(); return 'hidden'; }
        if (el) return 'shown';
        el = document.createElement('div');
        el.id = 'tq-texsheet';
        el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;overflow:auto;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font:11px monospace;color:#ddd';
        for (const [k, s] of Object.entries(getSurfaces())) {
            const cell = document.createElement('div');
            cell.innerHTML = `<div style="margin-bottom:2px">${k} ${s.canvases.color.width}px · rough ${s.cfg.rough} · metal ${s.cfg.metal}</div>`;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:2px';
            for (const c of [s.canvases.color, s.canvases.normal, s.canvases.roughness]) {
                const img = document.createElement('canvas');
                img.width = img.height = 96;
                img.getContext('2d').drawImage(c, 0, 0, 96, 96);
                row.appendChild(img);
            }
            cell.appendChild(row);
            el.appendChild(cell);
        }
        document.body.appendChild(el);
        return 'shown';
    },
    snapshot() {
        const p = game.player;
        return {
            state, level: game.levelIndex + 1, hp: p?.health, ammo: p?.ammo,
            tables: `${p?.tables}/${game.requiredTables}`, score: p?.score,
            enemies: game.enemiesAlive, pos: p ? [p.x.toFixed(1), p.y.toFixed(1)] : null,
        };
    },
};

console.log('%cSANDY\'S TABLE QUEST 3D — v2.0', 'color:#d9a066;font-size:16px;font-weight:bold');
