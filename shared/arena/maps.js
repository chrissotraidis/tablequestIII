import officeProps from './office-props.js';
import { LEVELS } from '../../src/levels.js';

const SOURCE = LEVELS[1];
const OPEN_CHARS = new Set(['.', 'S', '+', 'X', 'E', '$', 'H', 'A', 'Z', 'L', 'P', 'R', 'N', 'T', 'g', 'm', 'x', 'D', 'G']);

function fnv1a(value) {
    let h = 0x811c9dc5;
    for (const ch of String(value)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function arenaRow(row) {
    return [...row].map((cell) => OPEN_CHARS.has(cell) ? '.' : '#').join('');
}

// Frozen from the production World(LEVELS[1]) propCells set. Keeping this
// manifest explicit makes server movement and projectile collision use the
// same authored furniture that players see in the Office renderer.
const OFFICE_BLOCKING_CELLS = Object.freeze([
    '10,11', '10,12', '10,13', '10,7', '11,1', '11,2', '11,3', '11,4',
    '12,11', '12,12', '12,13', '12,16', '12,8', '13,16', '13,23', '14,1',
    '14,11', '14,12', '14,13', '14,16', '14,19', '14,2', '14,21', '14,23',
    '14,3', '14,8', '15,16', '16,11', '16,12', '16,13', '16,21', '17,1',
    '17,16', '17,2', '17,21', '17,3', '18,11', '18,12', '18,13', '18,14',
    '18,16', '18,21', '18,6', '2,11', '2,12', '2,13', '2,14', '2,4', '2,6',
    '20,1', '20,11', '20,12', '20,14', '20,2', '20,21', '20,3', '20,4',
    '21,16', '22,11', '22,12', '22,13', '22,16', '23,1', '23,16', '23,2',
    '23,3', '23,4', '24,11', '24,12', '24,13', '24,16', '24,7', '25,16',
    '25,9', '26,1', '26,11', '26,12', '26,13', '26,16', '26,2', '26,3',
    '26,6', '26,9', '27,16', '27,6', '27,9', '28,1', '28,11', '28,12', '28,13',
    '28,21', '28,6', '29,1', '29,16', '29,2', '29,21', '29,3', '29,6', '29,9',
    '3,4', '30,11', '30,12', '30,13', '30,16', '30,21', '30,6', '30,9', '31,1',
    '31,21', '31,23', '31,9', '32,1', '32,11', '32,12', '32,13', '32,2', '32,3',
    '33,2', '33,23', '34,11', '34,12', '34,13', '34,14', '35,1', '35,11', '35,2',
    '35,3', '35,4', '36,11', '36,12', '36,13', '36,14', '4,11', '4,12', '4,13',
    '4,14', '4,19', '5,1', '5,13', '5,2', '5,23', '5,3', '5,4', '6,11', '6,12',
    '6,13', '6,14', '8,11', '8,12', '8,13', '8,16', '8,17', '8,2', '8,3', '8,4',
    '9,16',
]);

export const OFFICE_ARENA = Object.freeze({
    id: 'office',
    name: 'THE OFFICE',
    sourceName: SOURCE.name,
    width: SOURCE.map[0].length,
    height: SOURCE.map.length,
    map: Object.freeze(SOURCE.map.map(arenaRow)),
    blockingCells: OFFICE_BLOCKING_CELLS,
    props: Object.freeze(officeProps),
    doors: Object.freeze(SOURCE.map.flatMap((row, z) => [...row].flatMap((ch, x) => ch === '+' ? [{id: `${x},${z}`, x, z}] : []))),
    // Authored away from the campaign start and entity cells. The server checks
    // these against the final frozen map before accepting a match.
    spawns: Object.freeze([
        [2.5, 3.5], [36.5, 2.5], [3.5, 13.5], [37.5, 13.5],
        [9.5, 12.5], [31.5, 13.5], [10.5, 22.5], [28.5, 22.5],
        [19.5, 2.5], [19.5, 14.5], [6.5, 22.5], [33.5, 22.5],
    ]),
    pickups: Object.freeze([
        { id: 'paint-1', kind: 'paint', x: 3.5, z: 2.5, respawnMs: 10000, amount: 14 },
        { id: 'paint-2', kind: 'paint', x: 34.5, z: 2.5, respawnMs: 10000, amount: 14 },
        { id: 'food-1', kind: 'food', x: 4.5, z: 22.5, respawnMs: 20000, amount: 25 },
        { id: 'food-2', kind: 'food', x: 34.5, z: 22.5, respawnMs: 20000, amount: 25 },
        { id: 'paintbrush', kind: 'weapon', weapon: 'paintbrush', x: 20.5, z: 13.5, respawnMs: 25000 },
        { id: 'table-leg', kind: 'weapon', weapon: 'tableLeg', x: 19.5, z: 3.5, respawnMs: 25000 },
        { id: 'sprayer', kind: 'weapon', weapon: 'sprayer', x: 7.5, z: 12.5, respawnMs: 25000 },
        { id: 'nailgun', kind: 'weapon', weapon: 'nailgun', x: 31.5, z: 13.5, respawnMs: 25000 },
        { id: 'roller', kind: 'weapon', weapon: 'roller', x: 19.5, z: 22.5, respawnMs: 25000 },
        // Floor supplies sit a few steps from spawns, never on them, so a
        // respawn does not hand out a free refill.
        { id: 'supply-0', kind: 'paint', x: 4.5, z: 5.5, respawnMs: 10000, amount: 20 },
        { id: 'supply-1', kind: 'food', x: 36.5, z: 5.5, respawnMs: 20000, amount: 25 },
        { id: 'supply-2', kind: 'paint', x: 5.5, z: 15.5, respawnMs: 10000, amount: 20 },
        { id: 'supply-3', kind: 'food', x: 35.5, z: 15.5, respawnMs: 20000, amount: 25 },
        { id: 'supply-4', kind: 'paint', x: 11.5, z: 14.5, respawnMs: 10000, amount: 20 },
        { id: 'supply-5', kind: 'food', x: 33.5, z: 11.5, respawnMs: 20000, amount: 25 },
        { id: 'supply-6', kind: 'paint', x: 10.5, z: 19.5, respawnMs: 10000, amount: 20 },
        { id: 'supply-7', kind: 'food', x: 25.5, z: 22.5, respawnMs: 20000, amount: 25 },
    ]),
});

export const OFFICE_MAP_HASH = fnv1a([
    OFFICE_ARENA.id,
    OFFICE_ARENA.map.join('\n'),
    JSON.stringify(OFFICE_ARENA.spawns),
    JSON.stringify(OFFICE_ARENA.blockingCells),
    JSON.stringify(OFFICE_ARENA.pickups),
    JSON.stringify(OFFICE_ARENA.props),
    JSON.stringify(OFFICE_ARENA.doors),
].join('|'));

export function isSolidCell(map, gx, gz) {
    if (gz < 0 || gz >= map.height || gx < 0 || gx >= map.width) return true;
    return map.map[gz]?.[gx] === '#' || map.closedDoorCells?.includes(`${gx},${gz}`) || map.blockingCells?.includes(`${gx},${gz}`);
}

export function validateOfficeManifest(map = OFFICE_ARENA) {
    const errors = [];
    for (const [i, [x, z]] of map.spawns.entries()) {
        if (isSolidCell(map, Math.floor(x), Math.floor(z))) errors.push(`spawn ${i} is blocked`);
    }
    for (const pickup of map.pickups) {
        if (isSolidCell(map, Math.floor(pickup.x), Math.floor(pickup.z))) errors.push(`${pickup.id} is blocked`);
    }
    if (map.spawns.length < 12) errors.push('fewer than 12 authored spawns');
    if (!map.pickups.some((p) => p.kind === 'paint')) errors.push('no paint pickup');
    if (!map.pickups.some((p) => p.kind === 'food')) errors.push('no food pickup');
    for (const weapon of ['paintbrush', 'tableLeg', 'sprayer', 'nailgun', 'roller']) {
        if (!map.pickups.some((p) => p.weapon === weapon)) errors.push(`missing ${weapon} pickup`);
    }
    return errors;
}
