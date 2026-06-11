/**
 * MAIN — boot sequence, menus, state machine, render loop.
 */
import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { hud } from './hud.js';
import { initInput, onKeyPress, requestPointerLock, exitPointerLock, clearFrameInput, input, releaseAllKeys } from './input.js';
import { initAudio, startSong, stopMusic, playSound, toggleMute, isMuted, audioDebug } from './audio.js';

// original artwork, preserved from the 199X release
import dosScreenUrl from './assets/title_screen.jpg';     // DOS boot/memory screen
import titleArtUrl from './assets/memory_screen.png';     // pixel-art title card
import boxArtUrl from './assets/tableboxart.png';         // box art

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ RENDERER

const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
scene.add(camera);

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ STATE

let state = 'boot-memory'; // boot-memory, boot-title, menu, intro, play, pause, transition, gameover, victory
let menuIdx = 0;
let pauseIdx = 0;
let levelIdx = 0;
let menuSub = null; // null | 'instructions' | 'levels'
let introTimer = null;
let levelSnapshot = null;
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
            if (next < LEVELS.length) {
                window.TQ?.botCancel?.();
                game.loadLevel(next);
                snapshotLevel();
                setState('play');
            }
        }, 2600);
    },
    onBossDefeated: () => {
        playSound('fanfare');
        stopMusic();
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

const SCREENS = ['boot-memory', 'boot-title', 'menu-screen', 'menu-instructions', 'menu-levels',
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
            $('menu-highscore').textContent = highScore ? `HIGH SCORE: ${highScore.toLocaleString()}` : '';
            renderMenu();
            break;
        case 'intro': showOnly('intro-screen'); break;
        case 'play':
            showOnly();
            hud.show();
            hud.update(game.player, game);
            break;
        case 'pause':
            showOnly('screen-pause');
            exitPointerLock();
            pauseIdx = 0;
            renderPause();
            break;
        case 'transition': showOnly('screen-transition'); break;
        case 'gameover':
            saveHighScore();
            $('gameover-score').textContent = `SCORE: ${game.player.score.toLocaleString()}`;
            showOnly('screen-gameover');
            exitPointerLock();
            stopMusic();
            break;
        case 'victory':
            showOnly('screen-victory');
            hud.hide();
            exitPointerLock();
            break;
    }
}

// ------------------------------------------------------------------ MENU

const MENU_ITEMS = ['New Game', 'Level Select', 'Instructions', 'Toggle Sound'];

function renderMenu() {
    document.querySelectorAll('#menu-items .menu-item').forEach((el, i) => {
        el.classList.toggle('selected', i === menuIdx);
    });
}

function renderPause() {
    document.querySelectorAll('#pause-items .menu-item').forEach((el, i) => {
        el.classList.toggle('selected', i === pauseIdx);
    });
}

function buildLevelList() {
    const list = $('level-list');
    list.innerHTML = '';
    LEVELS.forEach((lvl, i) => {
        const el = document.createElement('div');
        el.className = 'level-item' + (i === levelIdx ? ' selected' : '');
        el.textContent = `Floor ${i + 1}: ${lvl.name}`;
        el.addEventListener('click', () => { levelIdx = i; startGameAt(i); });
        el.addEventListener('mouseenter', () => { levelIdx = i; renderLevelList(); });
        list.appendChild(el);
    });
}

function renderLevelList() {
    document.querySelectorAll('#level-list .level-item').forEach((el, i) => {
        el.classList.toggle('selected', i === levelIdx);
    });
}

function menuSelect() {
    playSound('menu_select');
    const item = MENU_ITEMS[menuIdx];
    if (item === 'New Game') startIntro();
    else if (item === 'Level Select') { menuSub = 'levels'; levelIdx = 0; buildLevelList(); showOnly('menu-screen', 'menu-levels'); }
    else if (item === 'Instructions') { menuSub = 'instructions'; showOnly('menu-screen', 'menu-instructions'); }
    else if (item === 'Toggle Sound') updateMute(toggleMute());
}

function updateMute(m) {
    $('mute-indicator').classList.toggle('hidden', !m);
}

// menu mouse support
document.querySelectorAll('#menu-items .menu-item').forEach((el, i) => {
    el.addEventListener('click', () => { menuIdx = i; renderMenu(); menuSelect(); });
    el.addEventListener('mouseenter', () => { menuIdx = i; renderMenu(); });
});
document.querySelectorAll('#pause-items .menu-item').forEach((el, i) => {
    el.addEventListener('click', () => { pauseIdx = i; renderPause(); pauseSelect(); });
    el.addEventListener('mouseenter', () => { pauseIdx = i; renderPause(); });
});

// ------------------------------------------------------------------ FLOW

function startIntro() {
    setState('intro');
    startSong('intro');
    const container = document.querySelector('.intro-container');
    container.style.transition = 'none';
    container.style.top = '100%';
    // force reflow then start the crawl
    container.offsetHeight;
    container.style.transition = 'top 55s linear';
    container.style.top = '-250%';
    introTimer = setTimeout(finishIntro, 55500);
}

function finishIntro() {
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    startGameAt(0);
}

function startGameAt(idx) {
    initAudio();
    window.TQ?.botCancel?.();
    game.player = null; // fresh run
    game.loadLevel(idx, { keepStats: false });
    // floor-select fairness: grant the weapons a player would have found by now
    if (idx >= 2 && !game.player.weapons.includes('tableLeg')) game.player.weapons.push('tableLeg');
    if (idx >= 5 && !game.player.weapons.includes('sprayer')) game.player.weapons.push('sprayer');
    snapshotLevel();
    setState('play');
}

function retryFloor() {
    window.TQ?.botCancel?.();
    // restore the stats the player had when the floor began (with a mercy floor)
    if (levelSnapshot) {
        game.player = { ...game.newPlayer(), ...levelSnapshot, weapons: [...levelSnapshot.weapons] };
        game.player.health = Math.max(game.player.health, 75);
        game.player.ammo = Math.max(game.player.ammo, 20);
    }
    game.loadLevel(game.levelIndex, { keepStats: true });
    setState('play');
}

function pauseSelect() {
    playSound('menu_select');
    const items = ['Resume', 'Restart Floor', 'Toggle Sound', 'Quit to Menu'];
    const item = items[pauseIdx];
    if (item === 'Resume') { setState('play'); requestPointerLock(); }
    else if (item === 'Restart Floor') retryFloor();
    else if (item === 'Toggle Sound') updateMute(toggleMute());
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
            break;
        case 'boot-title':
            setState('menu');
            break;
        case 'menu':
            if (menuSub === 'instructions') {
                if (['Enter', 'Escape', 'Space'].includes(e.code)) { menuSub = null; showOnly('menu-screen'); }
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
        case 'play':
            if (e.code === 'Escape') setState('pause');
            else if (e.code === 'Digit1') game.switchWeapon(1);
            else if (e.code === 'Digit2') game.switchWeapon(2);
            else if (e.code === 'Digit3') game.switchWeapon(3);
            else if (e.code === 'Tab') hud.toggleMinimap();
            else if (e.code === 'KeyU') updateMute(toggleMute());
            else if (e.code === 'BracketLeft') game.adjustSensitivity(-0.0004);
            else if (e.code === 'BracketRight') game.adjustSensitivity(0.0004);
            break;
        case 'pause':
            if (e.code === 'Escape') setState('play');
            else if (e.code === 'ArrowUp' || e.code === 'KeyW') { pauseIdx = (pauseIdx + 3) % 4; playSound('menu_move'); renderPause(); }
            else if (e.code === 'ArrowDown' || e.code === 'KeyS') { pauseIdx = (pauseIdx + 1) % 4; playSound('menu_move'); renderPause(); }
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
    if (state === 'boot-memory') { setState('boot-title'); initAudio(); startSong('menu'); }
});
$('boot-title').addEventListener('click', () => {
    if (state === 'boot-title') setState('menu');
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

$('boot-memory').style.backgroundImage = `url(${dosScreenUrl})`;
$('boot-title').style.backgroundImage = `url(${titleArtUrl})`;
$('menu-boxart').src = boxArtUrl;

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
    if (state === 'play') {
        elapsed += dt;
        if (testMode) botStep(dt);
        game.update(dt, elapsed);
        hud.update(game.player, game);
        hud.drawFace(game.player, elapsed);
        hud.drawMinimap(game, game.player);
        hud.setLockHint(!input.pointerLocked);
    }
    if (render && (state === 'play' || state === 'pause' || state === 'transition' || state === 'gameover')) {
        renderer.render(scene, camera);
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
    input.spaceHeld = false;
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
            input.spaceHeld = true;
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
    get player() { return game.player; },
    setState,
    startGameAt,
    skipBoot() { setState('menu'); initAudio(); },
    godmode(on = true) { game.godmode = on; return 'godmode ' + on; },
    giveAll() {
        const p = game.player;
        p.weapons = ['paintbrush', 'tableLeg', 'sprayer'];
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
