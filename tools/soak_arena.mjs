// Arena soak: one host + 7 bots for N minutes on an isolated server; samples RSS,
// tick p95, event loop p99, snapshot sizes and errors. Rounds restart as they end.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const minutes = Number(process.env.SOAK_MIN || 30), port = 4240;
const server = spawn(process.execPath, ['server/arena-server.mjs'], { cwd: repo, env: { ...process.env, PORT: String(port), TQ_ARENA_COUNTDOWN_MS: '1500', TQ_ARENA_ROUND_MS: '120000', TQ_DATA_FILE: '/tmp/tq-soak-lb.json', TQ_TELEMETRY_FILE: '/tmp/tq-soak-t.jsonl' }, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = 0; server.stderr.on('data', (d) => { errors++; process.stderr.write(d); });
await new Promise((r) => setTimeout(r, 800));
const ws = new WebSocket('ws://127.0.0.1:' + port + '/arena/ws'); let matchId = 0, state = '', seq = 0, rounds = 0, snaps = 0, bytes = 0;
ws.on('open', () => ws.send(JSON.stringify({ v: 1, type: 'hello', protocol: 1, name: 'Soak' })));
ws.on('message', (raw) => { const m = JSON.parse(raw);
  if (m.type === 'welcome') { ws.send(JSON.stringify({ v: 1, type: 'bots', enabled: true })); setTimeout(() => ws.send(JSON.stringify({ v: 1, type: 'start' })), 300); }
  if (m.type === 'room') { if (m.state === 'results' && state !== 'results') { rounds++; setTimeout(() => ws.send(JSON.stringify({ v: 1, type: 'ready', ready: true })), 11000); } state = m.state; matchId = m.matchId; }
  if (m.type === 'snapshot') { snaps++; bytes += raw.length; } });
setInterval(() => { if (state === 'active') ws.send(JSON.stringify({ v: 1, type: 'input', matchId, seq: ++seq, moveY: 1, yaw: seq / 40, fire: seq % 8 === 0, viewDelay: 120 })); }, 33);
const samples = [];
const sample = async () => { const h = await (await fetch('http://127.0.0.1:' + port + '/health')).json(); const rss = Number((await new Promise((r) => { const p = spawn('ps', ['-o', 'rss=', '-p', String(server.pid)]); let o = ''; p.stdout.on('data', (d) => o += d); p.on('close', () => r(o)); })).trim()) / 1024; samples.push({ t: samples.length, heapMB: h.memory.heapUsedMB, rssMB: +rss.toFixed(1), tickP95: h.metrics.tickMsP95, loopP99: h.metrics.eventLoopP99Ms, state: h.state }); };
for (let i = 0; i < minutes; i++) { await new Promise((r) => setTimeout(r, 60000)); await sample(); }
const first = samples.slice(1, 4).reduce((a, s) => a + s.rssMB, 0) / 3, last = samples.slice(-3).reduce((a, s) => a + s.rssMB, 0) / 3;
console.log(JSON.stringify({ minutes, rounds, avgSnapshotBytes: Math.round(bytes / snaps), rssStartMB: +first.toFixed(1), rssEndMB: +last.toFixed(1), worstTickP95: Math.max(...samples.map((s) => s.tickP95)), worstLoopP99: Math.max(...samples.map((s) => s.loopP99)), serverErrors: errors, heapTrendMB: samples.map((s) => s.heapMB) }));
server.kill(); process.exit(0);
