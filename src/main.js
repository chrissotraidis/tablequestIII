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
import { makeHand } from './handrig.js';
import { hud } from './hud.js';
import { drawFace as paintFace, FACE_DEFAULTS, FACE_STATES } from './face.js';
import { initInput, onKeyPress, requestPointerLock, exitPointerLock, clearFrameInput, input, releaseAllKeys, getBindings, setBinding, resetBindings, bindingLabel } from './input.js';
import { initAudio, recoverAudio, audioHealth, startSong, stopMusic, playSound, toggleMute, isMuted, audioDebug, stopAmbience, getMeter, renderDemo, renderSong, renderSfx, songData, setMix } from './audio.js';
import { gameLog, flushTelemetry, setLogContext, getGameLogs, downloadGameLogs, installErrorLogging } from './logger.js';
import { loadScores, startRankedRun, checkpointRankedRun, submitScore, cleanPlayerName } from './leaderboard.js';

installErrorLogging();
window.addEventListener('load', () => gameLog('boot.window-loaded', {
    ms: Math.round(performance.now()),
    transferBytes: performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
}));

// original artwork, preserved from the 199X release
import memoryScreenUrl from './assets/memory_screen.webp'; // lossless DOS boot/memory screen
import titleScreenUrl from './assets/title_screen.webp';   // lossless pixel-art title card
import boxArtUrl from './assets/tableboxart2.webp';        // lossless box art (remaster edition)
import menuWorkbenchUrl from './assets/menu_workbench_bg.webp';
import menuBrushUrl from './assets/menu_paintbrush_cursor.webp';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ RENDERER

const canvas = $('game-canvas');
const MAX_RENDER_PIXELS = 3_200_000;
let adaptiveRenderScale = 1;
let adaptivePerformanceMode = false;
const cssPixelCount = () => Math.max(1, window.innerWidth * window.innerHeight);
const preferredPixelRatio = () => Math.min(
    window.devicePixelRatio,
    1.25,
    Math.sqrt(MAX_RENDER_PIXELS / cssPixelCount())
) * adaptiveRenderScale;
// Full-display Retina/MSAA was shading far more pixels than the game can use
// and could stall both Level 2 and Web Audio. Keep AA on at ordinary sizes and
// trade a little resolution for stable pacing on very large canvases.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: cssPixelCount() <= MAX_RENDER_PIXELS });
let renderPixelRatio = preferredPixelRatio();
renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
// MODERN: shadow maps on (one directional key per floor, see lighting.js)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Accumulate all world, viewmodel and post-processing passes for one frame so
// performance telemetry reports the real scene cost instead of only the final quad.
renderer.info.autoReset = false;

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
    renderPixelRatio = preferredPixelRatio();
    renderer.setPixelRatio(renderPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    postfx.setSize(window.innerWidth, window.innerHeight);
    postfx.setPixelRatio(renderPixelRatio);
});

function applyFloorLook() {
    renderer.toneMappingExposure = game.world?.rig?.exposure ?? 1.1;
    postfx.applyGrade(game.world?.rig?.grade || {});
}

// ------------------------------------------------------------------ STATE

let state = 'boot-memory'; // boot-memory, boot-title, menu, intro, play, pause, transition, gameover, victory
let menuIdx = 0;
let pauseIdx = 0;
let pauseSub = null;
let pauseControlIdx = 0;
let captureBinding = null;
let levelIdx = 0;
let menuSub = null; // null | 'instructions' | 'levels' | 'options' | 'scoreboard' | 'versions'
let scoreboardReturn = 'menu';
let introTimer = null;
let introFrame = null;
let introStartedAt = 0;
let introScrollSeconds = 72;
let levelSnapshot = null;
let menuBackdrop = false; // MODERN: Floor 1 loaded as the menu's live scene
let generationPlayerOpen = false; // suspend hidden modern rendering while an older build owns the screen
let audioMeterOn = false;  // MODERN M6.3: on-screen audio debug meter (harness)
let turbo = 1;             // MODERN M7.1: simulation steps per frame in test mode (harness only)
let menuCamT = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let highScore = Number(localStorage.getItem('tq3d-highscore') || 0);
let rankedRun = { eligible: false, token: null, queue: Promise.resolve(), submitted: false };

function resetRankedRun(eligible) {
    const run = { eligible, token: null, queue: Promise.resolve(), submitted: false };
    rankedRun = run;
    if (!eligible) return;
    run.queue = startRankedRun().then(token => {
        run.token = token;
        gameLog('ranked-run.started', { available: true });
        return token;
    }).catch(() => null);
}

function markRankedFloor(floor) {
    if (!rankedRun.eligible) return Promise.resolve(false);
    rankedRun.queue = rankedRun.queue.then(async token => {
        if (!token) return null;
        await checkpointRankedRun(token, floor);
        gameLog('ranked-run.checkpoint', { floor });
        return token;
    }).catch(error => { gameLog('ranked-run.checkpoint-failed', { floor, message: error.message }, 'warn'); return null; });
    return rankedRun.queue;
}

const game = new Game(scene, camera, {
    onHUD: () => hud.update(game.player, game),
    onDeath: () => {
        const player = game.player;
        setTimeout(() => {
            if (state !== 'play' || game.player !== player || player.alive) return;
            setState('gameover');
        }, 900);
    },
    onLevelComplete: (stats) => {
        const world = game.world;
        markRankedFloor(game.levelIndex + 1);
        setState('transition');
        $('transition-stats').textContent =
            `Cartel staff splattered: ${stats.kills}/${stats.total} · Time: ${stats.time}s`;
        $('transition-bonus').textContent = `FLOOR BONUS +${stats.bonus}`;
        setTimeout(() => {
            if (game.world !== world || state !== 'transition') return;
            const next = game.levelIndex + 1;
            noteFloorReached(next + 1);
            if (next < LEVELS.length) {
                window.TQ?.botCancel?.();
                stopMusic();
                game.loadLevel(next, { keepStats: true, silent: true });
                applyFloorLook();
                snapshotLevel();
                showLoading(next, () => { setState('play'); startSong(LEVELS[next].music); hud.floorCard(next + 1, LEVELS[next].name, LEVELS[next].subtitle); });
            }
        }, 2400);
    },
    onBossRage: () => { // MODERN M4.4: hotter, redder grade while he rages
        postfx.applyGrade({ ...(game.world?.rig?.grade || {}), tint: [1.12, 0.92, 0.9], contrast: 1.14, saturation: 0.95, vignette: 0.6, grain: 0.08, bloom: { strength: 0.6, threshold: 0.84 } });
    },
    onBossDefeated: () => {
        const world = game.world;
        playSound('fanfare');
        stopMusic();
        stopAmbience(1.5);
        setTimeout(() => {
            if (game.world !== world || !['play', 'pause'].includes(state)) return;
            markRankedFloor(LEVELS.length);
            game.player.score += 5000; // masterpiece bonus
            saveHighScore();
            $('victory-score').textContent = `FINAL SCORE: ${game.player.score.toLocaleString()}` +
                (game.player.score >= highScore ? '  ★ NEW RECORD ★' : '');
            prepareVictoryScoreEntry();
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

const SCREENS = ['boot-memory', 'boot-title', 'menu-screen', 'menu-instructions', 'menu-levels', 'menu-options', 'menu-versions', 'menu-scoreboard', 'screen-loading',
    'intro-screen', 'screen-transition', 'screen-gameover', 'screen-pause', 'screen-victory'];

function showOnly(...ids) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', !ids.includes(s));
}

function setState(next) {
    if (state === 'loading' && next !== 'loading') {
        clearTimeout(loadingTimer);
        loadingNext = null;
    }
    if (state !== next) {
        setLogContext({ state: next, floor: game.levelIndex + 1 });
        gameLog('state.changed', { from: state, to: next });
    }
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
        // Keep an existing pointer lock across floor cards. Releasing it here made every
        // level transition require an extra click before the player could look around.
        case 'loading': showOnly('screen-loading'); hud.hide(); break;
        case 'play':
            if (!game.player.alive) { setState('gameover'); return; }
            releaseAllKeys();
            // Loading/pause time is not gameplay frame time, and must not
            // advance the simulation or trigger a permanent quality drop.
            lastTime = performance.now();
            perfWindow.startedAt = lastTime;
            perfWindow.frames = 0; perfWindow.frameMs.length = 0;
            showOnly();
            hud.show();
            hud.update(game.player, game);
            break;
        case 'pause':
            showOnly('screen-pause');
            exitPointerLock();
            pauseIdx = 0;
            pauseSub = null;
            captureBinding = null;
            $('pause-menu-panel').classList.remove('hidden');
            $('pause-controls-panel').classList.add('hidden');
            $('pause-postfx-value').textContent = postfx.enabled ? 'ON' : 'OFF';
            $('pause-floor').textContent = `FLOOR ${game.levelIndex + 1} · ${game.level.name.toUpperCase()}`;
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

const MENU_ITEMS = ['New Game', 'Level Select', 'Scoreboard', 'Options', 'Instructions', 'Toggle Sound', 'Versions'];
const MENU_DETAILS = [
    ['CASE FILE T-17', 'RECOVER THE TABLES', 'Begin the break-in at Cartel HQ.'],
    ['FLOOR PLANS', 'CHOOSE AN OPERATION', 'Jump to any unlocked cartel floor.'],
    ['GLOBAL RANKINGS', 'TOP 20 ARTISANS', 'View persistent scores from complete New Game campaigns.'],
    ['FIELD SETTINGS', 'OPTIONS', 'Pick any generation of the game, post-processing, field of view, mouse, sound.'],
    ['FIELD MANUAL', 'TOOLS OF THE TRADE', 'Review movement, weapons, and objectives.'],
    ['WORKSHOP AUDIO', 'SOUND SYSTEM', 'Toggle music and effects for this session.'],
    ['THE ARCHIVE', 'EVERY GENERATION', 'Play the 199X original and every 3D release inside this page.'],
];

// ------------------------------------------------------------------ OPTIONS (MODERN M3.3)
const OPTIONS = ['generation', 'scoreboard', 'postfx', 'fov', 'sens', 'smooth', 'adssens', 'adstoggle', 'invert', 'sprinttoggle', 'bob', 'sound'];
// Every release is a single-file build served beside this one.
const GENERATIONS = [
    { key: 'v3', label: 'GEN 3 · MODERN', note: 'THIS BUILD · 2026 · LIT 3D, MODERN GUNPLAY, WORKBENCH CHARM', url: null },
    { key: 'v21', label: 'GEN 2.1 · 3D REMASTER', note: 'CLASSIC · FIVE WEAPONS, DESTRUCTIBLE FURNITURE, WORKBENCH UI', url: 'generations/v2/index.html' },
    { key: 'v20', label: 'GEN 2.0 · FIRST 3D REMASTER', note: 'THE FIRST WEBGL BUILD · THREE WEAPONS · FIRST COMMIT', url: 'generations/v1/index.html' },
    { key: 'v1', label: 'GEN 1 · ORIGINAL 199X', note: 'THE CPU RAYCASTER · FOUR LEVELS · BRUSH AND TABLE LEG', url: 'generations/original/index.html' },
];
let genIdx = 0;
let optIdx = 0;
function renderOptions() {
    document.querySelectorAll('#option-rows .opt-row').forEach((el, i) => el.classList.toggle('selected', i === optIdx));
    $('opt-generation').textContent = GENERATIONS[genIdx].label;
    const gn = document.querySelector('.opt-row[data-opt="generation"] .opt-note'); if (gn) gn.textContent = GENERATIONS[genIdx].note + ' · ENTER';
    $('opt-postfx').textContent = postfx.enabled ? 'ON' : 'OFF';
    $('opt-fov').textContent = String(Math.round(game.baseFov));
    $('opt-sens').textContent = (game.sens * 1000).toFixed(1);
    $('opt-invert').textContent = game.invertY ? 'ON' : 'OFF';
    $('opt-smooth').textContent = ['RAW', 'LIGHT', 'MEDIUM', 'HEAVY'][Math.round(game.lookSmooth * 3)];
    $('opt-adssens').textContent = Math.round(game.adsSens * 100) + '%';
    $('opt-adstoggle').textContent = game.adsToggle ? 'TOGGLE' : 'HOLD';
    $('opt-sprinttoggle').textContent = game.sprintToggle ? 'TOGGLE' : 'HOLD';
    $('opt-bob').textContent = ['OFF', 'LOW', 'FULL'][Math.round(game.bobAmount * 2)];
    $('opt-sound').textContent = isMuted() ? 'OFF' : 'ON';
}
function renderScoreRows(scores) {
    const list = $('scoreboard-list');
    list.replaceChildren();
    if (!scores.length) {
        const empty = document.createElement('div'); empty.className = 'lb-empty';
        empty.textContent = 'NO RANKED RUNS YET — THE FIRST MASTERPIECE IS YOURS.';
        list.appendChild(empty); return;
    }
    scores.slice(0, 20).forEach((score, i) => {
        const row = document.createElement('div'); row.className = `lb-row${i < 3 ? ` top-${i + 1}` : ''}`;
        const rank = document.createElement('span'); rank.textContent = String(i + 1).padStart(2, '0');
        const name = document.createElement('b'); name.textContent = cleanPlayerName(score.name) || 'ANON';
        const value = document.createElement('strong'); value.textContent = Number(score.score || 0).toLocaleString();
        row.append(rank, name, value); list.appendChild(row);
    });
}
async function openScoreboard(from = 'options') {
    scoreboardReturn = from;
    menuSub = 'scoreboard';
    showOnly('menu-scoreboard');
    $('btn-scoreboard-back').textContent = from === 'menu' ? '← BACK TO MAIN MENU' : '← BACK TO OPTIONS';
    $('scoreboard-status').textContent = 'CONTACTING CARTEL MAINFRAME…';
    $('scoreboard-list').replaceChildren();
    try {
        const scores = await loadScores();
        renderScoreRows(scores);
        $('scoreboard-status').textContent = 'GLOBAL TOP 20 · COMPLETED NEW GAME RUNS ONLY';
    } catch {
        $('scoreboard-status').textContent = 'SCOREBOARD OFFLINE · START THE VPS SCOREBOARD SERVER TO CONNECT';
        renderScoreRows([]);
    }
}
function closeScoreboard() {
    if (scoreboardReturn === 'menu') {
        menuSub = null;
        renderMenu();
        showOnly('menu-screen');
        return;
    }
    menuSub = 'options';
    renderOptions();
    showOnly('menu-options');
}
function adjustOption(dir) {
    const key = OPTIONS[optIdx];
    if (key === 'generation') { genIdx = (genIdx + (dir || 1) + GENERATIONS.length) % GENERATIONS.length; }
    else if (key === 'scoreboard') { openScoreboard('options'); return; }
    else if (key === 'postfx') { postfx.enabled = !postfx.enabled; localStorage.setItem('tq3d-postfx', postfx.enabled ? 'on' : 'off'); }
    else if (key === 'fov') {
        game.baseFov = Math.max(60, Math.min(100, game.baseFov + (dir || 1) * 2));
        camera.fov = game.baseFov; camera.updateProjectionMatrix();
        localStorage.setItem('tq3d-fov', String(game.baseFov));
    }
    else if (key === 'sens') game.adjustSensitivity((dir || 1) * 0.0002);
    else if (key === 'invert') { game.invertY = !game.invertY; localStorage.setItem('tq3d-invert', game.invertY ? '1' : '0'); }
    else if (key === 'smooth') { game.lookSmooth = Math.max(0, Math.min(1, Math.round(game.lookSmooth * 3 + (dir || 1)) / 3)); localStorage.setItem('tq3d-smooth', String(game.lookSmooth)); }
    else if (key === 'adssens') { game.adsSens = Math.max(0.3, Math.min(1.2, +(game.adsSens + (dir || 1) * 0.1).toFixed(2))); localStorage.setItem('tq3d-adssens', String(game.adsSens)); }
    else if (key === 'adstoggle') { game.adsToggle = !game.adsToggle; localStorage.setItem('tq3d-adstoggle', game.adsToggle ? '1' : '0'); }
    else if (key === 'sprinttoggle') { game.sprintToggle = !game.sprintToggle; localStorage.setItem('tq3d-sprinttoggle', game.sprintToggle ? '1' : '0'); }
    else if (key === 'bob') { game.bobAmount = Math.max(0, Math.min(1, Math.round(game.bobAmount * 2 + (dir || 1)) / 2)); localStorage.setItem('tq3d-bob', String(game.bobAmount)); }
    else if (key === 'sound') updateMute(toggleMute());
    playSound('menu_move');
    renderOptions();
}
/** G5.2 / T6: play the selected generation inside this page — each is a single-file build served beside this one.
 *  The player is an overlay with a BACK TO MODERN bar, so switching between versions never navigates away. */
function launchGeneration(idx = genIdx) {
    const g = GENERATIONS[idx];
    playSound('menu_select');
    if (!g.url) { // Modern is this build: selecting it returns to its main menu.
        menuSub = null;
        versionIdx = 0;
        setState('menu');
        return;
    }
    stopMusic();
    $('gp-title').textContent = g.label;
    $('gp-newtab').href = g.url;
    $('gp-loading').textContent = `LOADING ${g.label} …`; $('gp-loading').classList.remove('hidden');
    generationPlayerOpen = true;
    $('gp-frame').src = g.url;
    $('gen-player').classList.remove('hidden');
    setTimeout(() => $('gp-frame').focus(), 50);
}
function closeGenerationPlayer() {
    generationPlayerOpen = false;
    $('gp-frame').src = 'about:blank';
    $('gen-player').classList.add('hidden');
    startSong('menu');
    playSound('menu_select');
}
$('gp-back').addEventListener('click', closeGenerationPlayer);
$('gp-frame').addEventListener('load', () => { if ($('gp-frame').src !== 'about:blank' && !$('gp-frame').src.endsWith('about:blank')) $('gp-loading').classList.add('hidden'); });
let versionIdx = 0;
function renderVersions() {
    const list = $('vs-list');
    if (!list.childElementCount) {
        list.innerHTML = GENERATIONS.map((g, i) => {
            const [gen, ...rest] = g.label.split(' · ');
            const action = g.url ? 'PLAY ▶' : 'YOU ARE HERE';
            return `<button class="vs-item${g.url ? '' : ' current'}" type="button" data-idx="${i}"><span class="vs-gen">${gen.replace('GEN ', '')}<small>GENERATION</small></span><span class="vs-name">${rest.join(' · ')}<small>${g.note.replace(' · ENTER', '')}</small></span><span class="vs-action">${action}</span></button>`;
        }).join('');
        list.querySelectorAll('.vs-item').forEach(el => {
            el.addEventListener('mouseenter', () => { versionIdx = Number(el.dataset.idx); renderVersions(); });
            el.addEventListener('click', () => { versionIdx = Number(el.dataset.idx); launchGeneration(versionIdx); });
        });
    }
    list.querySelectorAll('.vs-item').forEach((el, i) => el.classList.toggle('selected', i === versionIdx));
}
document.querySelectorAll('#option-rows .opt-row').forEach((el, i) => {
    el.addEventListener('mouseenter', () => { optIdx = i; renderOptions(); });
    el.addEventListener('click', (e) => {
        optIdx = i;
        const arrows = [...el.querySelectorAll('.opt-arrow')];
        const which = arrows.indexOf(e.target);
        if (OPTIONS[i] === 'scoreboard') { openScoreboard('options'); return; }
        if (which < 0 && OPTIONS[i] === 'generation') { launchGeneration(); return; }
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
    items[5].setAttribute('aria-pressed', String(isMuted()));
}

function renderPause() {
    document.querySelectorAll('#pause-items .menu-item').forEach((el, i) => {
        el.classList.toggle('selected', i === pauseIdx);
    });
}

const PAUSE_CONTROLS = [
    { key: 'sens', label: 'Mouse Sensitivity' },
    { key: 'ads', label: 'Aim Sensitivity' },
    { key: 'smooth', label: 'Look Smoothing' },
    { action: 'forward', label: 'Move Forward' }, { action: 'back', label: 'Move Back' },
    { action: 'left', label: 'Strafe Left' }, { action: 'right', label: 'Strafe Right' },
    { action: 'jump', label: 'Jump' }, { action: 'interact', label: 'Interact' },
    { action: 'melee', label: 'Quick Melee' }, { action: 'sprint', label: 'Sprint' },
    { action: 'fire', label: 'Keyboard Fire' }, { key: 'reset', label: 'Reset Controls' },
];
function pauseControlValue(row) {
    if (row.key === 'sens') return (game.sens * 1000).toFixed(1);
    if (row.key === 'ads') return `${Math.round(game.adsSens * 100)}%`;
    if (row.key === 'smooth') return ['RAW', 'LIGHT', 'MEDIUM', 'HEAVY'][Math.round(game.lookSmooth * 3)];
    if (row.key === 'reset') return 'DEFAULTS';
    return captureBinding === row.action ? 'PRESS A KEY…' : bindingLabel(getBindings()[row.action]);
}
function renderPauseControls() {
    const list = $('pause-controls-list');
    list.replaceChildren();
    PAUSE_CONTROLS.forEach((row, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `pause-control-row${i === pauseControlIdx ? ' selected' : ''}${captureBinding === row.action ? ' capture' : ''}`;
        button.innerHTML = `<span>${row.label}</span><b>${pauseControlValue(row)}</b>`;
        button.addEventListener('mousemove', () => {
            if (pauseControlIdx === i) return;
            pauseControlIdx = i;
            list.querySelectorAll('.pause-control-row').forEach((item, index) => item.classList.toggle('selected', index === i));
        });
        button.addEventListener('click', () => { pauseControlIdx = i; activatePauseControl(); });
        list.appendChild(button);
    });
    $('pause-controls-hint').textContent = captureBinding ? 'PRESS A KEY · ESC CANCELS' : '↑↓ SELECT · ←→ ADJUST · ENTER REMAP · ESC BACK';
}
function adjustPauseControl(dir) {
    const row = PAUSE_CONTROLS[pauseControlIdx];
    if (row.key === 'sens') game.adjustSensitivity(dir * 0.0002);
    else if (row.key === 'ads') { game.adsSens = Math.max(0.3, Math.min(1.2, +(game.adsSens + dir * 0.1).toFixed(2))); localStorage.setItem('tq3d-adssens', String(game.adsSens)); }
    else if (row.key === 'smooth') { game.lookSmooth = Math.max(0, Math.min(1, Math.round(game.lookSmooth * 3 + dir) / 3)); localStorage.setItem('tq3d-smooth', String(game.lookSmooth)); }
    renderPauseControls();
}
function activatePauseControl() {
    const row = PAUSE_CONTROLS[pauseControlIdx];
    if (row.action) captureBinding = row.action;
    else if (row.key === 'reset') { resetBindings(); hud.toast('CONTROLS RESET', 1000); }
    else adjustPauseControl(1);
    renderPauseControls();
}
function openPauseControls() {
    pauseSub = 'controls'; pauseControlIdx = 0; captureBinding = null;
    $('pause-menu-panel').classList.add('hidden');
    $('pause-controls-panel').classList.remove('hidden');
    renderPauseControls();
}
function closePauseControls() {
    pauseSub = null; captureBinding = null;
    $('pause-controls-panel').classList.add('hidden');
    $('pause-menu-panel').classList.remove('hidden');
    renderPause();
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
        el.addEventListener('click', () => { levelIdx = i; startGameAt(i); requestPointerLock(); });
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
        <div class="fd-note">FLOOR SELECT GRANTS THE ARSENAL A RUN WOULD HAVE FOUND BY NOW. GLOBAL RANKING REQUIRES NEW GAME.</div>`;
}

function menuSelect() {
    playSound('menu_select');
    const item = MENU_ITEMS[menuIdx];
    if (item === 'New Game') startIntro();
    else if (item === 'Level Select') { menuSub = 'levels'; levelIdx = 0; buildLevelList(); showOnly('menu-levels'); }
    else if (item === 'Scoreboard') openScoreboard('menu');
    else if (item === 'Options') { menuSub = 'options'; optIdx = 0; renderOptions(); showOnly('menu-options'); }
    else if (item === 'Instructions') { menuSub = 'instructions'; showOnly('menu-instructions'); }
    else if (item === 'Toggle Sound') updateMute(toggleMute());
    else if (item === 'Versions') { menuSub = 'versions'; versionIdx = 0; renderVersions(); showOnly('menu-versions'); }
}

function updateMute(m) {
    $('mute-indicator').classList.toggle('hidden', !m);
    $('menu-sound-value').textContent = m ? 'OFF' : 'ON';
    document.querySelectorAll('#menu-items .menu-item')[5].setAttribute('aria-pressed', String(m));
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
    resetRankedRun(true);
    setState('intro');
    startSong('intro');
    // One continuous film-reel crawl, driven by wall-clock time so its speed is
    // independent of frame rate. The story remains grouped semantically, but every
    // line is visible as part of the same uninterrupted scroll.
    const container = document.querySelector('.intro-container');
    const beats = [...document.querySelectorAll('.intro-beat')];
    beats.forEach((beat) => beat.classList.remove('is-focus', 'was-focus'));
    container.style.top = '0';
    $('intro-cut').classList.remove('go');
    $('intro-splat').classList.remove('go');
    brief.focus = -1; brief.satFloor = -1;
    // Scale the runtime to the actual story height. This keeps the last lines
    // readable on short screens, then holds the payoff before deployment.
    introScrollSeconds = Math.max(72, Math.min(105, (window.innerHeight + container.offsetHeight) / 42));
    introStartedAt = performance.now();
    if (introFrame) cancelAnimationFrame(introFrame);
    updateIntroPresentation();
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(finishIntro, (introScrollSeconds + INTRO_END_HOLD_SECONDS) * 1000);
}

const INTRO_END_HOLD_SECONDS = 4.5;
const brief = { focus: -1, satFloor: -1, satT0: 0 };

function updateIntroPresentation() {
    if (state !== 'intro') return;
    const T = (performance.now() - introStartedAt) / 1000;
    const container = document.querySelector('.intro-container');
    const progress = Math.min(1, T / introScrollSeconds);
    // End with the final lines sitting inside the lower-middle picture area,
    // not already disappearing past the top edge.
    const endY = window.innerHeight * 0.56 - container.offsetHeight;
    const y = THREE.MathUtils.lerp(window.innerHeight, endY, progress);
    container.style.transform = `translate(-50%, ${y}px)`;
    // Follow the nearest passage for the satellite plan without changing the text.
    const beats = [...document.querySelectorAll('.intro-beat')];
    const focusLine = window.innerHeight * 0.5;
    let nearest = -1, nearestDistance = Infinity;
    beats.forEach((beat, i) => {
        const rect = beat.getBoundingClientRect();
        // a beat that covers the centre line wins outright; otherwise the nearest edge decides
        const distance = rect.top <= focusLine && rect.bottom >= focusLine ? 0
            : Math.min(Math.abs(rect.top - focusLine), Math.abs(rect.bottom - focusLine));
        if (distance < nearestDistance) { nearest = i; nearestDistance = distance; }
    });
    if (nearest !== brief.focus) {
        brief.focus = nearest;
    }
    $('intro-screen').style.setProperty('--intro-progress', `${(progress * 100).toFixed(2)}%`);
    // satellite inset scans the floor named by the beat (one floor per beat)
    drawSatPlan(Math.max(0, Math.min(LEVELS.length - 1, nearest)), T);
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

function finishIntro(capturePointer = false) {
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    if (introFrame) { cancelAnimationFrame(introFrame); introFrame = null; }
    startGameAt(0, { ranked: true });
    if (capturePointer) requestPointerLock();
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
let loadingReady = false, loadingRequested = false;
const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));
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
    loadingReady = false; loadingRequested = false;
    document.querySelector('.ml-hint').textContent = 'PREPARING FLOOR…';
    setState('loading');
    if (loadingTimer) clearTimeout(loadingTimer);
    drawSatPlanTo($('loading-sat'), idx, 0);
    const tick = () => {
        if (state !== 'loading' || loadingNext !== then) return;
        const t = (performance.now() - loadingStart) / 1000;
        $('screen-loading').style.setProperty('--ml-progress', `${Math.min(100, t / (loadingDur / 1000) * 100).toFixed(1)}%`);
        drawSatPlanTo($('loading-sat'), idx, Math.min(1, t / 2.0));
        requestAnimationFrame(tick);
    };
    tick();
    // Paint the card before touching the GPU. compile() alone misses shadow,
    // viewmodel and post-processing passes and defers texture uploads to play.
    return (async () => {
        await nextPaint(); await nextPaint();
        if (loadingNext !== then) return;
        const started = performance.now();
        game.vmRoot.visible = true;
        game.updateCameraAndViewmodel(0, game.time);
        await renderer.compileAsync(scene, camera);
        if (loadingNext !== then) return;
        await renderer.compileAsync(scene, postfx.vmCamera);
        if (loadingNext !== then) return;
        postfx.render(game.time, 0);
        await nextPaint(); await nextPaint();
        if (loadingNext !== then) return;
        gameLog('level.render-ready', { floor: idx + 1, ms: Math.round(performance.now() - started) });
        loadingReady = true;
        document.querySelector('.ml-hint').textContent = 'PRESS ENTER OR CLICK TO DEPLOY';
        if (loadingRequested) finishLoading();
        else loadingTimer = setTimeout(finishLoading, Math.max(0, dur - (performance.now() - loadingStart)));
    })().catch(error => {
        gameLog('level.prepare-failed', { floor: idx + 1, message: error.message }, 'error');
        if (loadingNext === then) {
            setState('menu');
            hud.toast('COULD NOT PREPARE FLOOR — PLEASE TRY AGAIN', 4000);
        }
    });
}
function finishLoading(capturePointer = false) {
    if (state !== 'loading' || !loadingNext) return;
    if (!loadingReady) {
        loadingRequested = true;
        if (capturePointer) requestPointerLock();
        return;
    }
    if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    const fn = loadingNext; loadingNext = null;
    if (fn) fn();
    // A mouse click or key press on the deploy card is a valid user activation,
    // so use it to enter the level ready to look around immediately.
    if (capturePointer && state === 'play') requestPointerLock();
}

function startGameAt(idx, { ranked = false } = {}) {
    const prepStarted = performance.now();
    initAudio();
    // Do not ask the music scheduler to compete with synchronous world/shader
    // preparation. The floor starts from a fully primed schedule on deploy.
    stopMusic();
    if (!ranked) resetRankedRun(false);
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
    gameLog('level.prepared', { floor: idx + 1, ranked, ms: Math.round(performance.now() - prepStarted) });
    snapshotLevel();
    // MODERN M3.6: floor card first, then deploy (Enter skips)
    return showLoading(idx, () => { setState('play'); startSong(LEVELS[idx].music); hud.floorCard(idx + 1, LEVELS[idx].name, LEVELS[idx].subtitle); });
}

function retryFloor() {
    window.TQ?.botCancel?.();
    stopMusic();
    // restore the stats the player had when the floor began (with a mercy floor)
    if (levelSnapshot) {
        game.player = { ...game.newPlayer(), ...levelSnapshot, weapons: [...levelSnapshot.weapons] };
        game.player.health = Math.max(game.player.health, 75);
        game.player.ammo = Math.max(game.player.ammo, 20);
    }
    game.loadLevel(game.levelIndex, { keepStats: true, silent: true });
    applyFloorLook();
    return showLoading(game.levelIndex, () => { setState('play'); startSong(game.level.music); hud.floorCard(game.levelIndex + 1, game.level.name, game.level.subtitle); }, 1800);
}

function pauseSelect() {
    playSound('menu_select');
    const items = ['Resume', 'Restart Floor', 'Controls', 'Toggle Sound', 'Post FX', 'Recover Audio', 'Quit to Menu'];
    const item = items[pauseIdx];
    if (item === 'Resume') { setState('play'); requestPointerLock(); }
    else if (item === 'Restart Floor') retryFloor();
    else if (item === 'Controls') openPauseControls();
    else if (item === 'Toggle Sound') updateMute(toggleMute());
    else if (item === 'Post FX') {
        postfx.enabled = !postfx.enabled;
        localStorage.setItem('tq3d-postfx', postfx.enabled ? 'on' : 'off');
        $('pause-postfx-value').textContent = postfx.enabled ? 'ON' : 'OFF';
    }
    else if (item === 'Recover Audio') { recoverAudio(); flushTelemetry(); }
    else if (item === 'Quit to Menu') { stopMusic(); setState('menu'); startSong('menu'); }
}

$('btn-retry').addEventListener('click', () => { playSound('menu_select'); retryFloor(); });
$('btn-quit-menu').addEventListener('click', () => { setState('menu'); startSong('menu'); });
$('btn-victory-menu').addEventListener('click', () => { setState('menu'); startSong('menu'); });
$('btn-scoreboard-back').addEventListener('click', closeScoreboard);

function prepareVictoryScoreEntry() {
    const form = $('victory-score-form');
    const note = $('victory-score-note');
    form.classList.toggle('hidden', !rankedRun.eligible);
    note.classList.toggle('hidden', rankedRun.eligible);
    $('victory-submit-status').textContent = rankedRun.eligible ? 'TOP 20 SCORES ARE SAVED GLOBALLY' : '';
    $('victory-name').value = cleanPlayerName(localStorage.getItem('tq3d-player-name') || '');
    $('btn-submit-score').disabled = false;
}

$('victory-name').addEventListener('input', e => { e.target.value = cleanPlayerName(e.target.value); });
$('victory-score-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!rankedRun.eligible || rankedRun.submitted) return;
    const name = cleanPlayerName($('victory-name').value);
    if (!name) { $('victory-submit-status').textContent = 'ENTER A NAME'; return; }
    $('btn-submit-score').disabled = true;
    $('victory-submit-status').textContent = 'SUBMITTING…';
    try {
        const token = await rankedRun.queue;
        if (!token) throw new Error('Scoreboard unavailable');
        const result = await submitScore(token, name, game.player.score);
        rankedRun.submitted = true;
        localStorage.setItem('tq3d-player-name', name);
        $('victory-submit-status').textContent = result.rank > 0 ? `RANK #${result.rank} RECORDED` : 'RUN RECORDED';
        gameLog('ranked-run.submitted', { rank: result.rank, score: game.player.score });
    } catch (error) {
        $('btn-submit-score').disabled = false;
        $('victory-submit-status').textContent = error.message.toUpperCase();
    }
});

// ------------------------------------------------------------------ INPUT

initInput(canvas);

onKeyPress((e) => {
    if (e.target?.matches?.('input, textarea')) return;
    const wasPlaying = state === 'play';
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
            } else if (!$('gen-player').classList.contains('hidden')) {
                if (e.code === 'Escape') closeGenerationPlayer(); // keys only reach here while the iframe is not focused
            } else if (menuSub === 'versions') {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { versionIdx = (versionIdx + GENERATIONS.length - 1) % GENERATIONS.length; playSound('menu_move'); renderVersions(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { versionIdx = (versionIdx + 1) % GENERATIONS.length; playSound('menu_move'); renderVersions(); }
                else if (e.code === 'Enter' || e.code === 'Space') launchGeneration(versionIdx);
                else if (e.code === 'Escape') { menuSub = null; showOnly('menu-screen'); }
            } else if (menuSub === 'scoreboard') {
                if (['Enter', 'Escape', 'Space'].includes(e.code)) closeScoreboard();
            } else if (menuSub === 'options') {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { optIdx = (optIdx + OPTIONS.length - 1) % OPTIONS.length; playSound('menu_move'); renderOptions(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { optIdx = (optIdx + 1) % OPTIONS.length; playSound('menu_move'); renderOptions(); }
                else if (e.code === 'ArrowLeft' || e.code === 'KeyA') adjustOption(-1);
                else if (e.code === 'ArrowRight' || e.code === 'KeyD') adjustOption(1);
                else if (e.code === 'Enter' || e.code === 'Space') { if (OPTIONS[optIdx] === 'generation') launchGeneration(); else if (OPTIONS[optIdx] === 'scoreboard') openScoreboard('options'); else adjustOption(1); }
                else if (e.code === 'Escape') { menuSub = null; showOnly('menu-screen'); }
            } else if (menuSub === 'levels') {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { levelIdx = (levelIdx + LEVELS.length - 1) % LEVELS.length; playSound('menu_move'); renderLevelList(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { levelIdx = (levelIdx + 1) % LEVELS.length; playSound('menu_move'); renderLevelList(); }
                else if (e.code === 'Enter') { startGameAt(levelIdx); requestPointerLock(); }
                else if (e.code === 'Escape') { menuSub = null; showOnly('menu-screen'); }
            } else {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { menuIdx = (menuIdx + MENU_ITEMS.length - 1) % MENU_ITEMS.length; playSound('menu_move'); renderMenu(); }
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') { menuIdx = (menuIdx + 1) % MENU_ITEMS.length; playSound('menu_move'); renderMenu(); }
                else if (e.code === 'Enter' || e.code === 'Space') menuSelect();
            }
            break;
        case 'intro':
            if (e.code === 'Enter' || e.code === 'Space') finishIntro(true);
            else if (e.code === 'Escape') finishIntro();
            break;
        case 'loading':
            if (e.code === 'Enter' || e.code === 'Space') finishLoading(true);
            break;
        case 'play':
            if (e.code === 'Escape') setState('pause');
            else if (Object.values(getBindings()).includes(e.code)) break;
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
            if (pauseSub === 'controls') {
                if (captureBinding) {
                    if (e.code === 'Escape') captureBinding = null;
                    else if (setBinding(captureBinding, e.code)) { gameLog('controls.remapped', { action: captureBinding, code: e.code }); captureBinding = null; }
                    renderPauseControls();
                } else if (e.code === 'Escape') closePauseControls();
                else if (e.code === 'ArrowUp') { pauseControlIdx = (pauseControlIdx + PAUSE_CONTROLS.length - 1) % PAUSE_CONTROLS.length; renderPauseControls(); }
                else if (e.code === 'ArrowDown') { pauseControlIdx = (pauseControlIdx + 1) % PAUSE_CONTROLS.length; renderPauseControls(); }
                else if (e.code === 'ArrowLeft') adjustPauseControl(-1);
                else if (e.code === 'ArrowRight') adjustPauseControl(1);
                else if (e.code === 'Enter' || e.code === 'Space') activatePauseControl();
            } else if (e.code === 'Escape') setState('play');
            else if (e.code === 'ArrowUp' || e.code === 'KeyW') { pauseIdx = (pauseIdx + 6) % 7; playSound('menu_move'); renderPause(); }
            else if (e.code === 'ArrowDown' || e.code === 'KeyS') { pauseIdx = (pauseIdx + 1) % 7; playSound('menu_move'); renderPause(); }
            else if (e.code === 'Enter') pauseSelect();
            break;
        case 'gameover':
            if (e.code === 'Enter') retryFloor();
            break;
        case 'victory':
            if (e.code === 'Enter') { setState('menu'); startSong('menu'); }
            break;
    }
    // Confirmation/navigation keys belong to the screen that received them.
    // Space to deploy must not also jump on the first gameplay frame.
    return !wasPlaying || state !== 'play';
});

// click anywhere advances boot screens; click canvas during play locks pointer
$('boot-memory').addEventListener('click', () => {
    if (state === 'boot-memory') { setState('boot-title'); initAudio(); startSong('menu'); armTitleTimer(); }
});
$('boot-title').addEventListener('click', () => {
    if (state === 'boot-title') { clearTimeout(bootTimer); setState('menu'); }
});
$('intro-screen').addEventListener('click', () => {
    if (state === 'intro') finishIntro(true);
});
$('screen-loading').addEventListener('click', () => {
    if (state === 'loading') finishLoading(true);
});
canvas.addEventListener('click', () => {
    if (state === 'play') { initAudio(); requestPointerLock(); }
});

// losing pointer lock during play = pause (browser Esc behavior)
document.addEventListener('pointerlockchange', () => {
    gameLog('pointer-lock.changed', { locked: document.pointerLockElement === canvas, state });
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
$('intro-screen').style.setProperty('--intro-backdrop', `url(${menuWorkbenchUrl})`);
$('intro-screen').style.setProperty('--intro-brush', `url(${menuBrushUrl})`);
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

let frameNo = 0; const frameWaiters = []; // harness: TQ.settle(n) resolves after n rendered frames
const perfWindow = { startedAt: performance.now(), frames: 0, frameMs: [], slowWindows: 0 };
let lastFaceDrawAt = 0;
function samplePerformance(now, rawFrameMs) {
    if (state !== 'play' || testMode) { perfWindow.startedAt = now; perfWindow.frames = 0; perfWindow.frameMs.length = 0; return; }
    perfWindow.frames += 1;
    perfWindow.frameMs.push(rawFrameMs);
    if (now - perfWindow.startedAt < 5000) return;
    const seconds = (now - perfWindow.startedAt) / 1000;
    const sorted = [...perfWindow.frameMs].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
    const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] || 0;
    const max = sorted[sorted.length - 1] || 0;
    const longFrames = sorted.filter(ms => ms > 50).length;
    const fps = perfWindow.frames / seconds;
    const audio = audioDebug();
    gameLog('performance.sample', {
        floor: game.levelIndex + 1,
        fps: +fps.toFixed(1),
        p95FrameMs: +p95.toFixed(1),
        p99FrameMs: +p99.toFixed(1),
        maxFrameMs: +max.toFixed(1),
        longFrames,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderPixelRatio,
        postfx: postfx.enabled,
        audio: audio.health,
        audioState: audio.ctxState,
        audioUnderruns: audio.schedulerUnderruns,
        audioPeakDb: audio.outputPeakDb,
        limiterReductionDb: audio.limiterReductionDb,
        limiterEvents: audio.limiterEvents,
    }, fps < 52 || p95 > 24 || p99 > 45 || max > 100 ? 'warn' : 'info');
    perfWindow.slowWindows = fps < 50 || p95 > 28 ? perfWindow.slowWindows + 1 : 0;
    if (perfWindow.slowWindows >= 2 && !adaptivePerformanceMode) {
        adaptivePerformanceMode = true;
        adaptiveRenderScale = 0.82;
        renderPixelRatio = preferredPixelRatio();
        renderer.setPixelRatio(renderPixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        postfx.setPixelRatio(renderPixelRatio);
        postfx.setSize(window.innerWidth, window.innerHeight);
        postfx.setPerformanceMode(true);
        gameLog('performance.quality-reduced', { floor: game.levelIndex + 1, pixelRatio: +renderPixelRatio.toFixed(2), bloom: false }, 'warn');
        hud.toast('PERFORMANCE MODE ENABLED', 1600);
        perfWindow.slowWindows = 0;
    }
    perfWindow.startedAt = now; perfWindow.frames = 0; perfWindow.frameMs.length = 0;
}
function step(now, render = true) {
    const rawFrameMs = Math.max(0, now - lastTime);
    const dt = Math.min(0.05, rawFrameMs / 1000);
    lastTime = now;
    frameNo++;
    for (let i = frameWaiters.length - 1; i >= 0; i--) if (frameWaiters[i].at <= frameNo) { frameWaiters[i].res(frameNo); frameWaiters.splice(i, 1); }

    // game-time sleep for test scripts (DOM timers throttle in hidden tabs)
    if (bot.sleep > 0) {
        bot.sleep -= dt * (testMode && turbo > 1 && state === 'play' ? turbo : 1);
        if (bot.sleep <= 0 && bot.sleepResolve) { bot.sleepResolve(); bot.sleepResolve = null; }
    }
    if ((state === 'menu' || state === 'intro') && menuBackdrop && !generationPlayerOpen) {
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
        // harness turbo (M7.1): several fixed-dt simulation steps per rendered frame so the
        // software-rendered autopilot campaign runs in minutes; each step is a normal game step
        const steps = testMode && turbo > 1 ? turbo : 1;
        for (let i = 0; i < steps && state === 'play'; i++) {
            elapsed += dt;
            if (testMode) botStep(dt);
            game.update(dt, elapsed);
        }
        hud.update(game.player, game);
        if (now - lastFaceDrawAt > 66) { hud.drawFace(game.player, elapsed, game); lastFaceDrawAt = now; }
        hud.drawMinimap(game, game.player);
        hud.setLockHint(!input.pointerLocked);
    }
    if (audioMeterOn) hud.audioMeter(audioDebug(), getMeter());
    if (state === 'pause') hud.drawFace(game.player, elapsed, game);
    if (render && !generationPlayerOpen && (state === 'play' || state === 'pause' || state === 'transition' || state === 'gameover' || ((state === 'menu' || state === 'intro') && menuBackdrop))) {
        renderer.info.reset();
        postfx.render(state === 'play' ? elapsed : menuCamT, state === 'play' ? (game.yawRate || 0) : 0);
    }
    samplePerformance(now, rawFrameMs);
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
    openOptions() { setState('menu'); menuIdx = 3; renderMenu(); menuSelect(); return 'options'; },
    setPostFX(on = true) { postfx.enabled = !!on; return 'postfx ' + postfx.enabled; },
    get scene() { return scene; },
    get player() { return game.player; },
    get input() { return input; }, // R5 harness: drive look/move directly
    logs: getGameLogs,
    downloadLogs: downloadGameLogs,
    get THREE() { return THREE; },   // harness probes build vectors/matrices from the same three.js
    get frameNo() { return frameNo; },
    /** harness: resolves after n more rendered frames (headless renders ~1 frame/s, so timers are not enough) */
    settle(n = 3) { return new Promise(res => frameWaiters.push({ at: frameNo + n, res })); },
    setState,
    async startGameAt(idx) { await startGameAt(idx); finishLoading(); }, // harness: await render readiness, then deploy
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
    audioHealth,
    recoverAudio,
    renderDemo, renderSong, renderSfx, songData, setMix, // MODERN M6: offline evidence renders + mix control
    showAudioMeter(on = true) { audioMeterOn = on; $('audio-meter').classList.toggle('hidden', !on); return on; },
    setTestMode(on = true) { testMode = on; return 'testMode ' + on; },
    /** O1 harness: hand lab — one skinned hand gripping a plain handle in camera space, no tool.
     *  o: { side, radius, axis, out, mode, trigger, curl, curls, dz, dOut, scale, shoulder, wristRoll, view, zoom, dist, noSleeve, noHandle }
     *  view: 'front' | 'side' | 'top' | 'palm' | 'back' | 'front-low'. Pass null to restore. */
    handLab(o = null) {
        const g = game;
        if (!g.lab) { g.lab = new THREE.Group(); camera.add(g.lab); }
        for (const c of [...g.lab.children]) g.lab.remove(c);
        if (!o) { g.lab.visible = false; g.labOn = false; g.vmRoot.visible = true; g.vmRoot.traverse(o => { if (o.isMesh) o.visible = true; }); postfx.enabled = true; return 'off'; }
        const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95 }));
        back.position.set(0, 0, -2.2); back.layers.set(1); back.receiveShadow = true; g.lab.add(back);
        const fill = new THREE.PointLight(0xffffff, 2.2, 6, 2); fill.position.set(-0.8, 0.6, 0.4); fill.layers.set(1); g.lab.add(fill);
        const key2 = new THREE.PointLight(0xfff0dc, 3.0, 6, 2); key2.position.set(0.9, 0.9, 0.6); key2.layers.set(1); g.lab.add(key2);
        const T = new THREE.Group();
        const V3 = (a) => new THREE.Vector3().fromArray(a);
        const r = o.radius ?? 0.025; const A = V3(o.axis || [0, 1, 0.25]).normalize();
        if (!o.noHandle) {
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(r, r, o.length ?? 0.16, 24), new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.55 }));
            handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), A); handle.layers.set(1); handle.castShadow = handle.receiveShadow = true; T.add(handle);
            const axisMark = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.12), new THREE.MeshStandardMaterial({ color: 0xc03030, roughness: 0.6 }));
            axisMark.position.set(0, 0.11, -0.06); axisMark.layers.set(1); T.add(axisMark); // red bar shows the tool's forward (-Z) above the handle
        }
        const spec = { side: o.side || 'R', grip: new THREE.Vector3(0, 0, 0), radius: r, axis: A, out: o.out ? V3(o.out) : null, mode: o.mode || 'grip', trigger: !!o.trigger, curl: o.curl ?? 0.9, curls: o.curls || null, dz: o.dz ?? null, dOut: o.dOut ?? null, scale: o.scale, shoulder: o.shoulder ? V3(o.shoulder) : null, wristRoll: o.wristRoll || 0, noSleeve: !!o.noSleeve, watch: !!o.watch };
        const hand = makeHand(spec); T.add(hand);
        const views = { front: [0.15, 0, 0], 'front-low': [0.35, 0, 0], side: [0, -1.45, 0], sideL: [0, 1.45, 0], top: [1.3, 0, 0], palm: [0, 2.6, 0.2], back: [0, -0.3, 0] };
        const rv = views[o.view || 'front'] || views.front;
        T.rotation.set(rv[0], rv[1], rv[2]);
        T.position.set(o.x ?? 0, o.y ?? -0.01, -(o.dist ?? 0.42)); T.scale.setScalar(o.zoom ?? 1.2);
        g.lab.add(T); g.lab.visible = true; g.labOn = true; g.vmRoot.visible = false; g.vmRoot.traverse(o => { if (o.isMesh) o.visible = false; }); postfx.enabled = false;
        return 'lab ' + (o.view || 'front');
    },
    /** H3.1 harness: frame the viewmodel large against a neutral studio backdrop for critique shots.
     *  pose: 'hip' | 'ads' | 'fire' | 'sprint' | 'inspect' | 'off' (restore). */
    vmStudio(key = null, pose = 'hip') {
        const g = game;
        if (!g.studio) {
            const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95 }));
            back.position.set(0, 0, -2.2); back.layers.set(1);
            const fill = new THREE.PointLight(0xffffff, 2.2, 6, 2); fill.position.set(-0.8, 0.6, 0.4); fill.layers.set(1);
            const key2 = new THREE.PointLight(0xfff0dc, 3.0, 6, 2); key2.position.set(0.9, 0.9, 0.6); key2.layers.set(1);
            g.studio = new THREE.Group(); g.studio.add(back, fill, key2); g.studio.visible = false; camera.add(g.studio);
            g.studioSaved = { pos: g.vmRoot.position.clone(), rot: g.vmRoot.rotation.clone(), scale: g.vmRoot.scale.clone(), postfx: postfx.enabled };
        }
        if (pose === 'off') { g.studio.visible = false; g.studioOn = false; postfx.enabled = g.studioSaved.postfx; g.vmRoot.scale.copy(g.studioSaved.scale); return 'off'; }
        g.studio.visible = true; g.studioOn = true; postfx.enabled = false;
        if (key) { const idx = g.player.weapons.indexOf(key); if (idx >= 0) { g.player.currentWeapon = idx; g.updateViewmodel(true); } }
        g.studioPose = pose;
        g.aim = pose === 'ads' ? 1 : 0;
        if (pose === 'fire') { g.player.ammo = 99; g.player.cooldown = 0; g.fireWeapon(g.weaponDefs[g.player.weapons[g.player.currentWeapon]]); }
        return 'studio ' + pose;
    },

    /** R2.2 harness: every portrait state on one sheet (overlay); pass false to remove */
    faceSheet(show = true) {
        let el = document.getElementById('tq-facesheet');
        if (!show) { el?.remove(); return 'hidden'; }
        if (el) return 'shown';
        el = document.createElement('div'); el.id = 'tq-facesheet';
        el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#1a1410;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:16px;font:11px monospace;color:#e8dcc0;align-content:start';
        for (const [name, st] of Object.entries(FACE_STATES)) {
            const cell = document.createElement('div'); cell.style.textAlign = 'center';
            const c = document.createElement('canvas'); c.width = 192; c.height = 192; c.style.cssText = 'width:160px;height:160px;border:4px solid #5a3414;background:#26262b';
            const { time = 1.0, ...rest } = st;
            paintFace(c.getContext('2d'), { ...FACE_DEFAULTS, ...rest }, time);
            cell.appendChild(c); cell.appendChild(document.createTextNode(name)); el.appendChild(cell);
        }
        document.body.appendChild(el);
        return 'shown';
    },
    introT() { return state === 'intro' ? (performance.now() - introStartedAt) / 1000 : -1; }, // R1.2 harness: crawl clock
    setTurbo(n = 1) { turbo = Math.max(1, Math.min(16, n | 0)); return 'turbo ' + turbo; },
    retry() { retryFloor(); return state; },
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
