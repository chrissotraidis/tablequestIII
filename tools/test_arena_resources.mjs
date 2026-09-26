import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./arena_manifest_loader.mjs',import.meta.url);
const {buildArenaBody,attachArenaWeapon,disposeArenaBody,setArenaToolPaint}=await import('../src/arena/arena-models.js');
const {Scene}=await import('three');
const scene=new Scene(),other=buildArenaBody({variant:1});scene.add(other.group);
const brush=attachArenaWeapon(other,'paintbrush');setArenaToolPaint(brush,0xb52d3c);let checkedPaint=false;brush.traverse(o=>{if(o.userData.bristles){assert.equal(o.userData.bristles.material.color.getHex(),0xb52d3c);checkedPaint=true;}});assert(checkedPaint,'Held world brush reflects selected paint');
for(let round=0;round<8;round++){
 const body=buildArenaBody({variant:round%3});attachArenaWeapon(body,['paintbrush','tableLeg','sprayer','nailgun','roller'][round%5]);scene.add(body.group);
 const resources=new Set();body.group.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))resources.add(m);});
 const disposed=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
 disposeArenaBody(body);
 assert.equal(body.group.parent,null);assert.equal(disposed.size,resources.size,'Every owned GPU resource must be released');assert([...disposed.values()].every(n=>n===1),'Shared materials within a body must be disposed exactly once');assert.equal(other.group.parent,scene,'Other staff stays attached');
}
// Preview changes reuse each staff body while replacing only its held tool.
for(let variant=0;variant<3;variant++){
 const body=buildArenaBody({variant});
 const core=new Set();body.group.traverse(o=>{if(o.geometry)core.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))core.add(m);});
 let coreDisposals=0;for(const resource of core)resource.addEventListener('dispose',()=>coreDisposals++);
 let previous=attachArenaWeapon(body,'paintbrush');
 for(let index=0;index<50;index++){
  const resources=new Set();previous.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))resources.add(m);});
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  const key=['tableLeg','sprayer','nailgun','roller','paintbrush'][index%5];
  const next=attachArenaWeapon(body,key);
  assert.equal(previous.parent,null,'Old preview attachment is removed');
  assert.equal(counts.size,resources.size,'Every replaced attachment resource is released');
  assert([...counts.values()].every(n=>n===1),'Replacement disposes each resource exactly once');
  assert.equal(attachArenaWeapon(body,key),next,'Unchanged preview does not allocate another attachment');
  assert.equal(coreDisposals,0,'Changing tools preserves staff resources');
  previous=next;
 }
 disposeArenaBody(body);assert.equal(coreDisposals,core.size,'Final preview disposal releases its staff resources');
}
console.log('Arena preview resources: PASS (150 tool replacements across three staff, unchanged attachment reuse, staff preserved)');
disposeArenaBody(other);console.log('Arena resources: PASS (eight staff lifecycles, all owned geometry/materials released exactly once, independent staff preserved)');
