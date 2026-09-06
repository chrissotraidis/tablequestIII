/** GPU pacing from the first playable frame, plus real destructible props. */
import { launchBrowser } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const url=process.argv[2]||'http://127.0.0.1:4176/';
const out=process.argv[3]||'/tmp/tablequest-sanity';mkdirSync(out,{recursive:true});
const b=await launchBrowser();const p=await b.newPage({viewport:{width:2654,height:1738}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(url);await p.waitForFunction(()=>!!window.TQ);await p.evaluate(()=>TQ.skipBoot());
const rows=[];
for(const floor of [0,1,2,3,4,5]){
 const row=await p.evaluate(async floor=>{
  const began=performance.now();await TQ.startGameAt(floor);TQ.godmode(true);
  const readyMs=performance.now()-began;
  const samples=await new Promise(resolve=>{let last=performance.now();const times=[];const frame=t=>{times.push(Math.max(0,t-last));last=t;if(times.length<180)requestAnimationFrame(frame);else resolve(times)};requestAnimationFrame(frame)});
  const sorted=[...samples].sort((a,b)=>a-b);const percentile=q=>+sorted[Math.floor(sorted.length*q)].toFixed(1);
  const gl=TQ.renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {floor:floor+1,readyMs:+readyMs.toFixed(1),avgMs:+(samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(1),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:+Math.max(...samples).toFixed(1),longFrames:samples.filter(t=>t>50).length,drawCalls:TQ.renderer.info.render.calls,pixelRatio:TQ.renderer.getPixelRatio(),audioUnderruns:TQ.audioDebug().schedulerUnderruns,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 },floor);rows.push(row);console.log(JSON.stringify(row));
}
const destruction=await p.evaluate(async()=>{
 await TQ.startGameAt(1);TQ.godmode(true);TQ.setState('pause');const w=TQ.game.world;const rows=[];
 for(const rec of [...w.props.values()].slice(0,12)){
  const region=rec.mesh.userData.propRegion;const untouched=[...w.propBatches].filter(([r])=>r!==region);
  const start=performance.now();w.damageProp(rec.x,rec.y,9999);w.rebuildPropBatch();
  rows.push({ms:+(performance.now()-start).toFixed(2),collisionCleared:!w.propCells.has(w.key(rec.x,rec.y)),unaffectedBatchesRetained:untouched.every(([r,b])=>w.propBatches.get(r)===b)});
  await TQ.settle(2);
 }
 return rows;
});
await p.screenshot({path:`${out}/destruction.png`});
const report={rows,destruction,errors};writeFileSync(`${out}/performance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({destruction,errors}));await b.close();
if(errors.length||destruction.some(r=>!r.collisionCleared||!r.unaffectedBatchesRetained))process.exitCode=1;
