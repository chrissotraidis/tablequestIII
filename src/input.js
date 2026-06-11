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
    cycleWeapon: 0,         // +1 / -1 per frame (wheel or Q)
    mouseDX: 0, mouseDY: 0,
    pointerLocked: false,
    everLocked: false,
};

export const fireHeld = () => input.fireKeyHeld || input.mouseHeld;

const pressCallbacks = [];
export function onKeyPress(fn) { pressCallbacks.push(fn); }

let canvas = null;

export function initInput(canvasEl) {
    canvas = canvasEl;

    window.addEventListener('keydown', (e) => {
        if (e.repeat) { setKey(e.code, true); return; }
        for (const fn of pressCallbacks) fn(e);
        setKey(e.code, true);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code))
            e.preventDefault();
    });
    window.addEventListener('keyup', (e) => setKey(e.code, false));

    // window losing focus must never leave keys stuck down
    window.addEventListener('blur', releaseAllKeys);

    document.addEventListener('pointerlockchange', () => {
        input.pointerLocked = document.pointerLockElement === canvas;
        if (input.pointerLocked) input.everLocked = true;
    });
    document.addEventListener('mousemove', (e) => {
        if (input.pointerLocked) {
            input.mouseDX += e.movementX;
            input.mouseDY += e.movementY;
        }
    });
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { input.fire = true; input.mouseHeld = true; }
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) input.mouseHeld = false;
    });
    canvas.addEventListener('wheel', (e) => {
        input.cycleWeapon += e.deltaY > 0 ? 1 : -1;
        e.preventDefault();
    }, { passive: false });
}

export function releaseAllKeys() {
    input.forward = input.back = input.strafeL = input.strafeR = false;
    input.turnL = input.turnR = input.sprint = false;
    input.fireKeyHeld = input.mouseHeld = false;
}

export function requestPointerLock() {
    if (canvas && document.pointerLockElement !== canvas)
        canvas.requestPointerLock?.();
}

export function exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
}

function setKey(code, down) {
    switch (code) {
        case 'KeyW': case 'ArrowUp': input.forward = down; break;
        case 'KeyS': case 'ArrowDown': input.back = down; break;
        case 'KeyA': input.strafeL = down; break;
        case 'KeyD': input.strafeR = down; break;
        case 'ArrowLeft': input.turnL = down; break;
        case 'ArrowRight': input.turnR = down; break;
        case 'Space': if (down) input.jump = true; break;
        case 'ControlLeft': case 'ControlRight': // classic DOS fire key
            if (down && !input.fireKeyHeld) input.fire = true;
            input.fireKeyHeld = down;
            break;
        case 'KeyE': if (down) input.interact = true; break;
        case 'KeyQ': if (down) input.cycleWeapon += 1; break;
        case 'ShiftLeft': case 'ShiftRight': input.sprint = down; break;
    }
}

/** consume one-shot flags after each frame */
export function clearFrameInput() {
    input.fire = false;
    input.jump = false;
    input.interact = false;
    input.cycleWeapon = 0;
    input.mouseDX = 0;
    input.mouseDY = 0;
}
