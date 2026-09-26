export const ARENA_CONFIG = Object.freeze({
    maxPlayers: 8,
    maxPending: 16,
    tickRate: 30,
    snapshotRate: 15,
    roundMs: 300000,
    countdownMs: 8000,
    respawnMs: 3000,
    disconnectGraceMs: 15000,
    inputTimeoutMs: 250,
    playerRadius: 0.26,
    playerHeight: 0.9,
    walkSpeed: 3.7,
    sprintSpeed: 5.6,
    maxHealth: 100,
    maxPaint: 99,
    projectileLifeMs: 2000,
    snapshotMaxBytes: 32768,
});

export const ARENA_WEAPONS = Object.freeze({
    paintbrush: { name: 'PAINTBRUSH', type: 'ranged', damage: 16, cooldownMs: 250, ammoCost: 1, speed: 11, size: 0.04, range: 24 },
    tableLeg: { name: 'TABLE LEG', type: 'melee', damage: 50, cooldownMs: 500, ammoCost: 0, range: 1.8, arc: Math.PI / 2 },
    sprayer: { name: 'PAINT SPRAYER', type: 'ranged', damage: 9, cooldownMs: 110, ammoCost: 1, speed: 12, size: 0.035, spread: 0.055, range: 24 },
    nailgun: { name: 'NAIL GUN', type: 'ranged', damage: 11, cooldownMs: 130, ammoCost: 1, speed: 18, size: 0.028, spread: 0.015, range: 30 },
    roller: { name: 'ROLLER LAUNCHER', type: 'ranged', damage: 30, splashDamage: 30, splash: 1.7, cooldownMs: 950, ammoCost: 4, speed: 8, size: 0.09, range: 20 },
});

export const PRESETS = Object.freeze({
    guard: { label: 'GUARD', model: 0 },
    manager: { label: 'MANAGER', model: 1 },
    executive: { label: 'EXECUTIVE', model: 2 },
});

export const COLORS = Object.freeze({
    brass: 0xc9a227,
    blue: 0x315bd6,
    red: 0xb52d3c,
    green: 0x2e9b68,
    violet: 0x8147b8,
    orange: 0xd9782f,
});

export function cleanName(value) {
    const name = String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
    return [...name].slice(0, 20).join('') || 'GUEST';
}

export function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

export function normalizeInput(value = {}) {
    return {
        seq: Number.isSafeInteger(value.seq) && value.seq >= 0 ? value.seq : 0,
        moveX: Math.max(-1, Math.min(1, finite(value.moveX))),
        moveY: Math.max(-1, Math.min(1, finite(value.moveY))),
        yaw: finite(value.yaw),
        pitch: Math.max(-0.55, Math.min(0.55, finite(value.pitch))),
        sprint: Boolean(value.sprint),
        fire: Boolean(value.fire),
        tap: Boolean(value.tap),
        weapon: typeof value.weapon === 'string' && ARENA_WEAPONS[value.weapon] ? value.weapon : null,
        at: Date.now(),
    };
}

export function hashString(value) {
    let h = 2166136261;
    for (const ch of String(value)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
