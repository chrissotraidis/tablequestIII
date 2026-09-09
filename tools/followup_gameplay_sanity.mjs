import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launchBrowser} from './browser.mjs';
const url=process.argv[2]||'http://127.0.0.1:4178/',out=process.argv[3]||'/tmp/tablequest-followup-gameplay';
mkdirSync(out,{recursive:true});
const browser=await launchBrowser(),checks=[],samples=[],errors=[];
const check=(ok,name)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
try {
 const pages=[];
 for(const floor of [1,5]){
  const page=await browser.newPage({viewport:{width:1440,height:900}});pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?test=followup-active');await page.waitForFunction(()=>window.TQ);
  await page.evaluate(async floor=>{TQ.skipBoot();await TQ.startGameAt(floor);TQ.setTestMode();TQ.godmode();TQ.giveAll();TQ.game.switchWeapon(5);TQ.input.fireKeyHeld=true;TQ.player.ammo=99999;},floor);
 }
 for(let i=0;i<(Number(process.env.TQ_SOAK_SECONDS)||90);i++){
  if(i===30)await pages[1].evaluate(()=>TQ.setMix({bossPhase2:true}));
  await pages[0].waitForTimeout(1000);
  samples.push(await Promise.all(pages.map(p=>p.evaluate(()=>({state:TQ.state,...TQ.audioHealth(),gameState:TQ.state})))));
  if(i%15===0)console.log('Concurrent active sample',i,JSON.stringify(samples.at(-1).map(a=>({gameState:a.gameState,nodes:a.voices.nodes,playback:a.playback}))));
 }
 check(samples.every(row=>row.every(a=>a.gameState==='play'&&a.state==='running'&&a.schedulerErrors===0&&a.voices.nodes<1000)),'two active floors with continuous sprayer fire keep audio running and bounded');
 check(samples.at(-1).every(a=>!a.playback||a.playback.underrunDuration/a.playback.totalDuration<.01),'active Office and boss output underruns below one percent');
 await pages[1].close();const page=pages[0];
 const alignment=await page.evaluate(()=>{
  TQ.input.fireKeyHeld=false;TQ.setState('pause');const g=TQ.game,vm=g.viewmodels.sprayer,rows=[];
  for(const fov of [70,100])for(const aim of [0,1]){
   g.camera.fov=fov;g.camera.updateProjectionMatrix();g.aim=aim;
   g.updateCameraAndViewmodel(.016,0);vm.updateMatrix();g.vmRoot.updateMatrix();
   const local=vm.userData.muzzle.clone().applyMatrix4(vm.matrix).applyMatrix4(g.vmRoot.matrix);
   const expected=local.clone().applyMatrix4(g.viewCamera.projectionMatrix);
   const world=g.muzzleWorld(vm),actual=world.clone().project(g.camera);
   g.flash.fire('sprayer',vm,new TQ.THREE.Color(0xff8800));
   const flash=g.flash.active.position.clone().applyMatrix4(g.vmRoot.matrix);
   g.spawnProjectile({x:TQ.player.x,y:TQ.player.y,z:.5,vx:1,vy:0,color:new TQ.THREE.Color(0xff8800),visualOrigin:world,kind:'paint'});
   const pr=g.projectiles.at(-1);
   rows.push({fov,aim,projectionError:Math.hypot(expected.x-actual.x,expected.y-actual.y),flashError:flash.distanceTo(local),projectileError:pr.mesh.position.distanceTo(world),physicsUnchanged:pr.x===TQ.player.x&&pr.y===TQ.player.y});
  }return rows;
 });
 console.log("Alignment",JSON.stringify(alignment));
 check(alignment.every(r=>r.projectionError<1e-6&&r.flashError<1e-6&&r.projectileError<1e-6&&r.physicsUnchanged),'sprayer flash and paint start at the projected nozzle in hip/aim and both FOVs, preserving collision origin');
 writeFileSync(`${out}/sprayer-alignment.json`,JSON.stringify(alignment,null,2));
 await page.evaluate(()=>{TQ.setState('menu');});
 await page.locator('#menu-items').getByText('New Game',{exact:true}).click();
 await page.locator('#intro-screen').click();await page.waitForFunction(()=>TQ.state==='loading');await page.keyboard.press('Enter');await page.waitForFunction(()=>TQ.state==='play');
 await page.evaluate(()=>{TQ.player.score=1234;TQ.player.alive=false;TQ.game.cb.onDeath();});
 await page.waitForFunction(()=>TQ.state==='gameover');
 check(await page.locator('#gameover-score-slot #victory-score-form').isVisible(),'defeated New Game offers campaign submission');
 await page.locator('#victory-name').fill('QA RUN');await page.locator('#btn-submit-score').click();
 await page.waitForFunction(()=>document.querySelector('#victory-submit-status').textContent.includes('RECORDED'));
 await page.screenshot({path:`${out}/gameover-score.png`});
 await page.locator('#btn-retry').click();await page.waitForFunction(()=>TQ.state==='loading');await page.keyboard.press('Enter');await page.waitForFunction(()=>TQ.state==='play');
 await page.evaluate(()=>{TQ.player.alive=false;TQ.game.cb.onDeath();});await page.waitForFunction(()=>TQ.state==='gameover');
 check(!await page.locator('#victory-score-form').isVisible(),'retry after defeat is practice');
 await page.locator('#btn-quit-menu').click();await page.locator('#menu-items').getByText('Scoreboard',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#scoreboard-status').textContent.includes('EVERY MINUTE'));
 check((await page.locator('#scoreboard-list').textContent()).includes('FLOOR 1'),'scoreboard shows partial campaign progress');
 await page.screenshot({path:`${out}/scoreboard.png`});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${out}/scoreboard-mobile.png`});
 check(await page.locator('.lb-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth;}),'scoreboard fits a narrow viewport');
 await page.locator('#btn-scoreboard-back').click();await page.locator('#menu-items').getByText('Floor Select',{exact:true}).click();
 await page.screenshot({path:`${out}/floor-select-mobile.png`});
 check(await page.locator('#menu-levels .mm-floors').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'floor select fits a narrow viewport');
 check(errors.length===0,'no runtime exceptions');
}finally{writeFileSync(`${out}/gameplay.json`,JSON.stringify({checks,samples,errors},null,2));await browser.close();}
