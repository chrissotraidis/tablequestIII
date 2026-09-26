// Controlled server fixtures verify authoritative interactions over real sockets.
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
process.env.TQ_ARENA_COUNTDOWN_MS='1';
const {server,room,snapshot}=await import('../server/arena-server.mjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error(label);await sleep(25);}};
const clients=[],events=[];let seq=0;
const send=(i,m)=>clients[i].send(JSON.stringify({v:1,...m}));
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(let i=0;i<2;i++) {const w=new WebSocket(`ws://127.0.0.1:${server.address().port}/arena/ws`);clients.push(w);w.on('message',raw=>events.push(JSON.parse(raw)));await new Promise(r=>w.once('open',r));send(i,{type:'hello',protocol:1,name:`Fixture ${i}`});}
 await wait(()=>room.players.size===2,'join');
 for(let i=0;i<2;i++)send(i,{type:'ready',ready:true});
 await wait(()=>room.state==='active','start');
 const p=room.players.get(0),target=room.players.get(1),door=()=>snapshot().doors.find(d=>d.id==='16,9');
 p.x=15.2;p.z=9.5;target.x=20.5;target.z=5.5;
 send(0,{type:'interact'});await wait(()=>door().openT===1,'open door');
 await sleep(500);send(0,{type:'interact'});await wait(()=>door().openT===0,'close door');
 await sleep(500);send(0,{type:'interact'});await wait(()=>door().openT===1,'reopen door');
 target.x=16.5;target.z=9.5;await sleep(500);send(0,{type:'interact'});await sleep(550);
 assert(door().open && door().openT===1,'Closing must not trap an occupant');
 const fire=weapon=>send(0,{type:'input',matchId:room.matchId,seq:++seq,weapon,yaw:0,pitch:0,fire:true});
 const stop=weapon=>send(0,{type:'input',matchId:room.matchId,seq:++seq,weapon,yaw:0,pitch:0,fire:false});
 for(const weapon of ['paintbrush','tableLeg','sprayer','nailgun','roller']) {
  p.x=19.5;p.z=5.5;p.paint=99;p.weapons.add(weapon);p.cooldownAt=0;
  target.x=20.7;target.z=5.5;target.health=100;target.protectedUntil=0;
  fire(weapon);if(weapon==='paintbrush')stop(weapon);await wait(()=>target.health<100,`${weapon} must damage a visible target`);stop(weapon);await sleep(300);
 }
 p.cooldownAt=0;target.health=1;target.protectedUntil=0;fire('paintbrush');
 await wait(()=>!target.alive,'death');stop('paintbrush');
 await wait(()=>target.alive,'respawn');
 assert.deepEqual([...target.weapons],['paintbrush','tableLeg']);
 assert(target.protectedUntil>Date.now(),'Respawn must grant actual protection');
 target.x=20.7;target.z=5.5;p.cooldownAt=0;fire('paintbrush');await sleep(500);stop('paintbrush');
 assert.equal(target.health,100,'Protected respawn must ignore incoming damage');
 assert(events.some(e=>e.kind==='impact'),'Shots must publish visual impacts');
 assert(events.some(e=>e.kind==='explosion'),'Roller must publish an explosion');
 console.log('Arena interactions: PASS (open/close/occupied doors, all five weapons including a sub-tick click, impact/explosion events, death, starter loadout and damage-proof respawn protection)');
} catch(error) {console.error(error);process.exitCode=1;} finally {for(const w of clients)w.terminate();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
