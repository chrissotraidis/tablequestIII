// Local-only, disposable scene for reviewing hit/death/elimination feedback.
import {WebSocket} from 'ws';
process.env.TQ_ARENA_COUNTDOWN_MS='3000';
const {server,room}=await import('../server/arena-server.mjs');
await new Promise(r=>server.listen(4201,'127.0.0.1',r));
const socket=new WebSocket('ws://127.0.0.1:4201/arena/ws');
const send=data=>socket.send(JSON.stringify({v:1,...data}));
await new Promise(r=>socket.once('open',r));
send({type:'hello',protocol:1,name:'Feedback partner'});
let slot,phase='waiting',seq=0;
const weaponReview=process.env.TQ_REVIEW_WEAPONS==='1';
socket.on('message',raw=>{const data=JSON.parse(raw);if(data.type==='welcome'){slot=data.slot;send({type:'ready',ready:true});}});
setInterval(()=>{
 if(room.state!=='active')return;
 const partner=room.players.get(slot),player=[...room.players.values()].find(p=>p.slot!==slot);if(!partner||!player)return;
 if(weaponReview){
  if(phase==='waiting'){player.x=19.5;player.z=5.5;player.yaw=0;player.weapons=new Set(['paintbrush','tableLeg','sprayer','nailgun','roller']);player.paint=99;player.protectedUntil=Infinity;partner.x=25.5;partner.z=5.5;partner.protectedUntil=Infinity;phase='weapon-review';console.log('All five tools ready for manual firing review');}
  return;
 }
 if(phase==='waiting'){
  partner.x=20.7;partner.z=5.5;partner.yaw=Math.PI;partner.protectedUntil=0;
  player.x=19.5;player.z=5.5;player.yaw=0;player.health=48;player.protectedUntil=0;phase='incoming';
 }
 if(phase==='incoming'){
  send({type:'input',matchId:room.matchId,seq:++seq,yaw:Math.PI,weapon:'paintbrush',fire:player.alive});
  if(!player.alive){phase='respawning';console.log('Death ready');}
 }else if(phase==='respawning'&&player.alive){
  player.x=19.5;player.z=5.5;player.yaw=0;player.protectedUntil=0;
  partner.x=20.7;partner.z=5.5;partner.health=16;partner.protectedUntil=0;phase='return-fire';console.log('Fire once to verify elimination');
 }
},100);
console.log('Combat review at http://127.0.0.1:4201/arena/?test; join and ready.');
