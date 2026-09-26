import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const port = 4181;
const repo = fileURLToPath(new URL('..', import.meta.url));
const server = spawn(process.execPath, ['server/arena-server.mjs'], {
    cwd: repo,
    env: { ...process.env, PORT: String(port), TQ_ARENA_COUNTDOWN_MS: '100', TQ_ARENA_ROUND_MS: '1200' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(predicate, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(25);
    }
    throw new Error(`Timed out waiting for Arena state. ${output}`);
}

const clients = [];
const messages = [];
try {
    await waitFor(() => output.includes('arena.started'));
    for (let i = 0; i < 8; i++) {
        const client = new WebSocket(`ws://127.0.0.1:${port}/arena/ws`);
        const received = [];
        client.on('message', (raw) => { received.push(JSON.parse(raw.toString())); });
        await new Promise((resolve, reject) => {
            client.once('open', resolve);
            client.once('error', reject);
        });
        client.send(JSON.stringify({ v: 1, type: 'hello', protocol: 1, name: `Guest ${i + 1}`, preset: ['guard', 'manager', 'executive'][i % 3], color: ['brass', 'blue', 'red', 'green', 'violet', 'orange'][i % 6] }));
        clients.push(client);
        messages.push(received);
    }
    await waitFor(() => messages.every((list) => list.some((m) => m.type === 'welcome')));
    for (const client of clients) client.send(JSON.stringify({ v: 1, type: 'ready', ready: true }));
    await waitFor(() => messages.some((list) => list.some((m) => m.type === 'snapshot' && m.state === 'active')));
    const active = messages.flat().find((m) => m.type === 'snapshot' && m.state === 'active');
    if (active.players.length !== 8) throw new Error(`expected 8 players in snapshot, got ${active.players.length}`);
    const pickupIds = new Set(active.pickups.map((pickup) => pickup.id));
    for (const id of ['paintbrush', 'table-leg', 'sprayer', 'nailgun', 'roller']) {
        if (!pickupIds.has(id)) throw new Error(`missing ${id} pickup in active snapshot`);
    }
    for (let i = 0; i < clients.length; i++) clients[i].send(JSON.stringify({ v: 1, type: 'input', matchId: active.matchId, seq: 1, moveY: 1, yaw: (i % 4) * 0.5, pitch: 0, weapon: 'paintbrush', fire: true }));
    await waitFor(() => messages.some((list) => list.some((m) => m.type === 'result')), 5000);
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((res) => res.json());
    if (!health.ok || health.connected !== 8 || health.metrics.protocolErrors) throw new Error(`unexpected health: ${JSON.stringify(health)}`);
    const original=messages[0].find(m=>m.type==='welcome');
    const results=messages[0].find(m=>m.type==='result').results;
    clients[0].terminate();
    await sleep(100);
    async function join(data){
        const socket=new WebSocket(`ws://127.0.0.1:${port}/arena/ws`),received=[];
        clients.push(socket);socket.on('message',raw=>received.push(JSON.parse(raw)));
        await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
        socket.send(JSON.stringify({v:1,type:'hello',protocol:1,...data}));
        await waitFor(()=>received.some(m=>m.type==='welcome'));
        return {socket,welcome:received.find(m=>m.type==='welcome')};
    }
    const restored=await join({name:'Guest 1',reconnectToken:original.token});
    if(JSON.stringify(restored.welcome.room.results)!==JSON.stringify(results))throw Error('Reconnect lost frozen results');
    const originalId=results.find(p=>p.slot===original.slot).playerId;
    if(restored.welcome.room.roster.find(p=>p.slot===original.slot).playerId!==originalId)throw Error('Reconnect changed participant identity');
    restored.socket.send(JSON.stringify({v:1,type:'leave'}));await sleep(100);
    const replacement=await join({name:'Guest 1'});
    if(replacement.welcome.slot!==original.slot)throw Error('Fixture did not reuse slot');
    if(replacement.welcome.room.roster.find(p=>p.slot===original.slot).playerId===originalId)throw Error('Replacement inherited prior participant identity');
    if(JSON.stringify(replacement.welcome.room.results)!==JSON.stringify(results))throw Error('Replacement mutated final standings');
    if(JSON.stringify(replacement.welcome.room.results).includes(original.token))throw Error('Reconnect credential exposed in results');
    console.log(`Arena server: PASS (8 concurrent sockets, Office snapshot, all slots active, input accepted, results recovery, same-slot replacement identity, health metrics)`);
} finally {
    for (const client of clients) client.close();
    server.kill('SIGTERM');
    await sleep(100);
}
