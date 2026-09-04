/** Face animation strips (Round 4 H2): frames of the bench portrait over time, and through a hit. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/H2';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { TQ.skipBoot(); TQ.startGameAt(0); TQ.godmode(true); TQ.teleport(15, 9); TQ.player.rot = -1.57; });
await p.waitForTimeout(1500);
// strip: the portrait canvas rendered at 4 frames/second for 3 s, then a hit, then recovery
const frames = [];
const grab = async (label) => { frames.push({ label, data: await p.evaluate(() => document.getElementById('face-canvas').toDataURL('image/png')) }); };
for (let i = 0; i < 8; i++) { await grab(`idle ${(i * 0.4).toFixed(1)}s`); await p.waitForTimeout(400); }
await p.evaluate(() => { const g = TQ.game; g.godmode = false; g.player.health = 60; g.hurtPlayer(1, g.player.x + Math.cos(g.player.rot + 1.2) * 3, g.player.y + Math.sin(g.player.rot + 1.2) * 3, 0xe03a2a); g.godmode = true; });
for (let i = 0; i < 8; i++) { await grab(`hit +${(i * 0.12).toFixed(2)}s`); await p.waitForTimeout(120); }
await p.evaluate(() => { TQ.game.player.health = 18; });
for (let i = 0; i < 4; i++) { await grab(`low ${i}`); await p.waitForTimeout(350); }
await p.evaluate(() => { TQ.game.player.health = 100; TQ.hud.pickupFlash(); });
for (let i = 0; i < 4; i++) { await grab(`grin ${i}`); await p.waitForTimeout(200); }
// compose the strip on a page
const html = `<body style="margin:0;background:#1a1410;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:10px;font:11px monospace;color:#e8dcc0">${frames.map(f => `<div style="text-align:center"><img src="${f.data}" style="width:140px;height:140px;border:3px solid #5a3414"><br>${f.label}</div>`).join('')}</body>`;
const p2 = await b.newPage({ viewport: { width: 1280, height: 620 } }); await p2.setContent(html); await p2.waitForTimeout(300);
await p2.screenshot({ path: `${out}/face-strip.jpg`, type: 'jpeg', quality: 88 });
console.log('strip written', frames.length, 'ERRORS', JSON.stringify(errors));
await b.close();
