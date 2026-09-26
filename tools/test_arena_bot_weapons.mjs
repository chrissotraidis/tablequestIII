import assert from 'node:assert/strict';
import {chooseBotWeapon} from '../shared/arena/bot-weapons.js';
import {ARENA_WEAPONS} from '../shared/arena/rules.js';
const all=new Set(Object.keys(ARENA_WEAPONS));
assert.equal(chooseBotWeapon(all,0,1),'tableLeg');
assert.equal(chooseBotWeapon(all,0,10),'tableLeg');
assert.equal(chooseBotWeapon(all,1,18),'paintbrush','Do not select an unaffordable roller');
assert.equal(chooseBotWeapon(all,4,18),'roller');
assert.equal(chooseBotWeapon(all,1,5),'sprayer');
assert.equal(chooseBotWeapon(all,1,12),'nailgun');
for(let mask=0;mask<32;mask++)for(const paint of [0,1,3,4,30])for(const distance of [1,5,12,18]){
 const owned=new Set([...all].filter((_,i)=>mask&(1<<i))),weapon=chooseBotWeapon(owned,paint,distance);
 if(weapon){assert(owned.has(weapon));assert(paint>=ARENA_WEAPONS[weapon].ammoCost);}
}
console.log('Bot weapons: PASS (640 ownership/paint/range combinations, affordable fallback)');
