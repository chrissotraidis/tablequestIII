/** Focused regressions: input, delayed state changes, asset/resource lifetime. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || '/tmp/tablequest-sanity';
mkdirSync(out, {recursive:true});
const browser = await launchBrowser();
const page = await browser.newPage({viewport:{width:1280,height:800}});
const errors=[]; const checks=[]; const memory=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
const check=(value,name)=>{assert.ok(value,name);checks.push(name)};
try {
 await page.goto(url); await page.waitForFunction(()=>!!window.TQ);
 await page.evaluate(async()=>{TQ.skipBoot();await TQ.startGameAt(1);TQ.godmode(true)});
 const controls=await page.evaluate(async()=>{
  const releaseAllKeys=()=>{TQ.setState('pause');TQ.setState('play')};
  const key=(code,repeat=false,target=window)=>target.dispatchEvent(new KeyboardEvent('keydown',{code,repeat,bubbles:true,cancelable:true}));
  releaseAllKeys(); key('KeyC'); key('KeyC',true); const aim=TQ.input.aimToggled;
  releaseAllKeys(); key('AltLeft'); key('AltLeft',true); const sprint=TQ.input.sprintToggled;
  releaseAllKeys(); key('KeyQ'); key('KeyQ',true); const cycles=TQ.input.cycleWeapon;
  releaseAllKeys(); key('Space'); key('ControlLeft'); TQ.input.mouseDX=42; releaseAllKeys();
  const cleared=!TQ.input.jump&&!TQ.input.fire&&!TQ.input.fireKeyHeld&&TQ.input.mouseDX===0;
  TQ.setState('pause'); key('KeyW'); TQ.setState('play'); const resumed=!TQ.input.forward;
  const field=document.createElement('input');document.body.append(field);field.focus();key('KeyW',false,field);key('KeyC',false,field);
  const typing=!TQ.input.forward&&!TQ.input.aimToggled;field.remove();
  return {aim,sprint,cycles,cleared,resumed,typing};
 });
 for(const k of ['aim','sprint','cleared','resumed','typing'])check(controls[k],k);
 check(controls.cycles===1,'held Q cycles once');
 await page.keyboard.press('Escape');
 await page.locator('#pause-items').getByText('Controls', {exact:true}).click();
 await page.getByRole('button',{name:/Move Forward/}).click();
 await page.keyboard.press('2');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.evaluate(()=>TQ.giveAll());
 await page.keyboard.down('2');
 check(await page.evaluate(()=>TQ.input.forward&&TQ.player.currentWeapon===0),'remapped number key moves without switching weapon');
 await page.keyboard.up('2');
 await page.keyboard.press('Escape');
 await page.locator('#pause-items').getByText('Controls', {exact:true}).click();
 await page.getByRole('button',{name:/Reset Controls/}).click();
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.evaluate(()=>TQ.retry());
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>TQ.state==='play');
 check(await page.evaluate(()=>TQ.game.jumpZ===0),'Space deploys without jumping');
 // Same-floor comparisons after warming both floors isolate resource leaks
 // from legitimate first-use shader/texture caches and projectile pools.
 for(let pass=0;pass<4;pass++)for(const floor of [1,4]){
  const row=await page.evaluate(async floor=>{
   await TQ.startGameAt(floor);TQ.setState('pause');await TQ.settle(3);
   return {floor:floor+1,...TQ.renderer.info.memory,programs:TQ.renderer.info.programs.length};
  },floor);memory.push(row);
 }
 for(const floor of [2,5]){
  const samples=memory.filter(r=>r.floor===floor).slice(1);
  check(samples.at(-1).textures===samples[0].textures,`floor ${floor} GPU textures stable`);
  check(samples.at(-1).geometries===samples[0].geometries,`floor ${floor} GPU geometry stable`);
 }
 // A scheduled death in an abandoned floor must not kill a fresh player.
 await page.evaluate(async()=>{
  await TQ.startGameAt(0);TQ.game.godmode=false;
  TQ.game.player.alive=false;TQ.game.cb.onDeath();
  await TQ.startGameAt(1);TQ.godmode(true);
 });
 await page.waitForTimeout(1100);
 check(await page.evaluate(()=>TQ.state==='play'&&TQ.player.alive),'old death timer cannot end new run');
 await page.evaluate(()=>{TQ.player.alive=false;TQ.game.cb.onDeath();TQ.setState('pause')});
 await page.waitForTimeout(1100);
 await page.evaluate(()=>TQ.setState('play'));
 check(await page.evaluate(()=>TQ.state==='gameover'),'pausing death cannot leave dead player in play');
 await page.evaluate(async()=>{await TQ.startGameAt(0);TQ.godmode(true);TQ.collectAllTables();TQ.warpElevator()});
 await page.waitForFunction(()=>TQ.state==='transition');
 await page.evaluate(async()=>{await TQ.startGameAt(3);TQ.godmode(true)});
 await page.waitForTimeout(2600);
 check(await page.evaluate(()=>TQ.state==='play'&&TQ.game.levelIndex===3),'old elevator timer cannot replace new floor');
 const assets=await page.evaluate(()=>({
  broken:[...document.images].filter(i=>i.currentSrc&&(!i.complete||!i.naturalWidth)).map(i=>i.id||i.src),
  sprite:TQ.game.pickups.filter(p=>p.kind==='health').every(p=>{let ok=false;p.mesh.traverse(o=>{if(o.material?.map?.image?.width>0)ok=true});return ok}),
 }));
 check(!assets.broken.length,'DOM artwork decoded');check(assets.sprite,'original health sprite decoded');
 check(!errors.length,'no page errors or failed requests');
 console.log(JSON.stringify({checks,memory,errors},null,2));
} finally {
 writeFileSync(`${out}/sanity.json`,JSON.stringify({checks,memory,errors},null,2));
 await browser.close();
}
