import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const port = 4183;
const repo = fileURLToPath(new URL('..', import.meta.url));
const server = spawn(process.execPath, ['server/arena-server.mjs'], {
    cwd: repo,
    env: { ...process.env, PORT: String(port), TQ_ARENA_COUNTDOWN_MS: '100', TQ_ARENA_ROUND_MS: '3500' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(25);
    }
    throw new Error(`Timed out waiting for solo bot match. ${output}`);
}

const received = [];
let client;
try {
    await waitFor(() => output.includes('arena.started'));
    client = new WebSocket(`ws://127.0.0.1:${port}/arena/ws`);
    client.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
    client.send(JSON.stringify({ v: 1, type: 'hello', protocol: 1, name: 'Solo Tester', preset: 'manager', color: 'red' }));
    await waitFor(() => received.some((message) => message.type === 'welcome'));
    const rooms = await fetch(`http://127.0.0.1:${port}/api/arena/rooms`).then((response) => response.json());
    if (rooms.rooms?.[0]?.map !== 'THE OFFICE') throw new Error(`room browser did not report Office: ${JSON.stringify(rooms)}`);
    client.send(JSON.stringify({ v: 1, type: 'chat', text: 'bots ready' }));
    client.send(JSON.stringify({v:1,type:'ready',ready:true}));
    await waitFor(()=>received.some(m=>m.type==='room' && m.roster.find(p=>!p.bot)?.ready));
    client.send(JSON.stringify({v:1,type:'bots',enabled:true,count:99}));
    await waitFor(()=>received.some(m=>m.type==='error'&&m.code==='invalid_bot_count'));
    client.send(JSON.stringify({v:1,type:'bots',enabled:true,count:1}));
    await waitFor(()=>received.some(m=>m.type==='room'&&m.bots===1));
    client.send(JSON.stringify({v:1,type:'bots',enabled:true,count:3}));
    await waitFor(()=>received.some(m=>m.type==='room'&&m.bots===4));
    client.send(JSON.stringify({ v: 1, type: 'bots', enabled: true }));
    await waitFor(() => received.some(message => message.type === 'room' && message.bots === 7));
    const filled=received.filter(m=>m.type==='room' && m.bots===7).at(-1);
    if(filled.roster.find(p=>!p.bot)?.ready)throw Error('Adding bots retained an earlier ready state');
    await sleep(250);
    if (received.some(message => message.type === 'snapshot' && message.state === 'active')) throw new Error('Adding bots started the match');
    client.send(JSON.stringify({ v: 1, type: 'ready', ready: true }));
    await waitFor(() => received.some((message) => message.type === 'room' && message.bots === 7));
    await waitFor(() => received.some((message) => message.type === 'snapshot' && message.state === 'active'));
    const active = received.find((message) => message.type === 'snapshot' && message.state === 'active');
    if (active.players.length !== 8 || active.players.filter((player) => player.bot).length !== 7) {
        throw new Error(`expected one human plus seven bots: ${JSON.stringify(active.players)}`);
    }
    const fullRooms = await fetch(`http://127.0.0.1:${port}/api/arena/rooms`).then((response) => response.json());
    if (fullRooms.rooms?.[0]?.joinable !== false) throw new Error(`full room was advertised as joinable: ${JSON.stringify(fullRooms)}`);
    const botStart = new Map(active.players.filter((player) => player.bot).map((player) => [player.slot, `${player.x}:${player.z}`]));
    client.send(JSON.stringify({ v: 1, type: 'input', matchId: active.matchId, seq: 1, moveY: 1, yaw: 0, pitch: 0, weapon: 'paintbrush', fire: true }));
    await waitFor(() => received.some((message) => message.type === 'chat' && message.entry?.text === 'bots ready'));
    await waitFor(() => received.some((message) => message.type === 'snapshot' && message.projectiles.length > 0), 5000);
    await waitFor(() => received.some((message) => message.type === 'snapshot' && message.state === 'active' && message.players.some((player) => player.bot && botStart.get(player.slot) !== `${player.x}:${player.z}`)), 5000);
    await waitFor(() => received.some((message) => message.type === 'result'), 7000);
    await waitFor(()=>received.some(m=>m.type==='room'&&m.state==='results'));
    const resultRoom=received.find(m=>m.type==='room'&&m.state==='results');
    if(!(resultRoom.rematchWaitMs>0&&resultRoom.rematchWaitMs<=10000))throw Error('Results must advertise their remaining rematch hold');
    await sleep(10050);
    client.send(JSON.stringify({ v: 1, type: 'ready', ready: true }));
    await waitFor(() => received.some((message) => message.type === 'snapshot' && message.state === 'active' && message.matchId !== active.matchId), 5000);
    console.log('Arena solo bots: PASS (one/three/fill bot choices, invalid count rejection, one human, seven server bots, room browser, chat, bot movement/fire, results, rematch)');
} finally {
    client.close();
    server.kill('SIGTERM');
    await sleep(100);
}
