/**
 * CONFIGURATION & CONSTANTS
 */
export const WALL_HEIGHT = 1.35;
export const EYE_HEIGHT = 0.62;
export const PLAYER_RADIUS = 0.26;
export const PLAYER_SPEED = 3.7;        // units / sec
export const PLAYER_SPRINT = 5.6;
export const PLAYER_ACCEL = 14;         // how quickly velocity reaches target
export const TURN_SPEED = 3.0;          // rad / sec (keyboard)
export const MAX_PITCH = 0.5;           // rad, mouse look up/down clamp
export const MAX_HEALTH = 100;

export const PROJECTILE_SPEED = 11.0;
export const ENEMY_PROJECTILE_SPEED = 7.0;

// Cell types
export const CELL = {
    EMPTY: 0,
    BRICK: 1,
    WOOD: 2,
    DOOR: 3,
    GATE: 4,    // elevator gate, locked until tables collected
    STONE: 5,
    CONCRETE: 6,
    OFFICE: 7,
    METAL: 8,
    ELEVATOR: 9, // walkable elevator pad
};

export const SOLID = (t) => t !== CELL.EMPTY && t !== CELL.ELEVATOR;

export const WEAPONS = {
    paintbrush: {
        name: 'PAINTBRUSH',
        type: 'ranged',
        damage: 16,
        cooldown: 0.32,
        ammoCost: 1,
        auto: true,         // hold to keep flinging
        description: 'A colorful paintbrush for flinging paint!',
    },
    tableLeg: {
        name: 'TABLE LEG',
        type: 'melee',
        damage: 50,
        cooldown: 0.5,
        ammoCost: 0,
        auto: true,
        range: 1.8,
        arc: Math.PI / 2,
        description: 'Swing this heavy table leg at close range!',
    },
    sprayer: {
        name: 'PAINT SPRAYER',
        type: 'ranged',
        damage: 9,
        cooldown: 0.11,
        ammoCost: 1,
        auto: true,
        spread: 0.055,
        description: 'Industrial-grade full-auto paint delivery.',
    },
};

export const SCORE_VALUES = {
    enemy: { 0: 100, 1: 200, 2: 400, boss: 5000 },
    table: 500,
    money: 100,
    goldBar: 250,
    levelBonus: 1000,
};

// moveSpeed in units/sec. strafing: enemies orbit at this fraction of moveSpeed
// while inside attack range. lead: fraction of perfect target-leading applied.
export const ENEMY_STATS = {
    0:    { name: 'Guard',         detectRange: 10, attackRange: 7,  moveSpeed: 1.6, attackCooldown: 2.3, health: 30,  damage: 8,  score: 100,  lead: 0 },
    1:    { name: 'Manager',       detectRange: 12, attackRange: 8,  moveSpeed: 2.0, attackCooldown: 1.8, health: 45,  damage: 9,  score: 200,  lead: 0.25 },
    2:    { name: 'Executive',     detectRange: 14, attackRange: 10, moveSpeed: 2.4, attackCooldown: 1.5, health: 60,  damage: 12, score: 400,  lead: 0.55 },
    boss: { name: 'Head Designer', detectRange: 26, attackRange: 18, moveSpeed: 2.0, attackCooldown: 1.2, health: 480, damage: 12, score: 5000, lead: 0.5 },
};

export const PACK_ALERT_RADIUS = 5.5; // spotting the player wakes nearby staff
