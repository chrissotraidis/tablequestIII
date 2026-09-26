import {chooseBotWeapon} from '../shared/arena/bot-weapons.js';
import { arenaRoute } from '../shared/arena/navigation.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join as pathJoin, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { handleScoreboardRequest } from './scoreboard-server.mjs';
import { OFFICE_ARENA, OFFICE_MAP_HASH, isSolidCell, validateOfficeManifest } from '../shared/arena/maps.js';
import { ARENA_CONFIG, ARENA_WEAPONS, COLORS, PRESETS, cleanName, normalizeInput } from '../shared/arena/rules.js';
import { moveCircle, segmentBlocked, insideMap } from '../shared/arena/movement.js';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, message, parseMessage } from '../shared/arena/protocol.js';
import { MAX_QUEUED_INPUTS, takeTickInputs } from '../shared/arena/client-movement.js';

const HERE = fileURLToPath(new URL('../', import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4180);
const ROUND_MS = Number(process.env.TQ_ARENA_ROUND_MS || ARENA_CONFIG.roundMs);
const COUNTDOWN_MS = Number(process.env.TQ_ARENA_COUNTDOWN_MS || ARENA_CONFIG.countdownMs);
const TICK_MS = 1000 / ARENA_CONFIG.tickRate;
const SNAPSHOT_EVERY = Math.max(1, Math.round(ARENA_CONFIG.tickRate / ARENA_CONFIG.snapshotRate));

// Per-round collision state; never mutate the authored campaign manifest.
const arenaMap = { ...OFFICE_ARENA, blockingCells: [...OFFICE_ARENA.blockingCells], closedDoorCells: OFFICE_ARENA.doors.map(d => d.id) };
const cover = new Map(OFFICE_ARENA.blockingCells.map((id) => [id, { id, health: OFFICE_ARENA.props[id].hp }]));
const doors = new Map(OFFICE_ARENA.doors.map(d => [d.id, { ...d, open: false, openT: 0 }]));
function toggleDoor(player) {
    if (!player.alive || Date.now() < (player.doorAt || 0)) return;
    const nearby = [...doors.values()].filter(d => Math.hypot(player.x - d.x - 0.5, player.z - d.z - 0.5) < 1.65)
        .sort((a, b) => Math.hypot(player.x-a.x-.5, player.z-a.z-.5)-Math.hypot(player.x-b.x-.5, player.z-b.z-.5));
    const door = nearby[0];
    if (!door) return;
    door.open = !door.open;
    player.doorAt = Date.now() + 450;
    broadcast('event', { kind: 'door', id: door.id, open: door.open });
}
function updateDoors(dt) {
    for (const door of doors.values()) {
        // Never close a collision cell around somebody standing in it.
        const occupied = [...room.players.values()].some(p => p.alive && Math.abs(p.x-door.x-.5)<.8 && Math.abs(p.z-door.z-.5)<.8);
        if (occupied && !door.open) door.open = true;
        door.openT = Math.max(0, Math.min(1, door.openT + (door.open ? 1 : -1) * dt * 2.5));
    }
    arenaMap.closedDoorCells = [...doors.values()].filter(d => d.openT < .75).map(d => d.id);
}
const worldPickups = OFFICE_ARENA.pickups;

const metrics = {
    startedAt: new Date().toISOString(),
    connections: 0,
    rejected: 0,
    ticks: 0,
    tickMsP95: 0,
    eventLoopP99Ms: 0,
    snapshots: 0,
    snapshotBytes: 0,
    protocolErrors: 0,
};
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

const room = {
    code: 'OFFICE8',
    state: 'lobby',
    hostSlot: null,
    players: new Map(),
    pickups: new Map(worldPickups.map((pickup) => [pickup.id, { ...pickup, availableAt: 0 }])),
    projectiles: [],
    matchId: 0,
    tick: 0,
    countdownAt: 0,
    deadline: 0,
    resultsAt: 0,
    results: [],
    chat: [],
    tickSamples: [],
};

function colorValue(value) {
    return Object.hasOwn(COLORS, value) ? value : 'brass';
}

function presetValue(value) {
    return Object.hasOwn(PRESETS, value) ? value : 'guard';
}

function send(socket, type, payload = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    const body = message(type, payload);
    if (Buffer.byteLength(body) > ARENA_CONFIG.snapshotMaxBytes && type === 'snapshot') {
        metrics.protocolErrors++;
        return false;
    }
    socket.send(body);
    return true;
}

function broadcast(type, payload = {}) {
    for (const player of room.players.values()) send(player.socket, type, payload);
}

function roster() {
    return [...room.players.values()].sort((a, b) => a.slot - b.slot).map((p) => ({
        slot: p.slot,
        playerId: p.playerId,
        name: p.name,
        preset: p.preset,
        color: p.color,
        ready: p.ready,
        connected: Boolean(p.socket) || p.bot,
        bot: Boolean(p.bot),
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        weapon: p.weapon,
    }));
}

function roomPayload() {
    const connected = [...room.players.values()].filter((p) => p.socket || p.bot).length;
    const humans = [...room.players.values()].filter((p) => !p.bot).length;
    return {
        code: room.code,
        state: room.state,
        hostSlot: room.hostSlot,
        map: { id: OFFICE_ARENA.id, name: OFFICE_ARENA.name, hash: OFFICE_MAP_HASH },
        matchId: room.matchId,
        countdownMs: Math.max(0, room.countdownAt - Date.now()),
        remainingMs: room.state === 'active' ? Math.max(0, room.deadline - Date.now()) : 0,
        roster: roster(),
        maxPlayers: ARENA_CONFIG.maxPlayers,
        bots: [...room.players.values()].filter((p) => p.bot).length,
        humans,
        connected,
        occupied: room.players.size,
        chat: room.chat.slice(-30),
        resultsAt: room.resultsAt,
        rematchWaitMs: room.state==='results' ? Math.max(0,room.resultsAt+10000-Date.now()) : 0,
        results: room.state === 'results' ? room.results : [],
    };
}

function syncRoom() {
    if (room.state === 'countdown' && readinessError()) cancelCountdown();
    broadcast('room', roomPayload());
}

function makePlayer(slot, data = {}) {
    const [x, z] = OFFICE_ARENA.spawns[slot % OFFICE_ARENA.spawns.length];
    return {
        slot,
        playerId: randomUUID(),
        name: cleanName(data.name),
        preset: presetValue(data.preset),
        color: colorValue(data.color),
        token: data.token || randomUUID(),
        socket: null,
        bot: Boolean(data.bot),
        ready: false,
        x, z, vx: 0, vz: 0, yaw: 0, pitch: 0,
        health: ARENA_CONFIG.maxHealth,
        paint: 30,
        weapon: 'paintbrush',
        weapons: new Set(['paintbrush', 'tableLeg']),
        cooldownAt: 0,
        alive: true,
        respawnAt: 0,
        kills: 0,
        deaths: 0,
        lastSeq: -1,
        queuedSeq: -1,
        inputQueue: [],
        input: normalizeInput({ yaw: 0 }),
        inputAt: 0,
        reservedUntil: 0,
        botTargetAt: room.tick + Math.ceil(ARENA_CONFIG.tickRate),
        brain: makeBotBrain(slot),
    };
}

const BOT_STAFF = [
    ['MORA', 'guard', 'blue'], ['JUNO', 'manager', 'red'], ['PAX', 'executive', 'green'],
    ['RHEA', 'guard', 'violet'], ['SOL', 'manager', 'orange'], ['VALE', 'executive', 'brass'],
    ['KITE', 'guard', 'red'],
];

function fillBots(limit = ARENA_CONFIG.maxPlayers) {
    const created = [];
    for (let i = 0; created.length < limit && room.players.size < ARENA_CONFIG.maxPlayers && i < BOT_STAFF.length; i++) {
        const [name, preset, color] = BOT_STAFF[i];
        if ([...room.players.values()].some((p) => p.bot && p.name === name)) continue;
        const slot = firstFreeSlot();
        if (slot < 0) break;
        const bot = makePlayer(slot, { name, preset, color, bot: true });
        bot.ready = true;
        bot.inputAt = Date.now();
        room.players.set(slot, bot);
        distinctIdentity(bot);
        created.push(bot);
    }
    for (const player of room.players.values()) if (player.bot) player.ready = true;
    return created;
}

// Everyone defaults to the same look; keep staff distinguishable in the room.
function distinctIdentity(player) {
    const others = [...room.players.values()].filter((p) => p !== player);
    if (others.some((p) => p.color === player.color)) {
        const free = Object.keys(COLORS).find((color) => !others.some((p) => p.color === color));
        if (free) player.color = free;
    }
    if (player.bot) return;
    const base = player.name;
    if (others.some((p) => p.name === base)) {
        for (let n = 2; n < 20; n++) {
            const name = `${[...base].slice(0, 17).join('')} ${n}`;
            if (!others.some((p) => p.name === name)) { player.name = name; break; }
        }
    }
}

function removeBots() {
    for (const [slot, player] of room.players) if (player.bot) room.players.delete(slot);
}

function resetPlayer(p) {
    const [x, z] = OFFICE_ARENA.spawns[p.slot % OFFICE_ARENA.spawns.length];
    p.x = x; p.z = z; p.vx = 0; p.vz = 0; p.yaw = 0; p.pitch = 0;
    p.health = ARENA_CONFIG.maxHealth; p.paint = 30; p.weapon = 'paintbrush';
    p.weapons = new Set(['paintbrush', 'tableLeg']); p.cooldownAt = 0; p.fireRequested=false; p.alive = true; p.respawnAt = 0;
    p.kills = 0; p.deaths = 0; p.lastSeq = -1; p.queuedSeq = -1; p.inputQueue = []; p.input = normalizeInput({}); p.inputAt = 0; p.ready = false;
    p.botTargetAt = room.tick + Math.ceil(ARENA_CONFIG.tickRate);
    p.protectedUntil = Date.now() + 1500;
    p.brain = makeBotBrain(p.slot);
}

function findByToken(token) {
    if (!token) return null;
    for (const player of room.players.values()) if (player.token === token && player.reservedUntil >= Date.now()) return player;
    return null;
}

function firstFreeSlot() {
    for (let slot = 0; slot < ARENA_CONFIG.maxPlayers; slot++) {
        const player = room.players.get(slot);
        if (!player) return slot;
        if (!player.socket && !player.bot && player.reservedUntil < Date.now()) return slot;
    }
    return -1;
}

function transferHost() {
    const next = [...room.players.values()].filter((p) => p.socket).sort((a, b) => a.slot - b.slot)[0];
    room.hostSlot = next?.slot ?? null;
}

function attachSocket(socket, player, data) {
    if (player.socket && player.socket !== socket) player.socket.close(4001, 'replaced');
    player.socket = socket;
    player.reservedUntil = 0;
    // A reloaded page restarts its input sequence at zero.
    player.lastSeq = -1; player.queuedSeq = -1; player.inputQueue = [];
    if (data.name) player.name = cleanName(data.name);
    if (data.preset) player.preset = presetValue(data.preset);
    if (data.color) player.color = colorValue(data.color);
    distinctIdentity(player);
    // If the former host was the only human and temporarily disconnected,
    // transfer control back when that same reserved slot reconnects. Bots do
    // not own lobby controls.
    if (room.hostSlot === null) room.hostSlot = player.slot;
    socket.player = player;
    socket.generation = randomUUID();
    if (room.state === 'countdown' && readinessError()) cancelCountdown();
    send(socket, 'welcome', { slot: player.slot, token: player.token, protocol: PROTOCOL_VERSION, mapHash: OFFICE_MAP_HASH, room: roomPayload() });
    syncRoom();
}

function joinRoom(socket, data) {
    if (data.roomCode !== undefined && data.roomCode !== room.code) return send(socket, 'error', { code: 'invalid_room_code', message: 'The only Arena room is OFFICE8.' });
    if (data.protocol && data.protocol !== PROTOCOL_VERSION) return send(socket, 'error', { code: 'protocol_mismatch', message: 'Reload the Arena build.' });
    const reconnect = findByToken(data.reconnectToken);
    if (reconnect) return attachSocket(socket, reconnect, data);
    if (room.state === 'active' && Date.now() > room.deadline - 10000) return send(socket, 'error', { code: 'round_locked', message: 'Join again after this round.' });
    const slot = firstFreeSlot();
    if (slot < 0) return send(socket, 'error', { code: 'room_full', message: 'The Office is full.' });
    const player = makePlayer(slot, data);
    room.players.set(slot, player);
    if (room.hostSlot === null) room.hostSlot = slot;
    attachSocket(socket, player, data);
}

function resetVacantRoom() {
    // Keep a disconnected human's round alive for the reconnect grace period.
    if([...room.players.values()].some(p=>!p.bot && (p.socket || p.reservedUntil>Date.now())))return;
    room.players.clear();room.hostSlot=null;room.state='lobby';
    room.countdownAt=0;room.deadline=0;room.resultsAt=0;room.results=[];room.chat=[];
    room.tick=0;room.matchId++;resetRoundWorld();
}

function releasePlayer(player) {
    if (room.players.get(player.slot) !== player) return;
    if (player.socket) return;
    if (player.reservedUntil > Date.now()) return;
    room.players.delete(player.slot);
    if (room.hostSlot === player.slot) transferHost();
    resetVacantRoom();
    syncRoom();
}

function disconnect(socket) {
    const player = socket.player;
    if (!player || player.socket !== socket) return;
    player.socket = null;
    // Keep ready state for the reconnect grace period: one dropped connection
    // should not cancel everyone's countdown. syncRoom still cancels when
    // fewer than two connected staff remain.
    player.input = normalizeInput({ yaw: player.yaw, pitch: player.pitch });
    player.inputQueue = [];
    player.inputAt = 0;
    player.reservedUntil = Date.now() + ARENA_CONFIG.disconnectGraceMs;
    if (room.hostSlot === player.slot) transferHost();
    setTimeout(() => releasePlayer(player), ARENA_CONFIG.disconnectGraceMs + 20);
    syncRoom();
}

function readinessError() {
    const participants = [...room.players.values()].filter((p) => p.socket || p.bot);
    if (participants.length < 2) return 'need_two_staff';
    if (!participants.some((p) => p.socket)) return 'human_required';
    if (participants.some((p) => !p.ready || (!p.bot && p.socket.readyState !== WebSocket.OPEN))) return 'waiting_for_ready';
    return null;
}

function cancelCountdown() {
    if (room.state !== 'countdown') return;
    room.state = 'lobby';
    room.countdownAt = 0;
    room.deadline = 0;
    room.resultsAt = 0;
    room.results = [];
}

function beginCountdown() {
    if (room.state === 'countdown' || room.state === 'active') return { ok: false, reason: 'round_already_live' };
    const reason = readinessError();
    if (reason) return { ok: false, reason };
    room.state = 'countdown';
    room.resultsAt = 0;
    room.results = [];
    room.deadline = 0;
    room.countdownAt = Date.now() + COUNTDOWN_MS;
    room.matchId++;
    resetRoundWorld();
    syncRoom();
    return { ok: true };
}

function resetRoundWorld() {
    room.projectiles.length = 0;
    arenaMap.blockingCells = [...OFFICE_ARENA.blockingCells];
    for (const prop of cover.values()) prop.health = OFFICE_ARENA.props[prop.id].hp;
    for (const door of doors.values()) { door.openT = 0; door.open = false; }
    arenaMap.closedDoorCells = [...doors.keys()];
    for (const pickup of room.pickups.values()) pickup.availableAt = 0;
}

function beginMatch() {
    room.state = 'active';
    room.countdownAt = 0;
    room.deadline = Date.now() + ROUND_MS;
    room.tick = 0;
    for (const player of room.players.values()) resetPlayer(player);
    for (const player of room.players.values()) player.ready = Boolean(player.socket || player.bot);
    broadcast('event', { kind: 'match-start', matchId: room.matchId });
    syncRoom();
}

function finishMatch() {
    if (room.state !== 'active') return;
    room.state = 'results';
    room.resultsAt = Date.now();
    room.projectiles.length = 0;
    const results = [...room.players.values()].filter((p) => p.socket || p.bot || p.kills || p.deaths).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.slot - b.slot).map((p, i) => ({ rank: i + 1, slot: p.slot, playerId: p.playerId, bot: p.bot, name: p.name, kills: p.kills, deaths: p.deaths }));
    room.results = results;
    broadcast('result', { matchId: room.matchId, map: OFFICE_ARENA.name, results });
    for (const player of room.players.values()) player.ready = Boolean(player.bot);
    syncRoom();
}

function canRematch() {
    return room.state === 'results' && Date.now() >= room.resultsAt + 10000;
}

function startError(reason) {
    return {
        round_already_live: 'This Office round is already live. Choose Resume Match to enter it.',
        need_two_staff: 'Add staff bots or wait for another player before starting.',
        human_required: 'At least one connected human must remain in the room.',
        waiting_for_ready: 'Every connected staff member must be READY before the countdown begins.',
        results_locked: 'Keep the results visible for ten seconds before rematching.',
    }[reason] || 'The Office is not ready to start.';
}

function pickupFor(player, now) {
    if (!player.alive) return;
    for (const pickup of room.pickups.values()) {
        if (pickup.availableAt > now || Math.hypot(player.x - pickup.x, player.z - pickup.z) > 0.8
            || segmentBlocked(arenaMap, player.x, player.z, pickup.x, pickup.z)) continue;
        if (pickup.kind === 'paint') {
            if (player.paint >= ARENA_CONFIG.maxPaint) continue;
            player.paint = Math.min(ARENA_CONFIG.maxPaint, player.paint + pickup.amount);
        } else if (pickup.kind === 'food') {
            if (player.health >= ARENA_CONFIG.maxHealth) continue;
            player.health = Math.min(ARENA_CONFIG.maxHealth, player.health + pickup.amount);
        } else if (pickup.kind === 'weapon') {
            if (player.weapons.has(pickup.weapon)) {
                if (player.paint >= ARENA_CONFIG.maxPaint) continue;
                player.paint = Math.min(ARENA_CONFIG.maxPaint, player.paint + 14);
            } else {
                player.weapons.add(pickup.weapon);
                player.weapon = pickup.weapon;
                player.paint = Math.min(ARENA_CONFIG.maxPaint, player.paint + 14);
            }
        }
        pickup.availableAt = now + pickup.respawnMs;
        broadcast('event', { kind: 'pickup', slot: player.slot, pickup: pickup.id, weapon: pickup.weapon || null });
    }
}

// Campaign ENEMY_STATS (src/config.js) and idle/alert/chase pacing (src/game.js).
// Keep this server-only: Arena weapon rules and human movement stay authoritative.
const BOT_PACING = {
    guard: { speed: 3.0, range: 10, detect: 16, attack: .55 },
    manager: { speed: 3.2, range: 12, detect: 18, attack: .42 },
    executive: { speed: 3.4, range: 14, detect: 20, attack: .34 },
};
const botTicks = (seconds) => Math.ceil(seconds * ARENA_CONFIG.tickRate);

function makeBotBrain(slot) {
    const readyAt = room.tick + botTicks(0.7 + (slot % 5) * 0.1);
    return {
        targetSlot: null, thinkAt: readyAt, pauseUntil: readyAt, fireAt: readyAt,
        strafe: slot % 2 ? 1 : -1, strafeAt: readyAt, roamAt: 0,
        roamYaw: slot * 1.37, patrolMove: true, aimYaw: 0, distance: Infinity,
        stuckTicks: 0, path: [], pathAt: 0, goal: null,
    };
}

function botPatrol(player) {
    const brain=player.brain;
    for(const door of doors.values()) if(!door.open && Math.hypot(player.x-door.x-.5,player.z-door.z-.5)<1.4) { toggleDoor(player); break; }
    if (room.tick >= brain.pathAt || !brain.path.length) {
        brain.pathAt=room.tick+botTicks(1);
        // Preserve survival at critical health; otherwise an empty bot needs
        // ammunition before optional healing. Weapon stations also refill paint.
        const priority=p=>player.health<30 ? (p.kind==='food'?0:1) : player.paint===0 ? (p.kind==='food'?1:0) : 0;
        const needs=[...room.pickups.values()].filter(p=>p.availableAt<=Date.now() && (p.kind==='food' ? player.health<65 : p.kind==='paint' ? player.paint<20 : !player.weapons.has(p.weapon) || player.paint<20))
            .sort((a,b)=>priority(a)-priority(b) || Math.hypot(player.x-a.x,player.z-a.z)-Math.hypot(player.x-b.x,player.z-b.z));
        if(needs.length && (player.paint===0 || player.health<30))brain.goal=[needs[0].x,needs[0].z];
        if(!brain.goal || Math.hypot(player.x-brain.goal[0],player.z-brain.goal[1])<.7 || brain.stuckTicks>15) brain.goal=needs[0] ? [needs[0].x,needs[0].z] : OFFICE_ARENA.spawns[Math.floor(Math.random()*OFFICE_ARENA.spawns.length)];
        brain.path=arenaRoute(arenaMap,player,brain.goal);
        if(!brain.path.length) brain.goal=null;
    }
    while(brain.path.length && Math.hypot(player.x-brain.path[0][0],player.z-brain.path[0][1])<.2) brain.path.shift();
    const waypoint=brain.path[0];
    return waypoint ? {yaw:Math.atan2(waypoint[1]-player.z,waypoint[0]-player.x),moveY:1} : {yaw:player.yaw,moveY:0};
}
function botInput(player) {
    const brain = player.brain;
    const pacing = BOT_PACING[player.preset] || BOT_PACING.guard;
    const tick = room.tick;
    if (brain.stuckTicks > botTicks(0.5)) {
        const obstacle = {};
        projectileWallHitTime(player, player.x + Math.cos(player.yaw) * 1.3, player.z + Math.sin(player.yaw) * 1.3, obstacle);
        if (cover.get(obstacle.id)?.health > 0) {
            const attack = tick >= brain.fireAt;
            if (attack) brain.fireAt = tick + botTicks(pacing.attack);
            return normalizeInput({ seq: player.lastSeq + 1, yaw: player.yaw, weapon: 'tableLeg', fire: attack });
        }
        brain.roamYaw = player.yaw + Math.PI * 0.65;
        brain.targetSlot = null;
        brain.thinkAt = tick + botTicks(1);
        brain.stuckTicks = 0;
    }
    // Do not bypass the reaction timer when a target dies or no target is found.
    if (tick >= brain.thinkAt) {
        const targets = [...room.players.values()]
            .filter((candidate) => candidate !== player && candidate.alive && (candidate.socket || candidate.bot)
                && tick >= candidate.botTargetAt
                && Math.hypot(candidate.x - player.x, candidate.z - player.z) <= pacing.detect
                && !segmentBlocked(arenaMap, player.x, player.z, candidate.x, candidate.z))
            .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
        const target = targets.find((candidate) => candidate.slot === brain.targetSlot) || targets[0];
        if ((target?.slot ?? null) !== brain.targetSlot) {
            brain.pauseUntil = tick + botTicks(0.35 + Math.random() * 0.2);
            brain.fireAt = Math.max(brain.fireAt, brain.pauseUntil);
        }
        brain.targetSlot = target?.slot ?? null;
        brain.thinkAt = tick + botTicks(0.35 + Math.random() * 0.2);
        if (target) {
            brain.distance = Math.hypot(target.x - player.x, target.z - player.z);
            // Aim at an observed position, with error; never lead a live target each tick.
            const lead = Math.min(.5, brain.distance / ARENA_WEAPONS[player.weapon].speed || 0);
            brain.aimYaw = Math.atan2(target.z + target.vz*lead - player.z, target.x + target.vx*lead - player.x) + (Math.random() - 0.5) * .12;
        }
    }
    if (tick >= brain.strafeAt) {
        brain.strafe *= -1;
        brain.strafeAt = tick + botTicks(1.1 + Math.random() * 1.4);
        brain.pauseUntil = Math.max(brain.pauseUntil, tick + botTicks(0.15 + Math.random() * 0.2));
    }
    if (tick >= brain.roamAt) {
        brain.roamAt = tick + botTicks(1.2 + Math.random() * 2);
        brain.roamYaw = Math.random() * Math.PI * 2;
        brain.patrolMove = Math.random() > 0.3;
    }
    const target = room.players.get(brain.targetSlot);
    const engaged = target?.alive && (target.socket || target.bot) && tick >= target.botTargetAt;
    const desiredYaw = engaged ? brain.aimYaw : brain.roamYaw;
    const delta = Math.atan2(Math.sin(desiredYaw - player.yaw), Math.cos(desiredYaw - player.yaw));
    const turn = 4.0 / ARENA_CONFIG.tickRate;
    const yaw = player.yaw + Math.max(-turn, Math.min(turn, delta));
    const paused = tick < brain.pauseUntil;
    if (!engaged) return normalizeInput({ seq: player.lastSeq + 1, ...botPatrol(player) });
    const distance = Math.hypot(target.x-player.x,target.z-player.z);
    const visible = !segmentBlocked(arenaMap, player.x, player.z, target.x, target.z);
    // An empty bot should resupply instead of circling an enemy indefinitely.
    const seekingPaint=player.paint===0 && distance>2.1;
    if(seekingPaint && !brain.seekingPaint){brain.goal=null;brain.path=[];brain.pathAt=0;}
    brain.seekingPaint=seekingPaint;
    if(seekingPaint)return normalizeInput({seq:player.lastSeq+1,...botPatrol(player),weapon:'tableLeg'});
    const weapon = chooseBotWeapon(player.weapons,player.paint,distance) || player.weapon;
    const attack = !paused && visible && tick >= brain.fireAt && Math.abs(delta) < 0.18
        && distance <= Math.min(pacing.range, ARENA_WEAPONS[weapon].range)
        && player.paint >= ARENA_WEAPONS[weapon].ammoCost;
    if (attack) brain.fireAt = tick + botTicks(pacing.attack * (0.85 + Math.random() * 0.3));
    const effectiveRange = Math.min(pacing.range, ARENA_WEAPONS[weapon].range);
    const inRange = distance <= effectiveRange;
    return normalizeInput({
        seq: player.lastSeq + 1,
        moveY: paused ? 0 : !inRange ? 1 : distance > effectiveRange * 0.7 ? .65 : distance < 3 && weapon !== 'tableLeg' ? -.5 : 0,
        moveX: paused || !inRange || weapon === 'tableLeg' ? 0 : brain.strafe * .65,
        yaw,
        pitch: 0,
        sprint: false,
        fire: attack,
        weapon,
    });
}

function separatePlayers() {
    const players = [...room.players.values()].filter((p) => (p.socket || p.bot) && p.alive);
    const minDistance = ARENA_CONFIG.playerRadius * 2.15;
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        if (!distance || distance >= minDistance) continue;
        const push = (minDistance - distance) / distance * 0.5;
        const ax = a.x - dx * push, az = a.z - dz * push;
        const bx = b.x + dx * push, bz = b.z + dz * push;
        if (insideMap(arenaMap, ax, az)) { a.x = ax; a.z = az; }
        if (insideMap(arenaMap, bx, bz)) { b.x = bx; b.z = bz; }
    }
}

function cleanChat(value) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Sweep against the standing player's cylinder, expanded by projectile radius.
// Intersect horizontal and vertical time intervals so steep shots cannot hit
// someone merely because their floor projections overlap.
function projectileHitTime(projectile, nx, ny, nz, player, bodyRadius = ARENA_CONFIG.playerRadius, bodyHeight = ARENA_CONFIG.playerHeight) {
    const dx = nx - projectile.x, dy = ny - projectile.y, dz = nz - projectile.z;
    const ox = projectile.x - player.x, oz = projectile.z - player.z;
    const radius = bodyRadius + (projectile.size || 0);
    const a = dx * dx + dz * dz, b = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - radius * radius;
    let enter = 0, exit = 1;
    if (a < 1e-12) {
        if (c > 0) return null;
    } else {
        const discriminant = b * b - a * c;
        if (discriminant < 0) return null;
        const root = Math.sqrt(discriminant);
        enter = Math.max(enter, (-b - root) / a);
        exit = Math.min(exit, (-b + root) / a);
    }
    const bottom = -(projectile.size || 0), top = bodyHeight + (projectile.size || 0);
    if (Math.abs(dy) < 1e-12) {
        if (projectile.y < bottom || projectile.y > top) return null;
    } else {
        const t0 = (bottom - projectile.y) / dy, t1 = (top - projectile.y) / dy;
        enter = Math.max(enter, Math.min(t0, t1));
        exit = Math.min(exit, Math.max(t0, t1));
    }
    return enter <= exit ? enter : null;
}

// Find the first solid-cell entry along the projectile's center segment.
// Use exact cell bounds so player hits at the wall are still considered.
function projectileWallHitTime(projectile, nx, nz, cell = {}, ny = projectile.y ?? .7) {
    const dx = nx - projectile.x, dz = nz - projectile.z;
    let first = Infinity;
    for (let z = Math.floor(Math.min(projectile.z, nz)); z <= Math.floor(Math.max(projectile.z, nz)); z++) {
        for (let x = Math.floor(Math.min(projectile.x, nx)); x <= Math.floor(Math.max(projectile.x, nx)); x++) {
            if (!isSolidCell(arenaMap, x, z)) continue;
            const id = `${x},${z}`;
            const prop = arenaMap.blockingCells.includes(id) && arenaMap.props[id];
            if (prop) {
                const t = projectileHitTime({...projectile, y:projectile.y ?? .35}, nx, ny, nz, {x:x+.5,z:z+.5}, prop.radius, prop.height);
                if (t !== null && t < first) { first=t; cell.id=id; }
                continue;
            }
            let enter = 0, exit = 1;
            for (const [start, delta, lower] of [[projectile.x, dx, x], [projectile.z, dz, z]]) {
                if (delta === 0) {
                    if (start < lower || start >= lower + 1) { exit = -1; break; }
                } else {
                    const t0 = (lower - start) / delta, t1 = (lower + 1 - start) / delta;
                    enter = Math.max(enter, Math.min(t0, t1));
                    exit = Math.min(exit, Math.max(t0, t1));
                }
            }
            if (enter <= exit && enter < first) { first = enter; cell.id = `${x},${z}`; }
        }
    }
    return first;
}

function damageCover(id, amount) {
    const prop = cover.get(id);
    if (!prop || prop.health <= 0) return;
    prop.health = Math.max(0, prop.health - amount);
    if (prop.health === 0) arenaMap.blockingCells = arenaMap.blockingCells.filter((key) => key !== id);
    broadcast('event', { kind: 'cover-hit', id, health: prop.health, destroyed: prop.health === 0 });
}

function damage(target, amount, attacker, now, kind) {
    if (!target.alive || target === attacker || now < (target.protectedUntil || 0)) return;
    target.health -= amount;
    if (target.health > 0) {
        broadcast('event', { kind: 'hit', victim: target.slot, attacker: attacker?.slot ?? null, health: target.health, weapon: kind });
        return;
    }
    target.health = 0;
    target.alive = false;
    target.deaths++;
    target.respawnAt = now + ARENA_CONFIG.respawnMs;
    if (attacker && attacker !== target) attacker.kills++;
    broadcast('event', { kind: 'death', victim: target.slot, killer: attacker?.slot ?? null, weapon: kind });
}

// Resolve every explosive impact at its actual position. The owner object is
// retained across reconnects, but never credit a replacement in the same slot.
function impactEvent(projectile,x,y,z,id=null,normal=null) {
    const prop=id && OFFICE_ARENA.props[id];
    if(!normal && id) {
        const [gx,gz]=id.split(',').map(Number),dx=x-gx-.5,dz=z-gz-.5;
        normal=Math.abs(dx)>Math.abs(dz) ? [Math.sign(dx),0,0] : [0,0,Math.sign(dz)];
    }
    broadcast('event',{kind:'impact',weapon:projectile.weapon,x,y,z,projectileId:projectile.id,normal:normal || [0,1,0],color:projectile.owner?.color || 'blue',cellId:id,target:prop ? 'prop' : doors.has(id) ? 'door' : normal?.every(n=>n===0) ? 'player' : 'static',surface:prop ? 'wood' : 'wall'});
}
function splashImpact(projectile, x, y, z, now, directHit = null) {
    if (!projectile.splash) return;
    const attacker = room.players.get(projectile.owner.slot) === projectile.owner ? projectile.owner : null;
    for (const target of room.players.values()) {
        if ((!target.socket && !target.bot) || !target.alive || target === directHit) continue;
        const verticalDistance = Math.max(0, -y, y - ARENA_CONFIG.playerHeight);
        if (Math.hypot(target.x - x, verticalDistance, target.z - z) <= projectile.splash
            && !segmentBlocked(arenaMap, x, z, target.x, target.z)) {
            damage(target, projectile.splashDamage, attacker, now, projectile.weapon);
        }
    }
    broadcast('event', { kind: 'explosion', weapon: projectile.weapon, x, y, z, radius: projectile.splash, color:projectile.owner?.color || 'brass' });
}

function fire(player, now) {
    const weapon = ARENA_WEAPONS[player.weapon];
    if (!weapon || !player.alive || now < player.cooldownAt) return;
    if (weapon.ammoCost > player.paint) return;
    player.cooldownAt = now + weapon.cooldownMs;
    player.paint -= weapon.ammoCost;
    // Client camera: YXZ rotation, y = -yaw - PI/2, x = pitch.
    // Positive pitch looks up. Match its 0.7 eye height.
    const horizontal = Math.cos(player.pitch);
    const dirX = Math.cos(player.yaw) * horizontal, dirY = Math.sin(player.pitch), dirZ = Math.sin(player.yaw) * horizontal;
    const startX = player.x + dirX * 0.42, startY = 0.7 + dirY * 0.42, startZ = player.z + dirZ * 0.42;
    if (weapon.type === 'melee') {
        // Strike the first obstruction, never furniture through a structural wall.
        const cell = {};
        projectileWallHitTime(player, player.x + Math.cos(player.yaw) * weapon.range, player.z + Math.sin(player.yaw) * weapon.range, cell);
        damageCover(cell.id, Math.min(weapon.damage,Math.ceil((OFFICE_ARENA.props[cell.id]?.hp||30)/3)));
        for (const target of room.players.values()) {
            if ((!target.socket && !target.bot) || !target.alive || target === player) continue;
            const dx = target.x - player.x, dz = target.z - player.z;
            const distance = Math.hypot(dx, dz);
            const angle = Math.atan2(dz, dx) - player.yaw;
            const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
            if (distance <= weapon.range && Math.abs(normalized) <= weapon.arc / 2 && !segmentBlocked(arenaMap, player.x, player.z, target.x, target.z)) damage(target, weapon.damage, player, now, player.weapon);
        }
    } else {
        if (!segmentBlocked(arenaMap, player.x, player.z, startX, startZ)) {
            room.projectiles.push({ id: randomUUID(), owner: player, weapon: player.weapon, x: startX, y: startY, z: startZ, vx: dirX * weapon.speed, vy: dirY * weapon.speed, vz: dirZ * weapon.speed, ttl: ARENA_CONFIG.projectileLifeMs, size: weapon.size || 0.04, damage: weapon.damage, splash: weapon.splash || 0, splashDamage: weapon.splashDamage || 0 });
        } else {
            const cell = {};
            const wallTime = projectileWallHitTime(player, startX, startZ, cell);
            const t = Math.max(0, wallTime - 0.0001);
            splashImpact({ ...weapon, weapon: player.weapon, owner: player },
                player.x + (startX - player.x) * t, 0.7 + (startY - 0.7) * t,
                player.z + (startZ - player.z) * t, now);
            impactEvent({...weapon,weapon:player.weapon,owner:player},player.x+(startX-player.x)*t,.7+(startY-.7)*t,player.z+(startZ-player.z)*t,cell.id);
            damageCover(cell.id, weapon.damage);
        }
    }
    broadcast('event', { kind: 'fire', slot: player.slot, weapon: player.weapon, x: startX, y: startY, z: startZ, yaw: player.yaw, pitch: player.pitch });
}

function stepProjectiles(dt, now) {
    const keep = [];
    for (const projectile of room.projectiles) {
        // Stop at the floor; still test the segment before that impact.
        const floorTime = projectile.vy < 0 ? Math.max(0, (projectile.size - projectile.y) / projectile.vy) : Infinity;
        const step = Math.min(dt, projectile.ttl / 1000, floorTime);
        const nx = projectile.x + projectile.vx * step;
        const ny = projectile.y + projectile.vy * step;
        const nz = projectile.z + projectile.vz * step;
        const cell = {};
        const wallTime = projectileWallHitTime(projectile, nx, nz, cell, ny);
        let hit = null, hitTime = Infinity;
        for (const player of room.players.values()) {
            if ((!player.socket && !player.bot) || !player.alive || player === projectile.owner) continue;
            const t = projectileHitTime(projectile, nx, ny, nz, player);
            if (t !== null && t <= wallTime && t < hitTime) { hit = player; hitTime = t; }
        }
        if (hit) {
            // Reconnects retain this object; a new occupant of the slot does not.
            const attacker = room.players.get(projectile.owner.slot) === projectile.owner ? projectile.owner : null;
            damage(hit, projectile.damage, attacker, now, projectile.weapon);
            impactEvent(projectile, projectile.x+(nx-projectile.x)*hitTime, projectile.y+(ny-projectile.y)*hitTime, projectile.z+(nz-projectile.z)*hitTime, null, [0,0,0]);
            splashImpact(projectile, projectile.x + (nx - projectile.x) * hitTime,
                projectile.y + (ny - projectile.y) * hitTime,
                projectile.z + (nz - projectile.z) * hitTime, now, hit);
            continue;
        }
        if (wallTime !== Infinity) {
            // Stay just outside the solid cell so visibility starts on the
            // incoming side. Resolve splash before removing damaged cover.
            const t = Math.max(0, wallTime - 0.0001);
            splashImpact(projectile, projectile.x + (nx - projectile.x) * t,
                projectile.y + (ny - projectile.y) * t,
                projectile.z + (nz - projectile.z) * t, now);
            impactEvent(projectile,projectile.x+(nx-projectile.x)*t,projectile.y+(ny-projectile.y)*t,projectile.z+(nz-projectile.z)*t,cell.id);
            damageCover(cell.id, projectile.damage);
            continue;
        }
        if (floorTime <= step) {
            splashImpact(projectile, nx, ny, nz, now);
            impactEvent(projectile,nx,ny,nz);
            continue;
        }
        projectile.x = nx; projectile.y = ny; projectile.z = nz; projectile.ttl -= dt * 1000;
        if (projectile.ttl > 0 && ny > projectile.size) keep.push(projectile);
    }
    room.projectiles = keep;
}

function safestSpawn(player) {
    const opponents = [...room.players.values()].filter(p => p !== player && p.alive && (p.bot || p.socket));
    return [...OFFICE_ARENA.spawns].filter(([x,z]) => insideMap(arenaMap,x,z)).sort((a,b) => {
        const clearance = point => Math.min(50, ...opponents.map(p => Math.hypot(p.x-point[0], p.z-point[1]) + (segmentBlocked(arenaMap,p.x,p.z,...point) ? 8 : 0)));
        return clearance(b)-clearance(a);
    })[0] || OFFICE_ARENA.spawns[player.slot % OFFICE_ARENA.spawns.length];
}
function simulate(now) {
    if (room.state === 'countdown' && readinessError()) {
        cancelCountdown();
        syncRoom();
    }
    if (room.state === 'countdown' && now >= room.countdownAt) beginMatch();
    if (room.state !== 'active') return;
    if (now >= room.deadline) return finishMatch();
    for (const player of room.players.values()) {
        if (!player.socket && !player.bot) continue;
        if (!player.alive) {
            // Inputs sent while dead never move the respawned player.
            if (player.inputQueue?.length) { player.lastSeq = player.inputQueue.at(-1).seq; player.inputQueue.length = 0; }
            if (now >= player.respawnAt) {
                const [x, z] = safestSpawn(player);
                player.x = x; player.z = z; player.health = ARENA_CONFIG.maxHealth; player.paint = 30; player.alive = true; player.weapon = 'paintbrush'; player.weapons = new Set(['paintbrush', 'tableLeg']);
                player.botTargetAt = room.tick + botTicks(1.5);
                player.protectedUntil = now + 1500;
                player.fireRequested=false;
                if (player.bot) {
                    player.brain = makeBotBrain(player.slot);
                    player.vx = 0; player.vz = 0;
                    player.cooldownAt = 0;
                }
                broadcast('event', { kind: 'respawn', slot: player.slot });
            }
            continue;
        }
        if (player.bot) {
            const input = botInput(player);
            player.lastSeq = input.seq;
            if (input.weapon && player.weapons.has(input.weapon)) player.weapon = input.weapon;
            // moveCircle normalizes analog input to full speed. Scale bot displacement
            // and reported velocity here to retain campaign chase/orbit/patrol speeds.
            const movementScale = (BOT_PACING[player.preset] || BOT_PACING.guard).speed / ARENA_CONFIG.walkSpeed
                * Math.min(1, Math.hypot(input.moveX, input.moveY));
            const oldX = player.x, oldZ = player.z;
            moveCircle(arenaMap, player, input, movementScale / ARENA_CONFIG.tickRate);
            player.brain.stuckTicks = Math.hypot(input.moveX, input.moveY) > 0 && Math.hypot(player.x - oldX, player.z - oldZ) < 0.001 ? player.brain.stuckTicks + 1 : 0;
            player.vx *= movementScale; player.vz *= movementScale;
            pickupFor(player, now);
            if (input.fire) fire(player, now);
            continue;
        }
        // Humans: apply each received input exactly once at the fixed step the
        // client predicted with. Starvation holds position instead of guessing.
        const inputs = takeTickInputs(player.inputQueue);
        let moved = false;
        for (const input of inputs) {
            player.lastSeq = input.seq;
            player.input = input;
            if (input.weapon && player.weapons.has(input.weapon)) player.weapon = input.weapon;
            if (input.tap) { player.yaw = input.yaw; player.pitch = input.pitch; }
            else { moveCircle(arenaMap, player, input, 1 / ARENA_CONFIG.tickRate); moved = true; }
            pickupFor(player, now);
            if (input.fire) fire(player, now);
            if (!player.alive) break;
        }
        if (!moved) { player.vx = 0; player.vz = 0; }
    }
    separatePlayers();
    stepProjectiles(1 / ARENA_CONFIG.tickRate, now);
}

function snapshot() {
    const now = Date.now();
    const payload = {
        doors: [...doors.values()].map(({id,open,openT}) => ({id,open,openT})),
        coverHealth: [...cover.values()].filter(p => p.health > 0 && p.health < OFFICE_ARENA.props[p.id].hp).map(p => ({id:p.id,health:p.health})),
        tick: room.tick,
        serverTime: now,
        matchId: room.matchId,
        state: room.state,
        remainingMs: room.state === 'active' ? Math.max(0, room.deadline - now) : 0,
        players: [...room.players.values()].map((p) => ({ slot: p.slot, bot: Boolean(p.bot), x: +p.x.toFixed(4), z: +p.z.toFixed(4), yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), vx: +p.vx.toFixed(3), vz: +p.vz.toFixed(3), health: p.health, paint: p.paint, alive: p.alive, protectionMs: Math.max(0,(p.protectedUntil || 0)-now), respawnMs: p.alive ? 0 : Math.max(0, p.respawnAt - Date.now()), kills: p.kills, deaths: p.deaths, weapon: p.weapon, weapons: [...p.weapons], lastSeq: p.lastSeq })),
        // Positions and kinds are in the shared map; send only live state.
        pickups: [...room.pickups.values()].map((p) => ({ id: p.id, available: p.availableAt <= now, respawnRemainingMs: Math.max(0, p.availableAt - now) })),
        destroyedCover: [...cover.values()].filter((p) => p.health <= 0).map((p) => p.id),
        projectiles: room.projectiles.map((p) => ({ id: p.id, weapon: p.weapon, size: p.size, color:p.owner?.color || 'brass', vx:+p.vx.toFixed(3), vy:+p.vy.toFixed(3), vz:+p.vz.toFixed(3), x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) })),
    };
    return payload;
}

let lastLoopSampleAt=performance.now();
function tick() {
    const started = performance.now();
    updateDoors(1 / ARENA_CONFIG.tickRate);
    room.tick++;
    metrics.ticks++;
    simulate(Date.now());
    if (room.tick % SNAPSHOT_EVERY === 0) {
        const recipients=[...room.players.values()].map(player=>player.socket).filter(socket=>socket?.readyState===WebSocket.OPEN);
        if (recipients.length) {
            const body = message('snapshot', snapshot());
            metrics.snapshots++;
            metrics.snapshotBytes += Buffer.byteLength(body);
            for (const socket of recipients) {
                // A client that cannot keep up skips snapshots instead of
                // growing server memory; a hopeless backlog is dropped.
                if (socket.bufferedAmount > 1024 * 1024) { metrics.slowDrops = (metrics.slowDrops || 0) + 1; socket.terminate(); continue; }
                if (socket.bufferedAmount > 128 * 1024) { metrics.skippedSnapshots = (metrics.skippedSnapshots || 0) + 1; continue; }
                socket.send(body);
            }
        }
    }
    // Include serialization and socket enqueueing in server update cost.
    const finished=performance.now();
    room.tickSamples.push(finished-started);
    if (room.tickSamples.length > 300) room.tickSamples.shift();
    const sorted = [...room.tickSamples].sort((a, b) => a - b);
    metrics.tickMsP95 = +(sorted[Math.floor((sorted.length - 1) * 0.95)] || 0).toFixed(3);
    // A one-second window collects useful samples at the monitor's 20 ms resolution.
    if(finished-lastLoopSampleAt>=1000){
        metrics.eventLoopP99Ms = +(loopDelay.percentile(99) / 1e6).toFixed(3);
        loopDelay.reset();lastLoopSampleAt=finished;
    }
}

function handleMessage(socket, raw) {
    let data;
    try { data = parseMessage(raw); } catch (error) { metrics.protocolErrors++; return send(socket, 'error', { code: error.message, message: 'Invalid Arena message.' }); }
    const player = socket.player;
    if (!player) {
        if (data.type !== 'hello') return send(socket, 'error', { code: 'hello_required', message: 'Send hello first.' });
        return joinRoom(socket, data);
    }
    if(data.type==='ping' && Number.isFinite(data.sentAt)) return send(socket,'pong',{sentAt:data.sentAt});
    if (data.type === 'input') {
        if (room.state !== 'active' || data.matchId !== room.matchId) return;
        const input = normalizeInput(data);
        if (input.seq <= player.queuedSeq) return;
        player.queuedSeq = input.seq;
        player.inputQueue.push(input);
        if (player.inputQueue.length > MAX_QUEUED_INPUTS) player.inputQueue.shift();
        player.inputAt = Date.now();
        return;
    }
    if (data.type === 'interact' && room.state === 'active') { toggleDoor(player); return; }
    if (data.type === 'ready') {
        if (room.state === 'active') return;
        if (room.state === 'results' && !canRematch()) return send(socket, 'error', { code: 'results_locked', message: 'Results remain visible briefly.' });
        if (room.state === 'results') room.state = 'lobby';
        player.ready = Boolean(data.ready);
        beginCountdown();
        return syncRoom();
    }
    if (data.type === 'bots' && player.slot === room.hostSlot && ['lobby', 'results'].includes(room.state)) {
        if(data.enabled!==false && data.count!==undefined && (!Number.isInteger(data.count) || data.count<1 || data.count>=ARENA_CONFIG.maxPlayers)) return send(socket,'error',{code:'invalid_bot_count',message:'Choose between one and seven bots.'});
        if(room.state==='results' && !canRematch()) return send(socket,'error',{code:'results_locked',message:startError('results_locked')});
        if (room.state === 'results') room.state = 'lobby';
        // Changing opponents always requires a fresh, explicit host start.
        player.ready=false;
        if (data.enabled === false) removeBots();
        else fillBots(data.count);
        return syncRoom();
    }
    if (data.type === 'start' && player.slot === room.hostSlot) {
        if (room.state === 'results' && canRematch()) room.state = 'lobby';
        if (room.state !== 'lobby') return send(socket, 'error', { code: room.state === 'results' ? 'results_locked' : 'round_already_live', message: startError(room.state === 'results' ? 'results_locked' : 'round_already_live') });
        // Opponent selection is separate from readying; start never adds bots.
        player.ready = true;
        const gate = beginCountdown();
        if (!gate.ok) {
            syncRoom();
            return send(socket, 'error', { code: gate.reason, message: startError(gate.reason) });
        }
        return syncRoom();
    }
    if (data.type === 'leave') {
        const slot = player.slot;
        cancelCountdown();
        player.socket = null;
        player.reservedUntil = 0;
        socket.player = null;
        room.players.delete(slot);
        if (room.hostSlot === slot) transferHost();
        resetVacantRoom();
        syncRoom();
        return socket.close(1000, 'left room');
    }
    if (data.type === 'chat') {
        const text = cleanChat(data.text);
        if (!text) return;
        const entry = { name: player.name, slot: player.slot, text, at: Date.now() };
        room.chat.push(entry);
        if (room.chat.length > 30) room.chat.shift();
        return broadcast('chat', { entry });
    }
    if (data.type === 'ping') return send(socket, 'pong', { now: Date.now() });
}

function contentType(path) {
    return { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }[extname(path)] || 'application/octet-stream';
}

async function staticResponse(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health' || url.pathname === '/api/arena/health') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: validateOfficeManifest(OFFICE_ARENA).length === 0, protocol: PROTOCOL_VERSION, mapHash: OFFICE_MAP_HASH, state: room.state, players: room.players.size, connected: [...room.players.values()].filter((p) => p.socket).length, metrics }));
        return;
    }
    if (url.pathname === '/api/arena/rooms') {
        res.setHeader('content-type', 'application/json');
        const participants = room.players.size;
        const bots = [...room.players.values()].filter((p) => p.bot).length;
        const humans = [...room.players.values()].filter((p) => !p.bot).length;
        const joinable = participants < ARENA_CONFIG.maxPlayers && (room.state !== 'active' || Date.now() < room.deadline - 10000);
        res.end(JSON.stringify({ rooms: [{ code: room.code, map: OFFICE_ARENA.name, state: room.state, players: participants, humans, maxPlayers: ARENA_CONFIG.maxPlayers, bots, joinable }] }));
        return;
    }
    // The Arena host is also the game host. Keep campaign scoreboard,
    // telemetry, and archive routes on the same origin so entering Arena does
    // not silently break the rest of Table Quest.
    if (url.pathname.startsWith('/api/')) return handleScoreboardRequest(req, res);
    if (url.pathname === '/' || url.pathname === '/index.html') {
        const path = existsSync(pathJoin(HERE, 'dist/index.html')) ? pathJoin(HERE, 'dist/index.html') : pathJoin(HERE, 'index.html');
        const body = await readFile(path);
        res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(body); return;
    }
    if (url.pathname === '/arena' || url.pathname === '/arena/') {
        const path = existsSync(pathJoin(HERE, 'dist/arena/index.html')) ? pathJoin(HERE, 'dist/arena/index.html') : pathJoin(HERE, 'arena/index.html');
        const body = await readFile(path);
        res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(body); return;
    }
    if (!url.pathname.startsWith('/arena/')) {
        const safe = normalize(url.pathname).replace(/^\.\.(\/|\\|$)/, '');
        const path = pathJoin(HERE, 'dist', safe);
        try { const body = await readFile(path); res.setHeader('content-type', contentType(path)); res.end(body); }
        catch { res.statusCode = 404; res.end('Not found'); }
        return;
    }
    const relative = url.pathname.slice('/arena/'.length) || 'index.html';
    const safe = normalize(relative).replace(/^\.\.(\/|\\|$)/, '');
    const base = existsSync(pathJoin(HERE, 'dist/arena')) ? pathJoin(HERE, 'dist/arena') : pathJoin(HERE, 'arena');
    const path = pathJoin(base, safe);
    try { const body = await readFile(path); res.setHeader('content-type', contentType(path)); res.end(body); }
    catch { res.statusCode = 404; res.end('Not found'); }
}

const server = createServer((req, res) => staticResponse(req, res).catch(() => { res.statusCode = 500; res.end('Arena server error'); }));
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false, maxBufferSize: 64 * 1024 });
wss.on('connection', (socket) => {
    metrics.connections++;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    const timer = setTimeout(() => { if (!socket.player) socket.close(4000, 'hello timeout'); }, 5000);
    socket.on('message', (raw) => handleMessage(socket, raw));
    socket.on('close', () => { clearTimeout(timer); disconnect(socket); });
    socket.on('error', () => { clearTimeout(timer); disconnect(socket); });
});
server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/arena/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req));
});

const interval = setInterval(tick, TICK_MS);
// Sleeping laptops and dropped Wi-Fi leave half-open sockets that never send
// close. Two missed pings (about 20 s) release the slot into reconnect grace.
const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
        if (!socket.isAlive) { socket.terminate(); continue; }
        socket.isAlive = false;
        try { socket.ping(); } catch { socket.terminate(); }
    }
}, Number(process.env.TQ_ARENA_HEARTBEAT_MS || 10000));
server.on('close', () => { clearInterval(interval); clearInterval(heartbeat); });

export { server, room, tick, snapshot, validateOfficeManifest };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    server.listen(PORT, HOST, () => console.log(JSON.stringify({ event: 'arena.started', host: HOST, port: PORT, map: OFFICE_ARENA.name, mapHash: OFFICE_MAP_HASH, maxPlayers: ARENA_CONFIG.maxPlayers })));
}
