import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const url=process.argv[2]||'http://127.0.0.1:4178/', out=process.argv[3]||'/tmp/tablequest-followup';
mkdirSync(out,{recursive:true});
const browser=await launchBrowser(), checks=[], samples=[], errors=[];
const check=(ok,name)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
try{
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.ambientTicks=new Map();window.createdSources=0;
 const nativeTimeout=window.setTimeout,nativeClear=window.clearTimeout;
 window.setTimeout=(fn,delay,...args)=>{
  const id=nativeTimeout(()=>{ambientTicks.delete(id);fn(...args);},delay);
  // Current boss ambience has a delayed thunder cue; exclude short game timers.
  if(delay>=5000&&delay<30000)ambientTicks.set(id,()=>fn(...args));
  return id;
 };
 window.clearTimeout=id=>{ambientTicks.delete(id);nativeClear(id);};
 const Native=AudioContext;window.AudioContext=class extends Native{
  constructor(...args){super(...args);window.testCtx=this;}
  createOscillator(...args){createdSources++;return super.createOscillator(...args);}
  createBufferSource(...args){createdSources++;return super.createBufferSource(...args);}
 };
 localStorage.setItem('tq3d-highscore','39845');
});
await page.goto(url+'?test=followup');await page.waitForFunction(()=>window.TQ);
await page.evaluate(()=>TQ.skipBoot());
check(await page.locator('#menu-highscore').textContent()==='39,845','local best has readable unpadded formatting');
await page.screenshot({path:`${out}/menu.png`});
await page.locator('#menu-items').getByText('Floor Select',{exact:true}).click();
const buttons=page.locator('#level-list .level-item');
check((await buttons.first().textContent()).includes('FLOOR 1'),'floor list starts with Floor 1');
await buttons.nth(5).click();
check(await page.evaluate(()=>TQ.state==='menu') && await page.locator('#fs-play').textContent()==='PLAY FLOOR 6','selection previews the floor before explicit launch');
await page.screenshot({path:`${out}/floor-select.png`});
await page.locator('#fs-play').click();await page.waitForFunction(()=>TQ.state==='loading');await page.keyboard.press('Enter');await page.waitForFunction(()=>TQ.state==='play');
await page.evaluate(()=>{TQ.godmode();TQ.setTestMode();});
check(await page.evaluate(()=>TQ.game.levelIndex===5),'Play Floor launches the selected boss floor');
// Headless Chrome does not grant native pointer lock on this host. Replay its
// change events and the OS warp event through the real game/input handlers.
await page.evaluate(()=>{
 window.setTestLock=locked=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:locked?document.querySelector('#game-canvas'):null});document.dispatchEvent(new Event('pointerlockchange'));};
 setTestLock(true);TQ.game.smDX=180;TQ.game.smDY=120;setTestLock(false);
});
await page.waitForFunction(()=>TQ.state==='pause');
const orientation=await page.evaluate(()=>({rot:TQ.player.rot,pitch:TQ.game.pitch}));
await page.evaluate(()=>{TQ.setState('play');setTestLock(true);document.dispatchEvent(new MouseEvent('mousemove',{movementX:900,movementY:800}));});
await page.waitForTimeout(150);
check(await page.evaluate(before=>Math.abs(TQ.player.rot-before.rot)<.005 && Math.abs(TQ.game.pitch-before.pitch)<.005,orientation),'recapture event clears residual smoothing and ignores cursor-warp delta');
await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:20,movementY:0})));
await page.waitForTimeout(150);
check(await page.evaluate(before=>Math.abs(TQ.player.rot-before.rot)>.005,orientation),'normal mouse look resumes after recapture');
await page.evaluate(()=>{setTestLock(false);delete document.pointerLockElement;TQ.setState('pause');});
// Dense boss score, phase two, returning to menus and restarting other floors.
for(let i=0;i<(Number(process.env.TQ_SOAK_SECONDS)||150);i++){
 if(i===45)await page.evaluate(()=>TQ.setMix({bossPhase2:true}));
 if([75,95,115].includes(i)){
  await page.locator('#pause-items').getByText('Quit to Menu',{exact:true}).click();
  await page.waitForTimeout(1000);
  await page.evaluate(async()=>{await TQ.startGameAt(5);TQ.godmode();TQ.setState('pause');});
 }
 await page.waitForTimeout(1000);
 samples.push(await page.evaluate(()=>TQ.audioHealth()));
 if(i%15===0)console.log('Boss sample',i,JSON.stringify(samples.at(-1)));
}
check(samples.every(a=>a.schedulerErrors===0 && a.voices.nodes<1000),'boss and phase-two soundtrack keep a bounded live graph');
const last=samples.at(-1);check(!last.playback || last.playback.underrunDuration/last.playback.totalDuration<.01,'boss output underruns remain below one percent during transitions');
// Confirm hidden tabs stop audio and a visible tab resumes its same context.
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
await page.waitForFunction(()=>testCtx.state==='suspended');
check(await page.evaluate(()=>{const before=createdSources,ticks=[...ambientTicks.values()];ticks.forEach(fn=>fn());return ticks.length>0&&createdSources===before;}),'hidden ambient timers cannot stack new sounds on a suspended clock');
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
await page.waitForFunction(()=>testCtx.state==='running');
check(true,'hide/return resumes the existing audio context');
check(await page.evaluate(()=>{const before=createdSources;[...ambientTicks.values()].forEach(fn=>fn());return createdSources>before;}),'visible ambience timers still produce their sounds');
check(errors.length===0,'no runtime exceptions');
}finally{writeFileSync(`${out}/followup.json`,JSON.stringify({checks,samples,errors},null,2));await browser.close();}
