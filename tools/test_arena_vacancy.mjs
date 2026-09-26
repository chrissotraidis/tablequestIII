import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
process.env.TQ_ARENA_COUNTDOWN_MS='1';
const {server,room,snapshot}=await import('../server/arena-server.mjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(test,label,timeout=5000){const end=Date.now()+timeout;while(!test()){if(Date.now()>end)throw Error(label);await sleep(20);}}
const clients=[];
async function join(token){
 const socket=new WebSocket(`ws://127.0.0.1:${server.address().port}/arena/ws`);clients.push(socket);
 await new Promise(r=>socket.once('open',r));
 const welcome=new Promise(r=>socket.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')r(m);}));
 socket.send(JSON.stringify({v:1,type:'hello',protocol:1,name:'Vacancy tester',reconnectToken:token}));
 return {socket,welcome:await welcome};
}
const send=(client,message)=>client.socket.send(JSON.stringify({v:1,...message}));
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const first=await join();send(first,{type:'bots',enabled:true,count:3});await wait(()=>room.players.size===4,'bots');
 send(first,{type:'ready',ready:true});await wait(()=>room.state==='active','round');
 const match=room.matchId;first.socket.terminate();await wait(()=>!room.players.get(first.welcome.slot).socket,'disconnect');
 await sleep(100);assert.equal(room.state,'active');assert.equal(room.players.size,4,'Reconnect reservation preserves bots');
 const reconnected=await join(first.welcome.token);assert.equal(room.matchId,match);assert.equal(reconnected.welcome.slot,first.welcome.slot);
 const observer=await join();send(reconnected,{type:'leave'});await wait(()=>room.players.size===4,'first leave');assert.equal(room.state,'active','Another human keeps the match');
 room.chat.push({name:'test',text:'old round'});room.pickups.values().next().value.availableAt=Date.now()+10000;
 send(observer,{type:'leave'});await wait(()=>room.state==='lobby','last leave');
 assert.equal(room.players.size,0);assert.equal(room.hostSlot,null);assert.equal(room.deadline,0);assert.equal(room.chat.length,0);assert.equal(room.results.length,0);assert(room.matchId>match);assert(snapshot().pickups.every(p=>p.available));
 const next=await join();assert.equal(next.welcome.room.state,'lobby');assert.equal(next.welcome.room.bots,0);assert.equal(next.welcome.room.hostSlot,next.welcome.slot);
 next.socket.terminate();await wait(()=>!room.players.get(next.welcome.slot)?.socket,'final disconnect');assert.equal(room.players.size,1);
 await wait(()=>room.players.size===0,'expired reservation cleanup',17000);assert.equal(room.state,'lobby');
 console.log('Arena vacancy: PASS (reconnect grace, continuing human match, last-leave reset, clean next lobby, expired reservation cleanup)');
}catch(error){console.error(error);process.exitCode=1;}finally{for(const client of clients)client.terminate();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
