import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findPaintSurface} from '../arena/paint-surface.js';
import {ClientMovement,INPUT_STEP,takeTickInputs} from '../shared/arena/client-movement.js';
import {ServerClock,pushSample,sampleAt,MAX_DELAY_MS} from '../arena/interpolation.js';
import {moveCircle} from '../shared/arena/movement.js';
const wall=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());
wall.position.set(2.5,1,2.5);wall.updateMatrixWorld(true);
const face=findPaintSurface([wall],new THREE.Vector3(1.98,.7,2.5),new THREE.Vector3(-1,0,0));
assert(face);assert.equal(face.position.x,2,'Paint anchors to the rendered face');
assert.equal(findPaintSurface([],new THREE.Vector3(1.98,.7,2.5),new THREE.Vector3(-1,0,0)),null,'No rendered surface means no hovering decal');
const edge=findPaintSurface([wall],new THREE.Vector3(1.98,.7,2.02),new THREE.Vector3(-1,0,0));
assert(!edge || edge.size<.05,'A decal may not extend into a doorway');
assert.equal(findPaintSurface([wall],new THREE.Vector3(1.7,.7,2.5),new THREE.Vector3(0,0,0)),null,'Body impacts are particles, never free-floating planes');


// Fixed-step prediction against the real server input path. Inputs leave at
// 30 Hz, cross an in-order jittery link (40-100 ms each way), the server
// consumes them with takeTickInputs at 30 Hz and returns 15 Hz snapshots.
const map={width:20,height:6,map:['####################',...Array(4).fill('#..................#'),'####################'],blockingCells:[],props:{}};
let rngState=7;const rand=()=>((rngState=(rngState*1103515245+12345)%2147483648)/2147483648);
const prediction=new ClientMovement();const server={x:2.5,z:2.5,lastSeq:-1,vx:0,vz:0,yaw:0,pitch:0};prediction.reset(server);
const queue=[],toServer=[],toClient=[];let seq=0,upLast=0,downLast=0,predictedAt=null,receivedAt=null,maxCorrection=0;
const link=(lane,last,at,payload)=>{const when=Math.max(last,at+40+rand()*60);lane.push({when,payload});return when;};
for(let ms=0;ms<6000;ms+=1000/60){
 const now=Math.round(ms);
 const moveY=ms>=100&&ms<2000 ? 1 : ms>=2500&&ms<4000 ? -1 : 0, moveX=ms>=3000&&ms<4500 ? 1 : 0;
 if(Math.round(ms/(1000/60))%2===0){
  const input={moveX,moveY,yaw:.4,pitch:0,tap:false,seq:++seq};
  upLast=link(toServer,upLast,now,input);prediction.step(map,input,seq,now);
  if(predictedAt===null && prediction.state.x>2.51)predictedAt=now;
 }
 for(const m of toServer.filter(m=>m.when<=now))queue.push(m.payload);
 toServer.splice(0,toServer.filter(m=>m.when<=now).length);
 if(Math.round(ms/(1000/60))%2===1){
  for(const input of takeTickInputs(queue)){server.lastSeq=input.seq;if(!input.tap)moveCircle(map,server,input,INPUT_STEP);}
  if(Math.round(ms/(1000/60))%4===1)downLast=link(toClient,downLast,now,{...server});
 }
 const arrived=toClient.filter(m=>m.when<=now);toClient.splice(0,arrived.length);
 for(const m of arrived){if(receivedAt===null && m.payload.x>2.51)receivedAt=now;prediction.reconcile(map,m.payload);maxCorrection=Math.max(maxCorrection,prediction.correction);}
}
assert(receivedAt-predictedAt>=80,'The fixture must actually delay authority');
assert(maxCorrection<.005,`Deterministic prediction must not rubber-band under jitter (max correction ${maxCorrection.toFixed(4)} m)`);
const settled=prediction.view(1/60,1);
assert(Math.hypot(settled.x-server.x,settled.z-server.z)<.01,'Prediction must converge to authority after stopping');
// A burst backlog drains at two steps per tick, and taps never move.
const burst=Array.from({length:8},(_,i)=>({seq:i,tap:i%4===0}));const drained=[];while(burst.length)drained.push(takeTickInputs(burst).filter(i=>!i.tap).length);
assert.deepEqual(drained,[2,2,1,1],'Backlogs catch up without letting taps spend movement steps');
for(let i=0;i<500;i++)prediction.step(map,{moveX:0,moveY:1,yaw:0,pitch:0},++seq);
assert(prediction.state.x<=18.74,'Predicted movement must respect walls');
// A remote player walking at 3.7 m/s, 15 Hz snapshots arriving 40-100 ms late
// in bunches, drawn at 60 Hz: every rendered frame must advance steadily.
{
 const clock=new ServerClock(),samples=[],arrivals=[];let arriveLast=0;
 for(let t=0;t<3000;t+=1000/15){const at=Math.max(arriveLast,t+40+rand()*60);arriveLast=at;arrivals.push({at,s:{t,x:3.7*t/1000,z:0,yaw:0}});}
 let last=null,worst=0;
 for(let now=500;now<2900;now+=1000/60){
  for(const a of arrivals.filter(a=>a.at<=now && !a.used)){a.used=true;clock.sample(a.s.t,now);pushSample(samples,a.s);}
  const x=sampleAt(samples,clock.renderTime(now)).x;
  if(last!==null && now>1500)worst=Math.max(worst,Math.abs((x-last)-3.7/60));
  last=x;
 }
 // One frame of walking is 6.2 cm; the old snap-to-latest path froze and
 // jumped by 12-18 cm here.
 assert(worst<.02,`Remote staff must move evenly between jittered snapshots (worst frame error ${worst.toFixed(4)} m)`);
 assert(clock.delay()<MAX_DELAY_MS,'Interpolation delay stays bounded');
}
console.log(`Arena presentation: PASS (anchored paint, clipped edges, no surface/no decal; fixed-step prediction under 40-100 ms jitter, max correction ${(maxCorrection*1000).toFixed(2)} mm vs ${receivedAt-predictedAt} ms authority delay; backlog/tap budget; walls)`);
