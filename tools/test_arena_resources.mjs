import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./arena_manifest_loader.mjs',import.meta.url);
// The detailed tool models paint canvas textures; Node has no canvas, so give
// them a no-op 2D context. Geometry, materials and ownership are real.
const noop=new Proxy(function(){},{get:(t,k)=>k==='canvas'?{width:1,height:1}:noop,apply:()=>noop,set:()=>true});
globalThis.document??={createElement:()=>({width:1,height:1,style:{},getContext:()=>noop,addEventListener(){}})};
const {buildArenaBody,attachArenaWeapon,disposeArenaBody,setArenaToolPaint,buildArenaTool,disposeArenaVisual}=await import('../src/arena/arena-models.js');
const {Scene,Color}=await import('three');
const shared=r=>r.userData?.shared;
const collect=(root)=>{const all=new Set();root.traverse(o=>{if(o.geometry)all.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))all.add(m);});return all;};
const scene=new Scene(),other=buildArenaBody({variant:1});scene.add(other.group);
// Each staff member's held tool carries their own paint without changing anyone else's.
const red=attachArenaWeapon(other,'paintbrush');setArenaToolPaint(red,0xb52d3c);
const blueBody=buildArenaBody({variant:0}),blue=attachArenaWeapon(blueBody,'paintbrush');setArenaToolPaint(blue,0x315bd6);
const paintOf=(tool)=>{let found=null;tool.traverse(o=>{const c=o.geometry?.attributes.color;if(!c||found)return;for(let i=0;i<c.count;i++){const col=new Color(c.getX(i),c.getY(i),c.getZ(i));if(Math.abs(col.r-new Color(0xb52d3c).r)<.002&&Math.abs(col.g-new Color(0xb52d3c).g)<.002){found='red';return;}if(Math.abs(col.r-new Color(0x315bd6).r)<.002&&Math.abs(col.b-new Color(0x315bd6).b)<.002){found='blue';return;}}});return found;};
assert.equal(paintOf(red),'red','Held brush shows its owner paint');assert.equal(paintOf(blue),'blue','Another staff member keeps their own paint');
disposeArenaBody(blueBody);
// Detailed tools share one model per weapon; only per-staff parts are owned.
const firstSprayer=buildArenaTool('sprayer'),secondSprayer=buildArenaTool('sprayer');
const a=collect(firstSprayer),b=collect(secondSprayer);assert([...a].some(r=>b.has(r)),'Tool instances share the detailed model');
const sharedBefore=[...a].filter(r=>b.has(r));let sharedDisposed=0;for(const r of sharedBefore)r.addEventListener('dispose',()=>sharedDisposed++);
disposeArenaVisual(firstSprayer);assert.equal(sharedDisposed,0,'Disposing one tool never releases the shared model');disposeArenaVisual(secondSprayer);
for(let round=0;round<8;round++){
 const body=buildArenaBody({variant:round%3});attachArenaWeapon(body,['paintbrush','tableLeg','sprayer','nailgun','roller'][round%5]);setArenaToolPaint(body.weapon,0x2e9b68);scene.add(body.group);
 const resources=collect(body.group);
 const disposed=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
 disposeArenaBody(body);
 const owned=[...resources].filter(r=>!shared(r)&&disposed.has(r)),kept=[...resources].filter(r=>!disposed.has(r));
 assert.equal(body.group.parent,null);assert(owned.length>0,'Owned GPU resources are released');assert([...disposed.values()].every(n=>n===1),'Owned resources are disposed exactly once');
 assert(kept.every(r=>collect(buildArenaTool(['paintbrush','tableLeg','sprayer','nailgun','roller'][round%5])).has(r)||shared(r)),'Only shared tool/model resources survive disposal');
 assert.equal(other.group.parent,scene,'Other staff stays attached');
}
// Preview changes reuse each staff body while replacing only its held tool.
for(let variant=0;variant<3;variant++){
 const body=buildArenaBody({variant});
 const core=new Set([...collect(body.group)].filter(r=>!shared(r)));
 let coreDisposals=0;for(const resource of core)resource.addEventListener('dispose',()=>coreDisposals++);
 let previous=attachArenaWeapon(body,'paintbrush');
 for(let index=0;index<50;index++){
  const resources=collect(previous);
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  const key=['tableLeg','sprayer','nailgun','roller','paintbrush'][index%5];
  const next=attachArenaWeapon(body,key);
  assert.equal(previous.parent,null,'Old preview attachment is removed');
  assert([...counts.values()].every(n=>n===1),'Replacement disposes each owned resource exactly once');
  assert.equal(attachArenaWeapon(body,key),next,'Unchanged preview does not allocate another attachment');
  assert.equal(coreDisposals,0,'Changing tools preserves staff resources');
  previous=next;
 }
 disposeArenaBody(body);assert.equal(coreDisposals,core.size,'Final disposal releases the staff resources');
}
console.log('Arena preview resources: PASS (150 tool replacements across three staff, unchanged attachment reuse, staff preserved)');
disposeArenaBody(other);console.log('Arena resources: PASS (detailed held tools, per-staff paint, shared tool models never released, owned geometry/materials released exactly once)');
