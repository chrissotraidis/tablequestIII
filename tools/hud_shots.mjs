/**
 * Bench HUD screenshots (Round 2 R2): Floor 1 at 1280×800 and 960×600, a hurt
 * moment, the face contact sheet, and the pause panel.
 *   node tools/hud_shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'docs/evidence/R2';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(800);
const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', name); };
await p.evaluate(() => { TQ.skipBoot(); TQ.startGameAt(0); TQ.giveAll(); TQ.hud.holdCard = false; TQ.teleport(15, 9); TQ.player.rot = -1.57; TQ.game.pitch = 0.05; });
await p.waitForTimeout(2500);
await shot('bench-1280');
// hurt from the right with red paint, low health
await p.evaluate(() => { const g = TQ.game; g.godmode = false; g.player.health = 22; g.hurtPlayer(1, g.player.x + Math.cos(g.player.rot + 1.2) * 3, g.player.y + Math.sin(g.player.rot + 1.2) * 3, 0xe03a2a); });
await p.waitForTimeout(300);
await shot('bench-hurt-low');
await p.evaluate(() => { TQ.game.player.health = 100; });
await p.setViewportSize({ width: 960, height: 600 }); await p.waitForTimeout(1500);
await shot('bench-960');
await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(800);
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
await shot('pause-portrait');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.evaluate(() => TQ.faceSheet(true)); await p.waitForTimeout(300);
await shot('face-sheet');
await p.evaluate(() => TQ.faceSheet(false));
console.log('ERRORS', JSON.stringify(errors));
await b.close();
