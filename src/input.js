/**
 * INPUT — keyboard + pointer-lock mouse look (yaw + pitch), wheel weapon cycling.
 */
export const input = {
    forward: false, back: false, strafeL: false, strafeR: false,
    turnL: false, turnR: false,
    fire: false,            // one-shot, consumed each frame
    jump: false,            // one-shot, consumed each frame
    fireKeyHeld: false, mouseHeld: false,
    interact: false, sprint: false,
    inspect: false,         // MODERN: hold F to look the weapon over
    aimHeld: false,         // MODERN: right mouse = aim down sights
    melee: false,           // MODERN: V = quick melee (one-shot)
    aimToggled: false,      // R5.3: C toggles aim (used when the ADS toggle option is on)
    sprintToggled: false,   // R5.3: Alt toggles sprint (used when the sprint toggle option is on)
    regrip: false,          // R5.3: R re-grips the tool (one-shot, cosmetic)
    cycleWeapon: 0,         // +1 / -1 per frame (wheel or Q)
    mouseDX: 0, mouseDY: 0,
    pointerLocked: false,
    everLocked: false,
};

export const fireHeld = () => input.fireKeyHeld || input.mouseHeld;

const DEFAULT_BINDINGS = Object.freeze({
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', interact: 'KeyE', melee: 'KeyV', sprint: 'ShiftLeft', fire: 'ControlLeft',
});
let bindings = { ...DEFAULT_BINDINGS };
try {
    const saved = JSON.parse(localStorage.getItem('tq3d-bindings') || '{}');
    for (const action of Object.keys(DEFAULT_BINDINGS)) if (typeof saved[action] === 'string') bindings[action] = saved[action];
} catch { /* invalid cached bindings fall back to defaults */ }

export function getBindings() { return { ...bindings }; }
export function bindingLabel(code) {
    return ({ Space: 'SPACE', ShiftLeft: 'LEFT SHIFT', ShiftRight: 'RIGHT SHIFT', ControlLeft: 'LEFT CTRL', ControlRight: 'RIGHT CTRL', AltLeft: 'LEFT ALT', AltRight: 'RIGHT ALT' })[code]
        || code.replace(/^Key/, '').replace(/^Digit/, '');
}
export function setBinding(action, code) {
    if (!(action in DEFAULT_BINDINGS) || !code || ['Escape', 'Enter'].includes(code)) return false;
    const old = bindings[action];
    const conflict = Object.keys(bindings).find(key => key !== action && bindings[key] === code);
    if (conflict) bindings[conflict] = old;
    bindings[action] = code;
    localStorage.setItem('tq3d-bindings', JSON.stringify(bindings));
    releaseAllKeys();
    return true;
}
export function resetBindings() {
    bindings = { ...DEFAULT_BINDINGS };
    localStorage.setItem('tq3d-bindings', JSON.stringify(bindings));
    releaseAllKeys();
    return getBindings();
}

const pressCallbacks = [];
export function onKeyPress(fn) { pressCallbacks.push(fn); }

let canvas = null;
let wheelAccum = 0;
let wheelDirection = 0;
let lastWheelCycle = -Infinity;
let discardNextMouseMove = false;
let pointerLockError = () => {};

export function initInput(canvasEl, { isPlaying = () => true, onPointerLockError = () => {} } = {}) {
    pointerLockError = onPointerLockError;
    canvas = canvasEl;

    window.addEventListener('keydown', (e) => {
        if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
        // Let menu links/buttons and Tab use the browser's native focus and
        // activation behavior. During play Tab still owns the tactical map.
        if (!isPlaying() && (e.code === 'Tab' ||
            (['Enter', 'Space'].includes(e.code) && e.target?.closest?.('a[href], [data-native-keys]')))) return;
        // Held state already persists until keyup. Repeating a key must not
        // toggle aim/sprint again or queue another jump/weapon change.
        if (e.repeat) return;
        const handled = pressCallbacks.some(fn => fn(e) === true);
        if (!handled) setKey(e.code, true);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'AltLeft', 'AltRight'].includes(e.code))
            e.preventDefault();
    });
    window.addEventListener('keyup', (e) => setKey(e.code, false));

    // window losing focus must never leave keys stuck down
    window.addEventListener('blur', releaseAllKeys);

    document.addEventListener('pointerlockchange', () => {
        releaseAllKeys();
        discardNextMouseMove = true;
        input.pointerLocked = document.pointerLockElement === canvas;
        if (input.pointerLocked) input.everLocked = true;
    });
    document.addEventListener('mousemove', (e) => {
        if (input.pointerLocked && isPlaying()) {
            // The first event after capture can be an OS cursor-warp delta.
            if (discardNextMouseMove) { discardNextMouseMove = false; return; }
            if (!Number.isFinite(e.movementX) || !Number.isFinite(e.movementY)) return;
            input.mouseDX += e.movementX;
            input.mouseDY += e.movementY;
        }
    });
    canvas.addEventListener('mousedown', (e) => {
        if (!input.pointerLocked || !isPlaying()) return;
        if (e.button === 0) { input.fire = true; input.mouseHeld = true; }
        if (e.button === 2) input.aimHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) input.mouseHeld = false;
        if (e.button === 2) input.aimHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
        const direction = Math.sign(e.deltaY);
        if (direction && direction !== wheelDirection) wheelAccum = 0;
        wheelDirection = direction;
        wheelAccum += e.deltaY;
        const now = performance.now();
        // Trackpads emit a burst of tiny wheel events; physical wheels commonly
        // emit one larger step. Accumulate either, then enforce one deliberate
        // weapon change per 180 ms instead of racing through the whole arsenal.
        if (Math.abs(wheelAccum) >= 45 && now - lastWheelCycle >= 180) {
            input.cycleWeapon += wheelAccum > 0 ? 1 : -1;
            wheelAccum = 0;
            lastWheelCycle = now;
        }
        e.preventDefault();
    }, { passive: false });
}

export function releaseAllKeys() {
    clearFrameInput();
    input.forward = input.back = input.strafeL = input.strafeR = false;
    input.inspect = false;
    input.turnL = input.turnR = input.sprint = false;
    input.fireKeyHeld = input.mouseHeld = false;
    input.aimHeld = false;
    input.aimToggled = false; input.sprintToggled = false;
    wheelAccum = 0; wheelDirection = 0;
}

export function requestPointerLock() {
    if (!canvas || document.pointerLockElement === canvas) return;
    try {
        // Browsers may reject instead of throwing when the document has just
        // changed focus. A later click can retry; it must not become an
        // unhandled runtime error or interrupt the game/audio loop.
        const request = canvas.requestPointerLock?.();
        request?.catch?.(pointerLockError);
    } catch (error) { pointerLockError(error); }
}

export function exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
}

function setKey(code, down) {
    const action = Object.keys(bindings).find(key => bindings[key] === code);
    switch (action) {
        case 'forward': input.forward = down; break;
        case 'back': input.back = down; break;
        case 'left': input.strafeL = down; break;
        case 'right': input.strafeR = down; break;
        case 'jump': if (down) input.jump = true; break;
        case 'interact': if (down) input.interact = true; break;
        case 'melee': if (down) input.melee = true; break;
        case 'sprint': input.sprint = down; break;
        case 'fire':
            if (down && !input.fireKeyHeld) input.fire = true;
            input.fireKeyHeld = down;
            break;
    }
    // Keep legacy shortcuts available unless the player deliberately assigns
    // that key to a remappable action (one key should never trigger two actions).
    if (action) return;
    switch (code) {
        case 'ArrowUp': input.forward = down; break;
        case 'ArrowDown': input.back = down; break;
        case 'ArrowLeft': input.turnL = down; break;
        case 'ArrowRight': input.turnR = down; break;
        case 'KeyF': input.inspect = down; break;
        case 'KeyC': if (down) input.aimToggled = !input.aimToggled; break;
        case 'AltLeft': case 'AltRight': if (down) input.sprintToggled = !input.sprintToggled; break;
        case 'KeyR': if (down) input.regrip = true; break;
        case 'KeyQ': if (down) input.cycleWeapon += 1; break;
    }
}

/** consume one-shot flags after each frame */
export function clearFrameInput() {
    input.fire = false;
    input.melee = false;
    input.regrip = false;
    input.jump = false;
    input.interact = false;
    input.cycleWeapon = 0;
    input.mouseDX = 0;
    input.mouseDY = 0;
}
