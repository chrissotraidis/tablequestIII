import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findPaintSurface} from '../arena/paint-surface.js';
import {ClientMovement} from '../shared/arena/client-movement.js';
import {moveCircle} from '../shared/arena/movement.js';
const wall=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());
wall.position.set(2.5,1,2.5);wall.updateMatrixWorld(true);
const face=findPaintSurface([wall],new THREE.Vector3(1.98,.7,2.5),new THREE.Vector3(-1,0,0));
assert(face);assert.equal(face.position.x,2,'Paint anchors to the rendered face');
assert.equal(findPaintSurface([],new THREE.Vector3(1.98,.7,2.5),new THREE.Vector3(-1,0,0)),null,'No rendered surface means no hovering decal');
const edge=findPaintSurface([wall],new THREE.Vector3(1.98,.7,2.02),new THREE.Vector3(-1,0,0));
assert(!edge || edge.size<.05,'A decal may not extend into a doorway');
assert.equal(findPaintSurface([wall],new THREE.Vector3(1.7,.7,2.5),new THREE.Vector3(0,0,0)),null,'Body impacts are particles, never free-floating planes');

const map={width:20,height:6,map:['####################',...Array(4).fill('#..................#'),'####################'],blockingCells:[],props:{}};
const prediction=new ClientMovement();let server={x:2.5,z:2.5,lastSeq:-1};prediction.reset(server);
const inputs=[],snapshots=[];let seq=0,held={moveX:0,moveY:0,yaw:0,pitch:0},predictedAt=null,receivedAt=null;
// 60 Hz presentation, 30 Hz authoritative simulation, 15 Hz snapshots,
// and four frames each way: approximately 133 ms round-trip delay.
for(let frame=0;frame<180;frame++){
 const input={moveX:0,moveY:frame>=6&&frame<66 ? 1:0,yaw:0,pitch:0};
 if(frame%2===0)inputs.push({at:frame+4,input:{...input},seq:++seq});
 prediction.step(map,input,1/60,seq+1);
 const view=prediction.view(1/60);if(predictedAt===null && view.x>2.51)predictedAt=frame;
 for(const packet of inputs.filter(p=>p.at===frame)){held=packet.input;server.lastSeq=packet.seq;}
 if(frame%2===0)moveCircle(map,server,held,1/30);
 if(frame%4===0)snapshots.push({at:frame+4,player:{...server}});
 for(const packet of snapshots.filter(p=>p.at===frame)){
  if(receivedAt===null && packet.player.x>2.51)receivedAt=frame;
  prediction.reconcile(map,packet.player);
 }
}
assert.equal(predictedAt,6,'Movement must respond on the first input frame');
assert(receivedAt>predictedAt,'The fixture must actually delay authority');
assert(Math.abs(prediction.view(1/60).x-server.x)<.01,'Prediction must converge to authority after stopping');
for(let i=0;i<500;i++)prediction.step(map,{moveX:0,moveY:1,yaw:0,pitch:0},1/60,++seq);
assert(prediction.state.x<=18.74,'Predicted movement must respect walls');
console.log(`Arena presentation: PASS (anchored paint, clipped edges, no surface/no decal; first-frame movement vs ${(receivedAt-predictedAt)*1000/60|0} ms snapshot-only delay; authoritative convergence and walls)`);
