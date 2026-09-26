import { arenaRoute } from '../shared/arena/navigation.js';
import assert from 'node:assert/strict';
import { OFFICE_ARENA, validateOfficeManifest } from '../shared/arena/maps.js';
import { circleHits, moveCircle, segmentBlocked } from '../shared/arena/movement.js';
assert.deepEqual(validateOfficeManifest(), []);
assert.deepEqual([...OFFICE_ARENA.blockingCells].sort(), Object.keys(OFFICE_ARENA.props).sort());
const map = {width:6,height:6,map:['######','#....#','#....#','#....#','#....#','######'],blockingCells:['2,2'],props:{'2,2':{radius:.24,height:.5}}};
assert.equal(circleHits(map,2.03,2.03,.26),false,'A plant must not block its entire grid cell');
assert.equal(circleHits(map,2.5,2.5,.26),true,'The pot remains solid');
assert.equal(segmentBlocked(map,1.5,2.5,3.5,2.5),false,'Eye-level shots pass over low furniture');
assert.equal(segmentBlocked({...map,props:{'2,2':{radius:.24,height:1.2}}},1.5,2.5,3.5,2.5),true,'Tall cover blocks sight');
const closed={...map,blockingCells:[],closedDoorCells:['3,2']};
assert.equal(circleHits(closed,3.5,2.5,.26),true);
assert.equal(circleHits({...closed,closedDoorCells:[]},3.5,2.5,.26),false);
let player={x:1.5,z:1.5};for(let i=0;i<90;i++)moveCircle(map,player,{moveX:0,moveY:1,yaw:Math.PI,pitch:0},1/30);
assert(player.x>=1.25,'Walking into a wall must stop outside it');
console.log('Arena refinement geometry: PASS (156 authored props, footprints, sightlines, doors, movement bounds)');

for(const spawn of OFFICE_ARENA.spawns) for(const pickup of OFFICE_ARENA.pickups) {
 const route=arenaRoute(OFFICE_ARENA,{x:spawn[0],z:spawn[1]},[pickup.x,pickup.z]);
 assert(route.length || Math.hypot(spawn[0]-pickup.x,spawn[1]-pickup.z)<1,`No route to ${pickup.id}`);
 for(const point of route) assert(point.every(Number.isFinite) && point[0]>0 && point[0]<OFFICE_ARENA.width && point[1]>0 && point[1]<OFFICE_ARENA.height,'Waypoint must be a numeric position inside the Office');
}
console.log('Arena navigation: PASS (all 12 spawns reach every pickup; numeric, bounded waypoints)');

for (const point of [[31.5,19.5],[33.5,19.5],[15.5,9.5]]) {
 assert(!circleHits(OFFICE_ARENA,...point,.26),`Door approach must be walkable: ${point}`);
 assert(arenaRoute(OFFICE_ARENA,{x:19.5,z:22.5},point).length,`Door approach must be reachable: ${point}`);
}
