import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
process.env.TQ_ARENA_COUNTDOWN_MS='1500';
process.env.TQ_ARENA_HEARTBEAT_MS='150';
const {server,room}=await import('../server/arena-server.mjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(test,label,timeout=5000){const end=Date.now()+timeout;while(!test()){if(Date.now()>end)throw Error(label);await sleep(20);}}
const clients=[];
async function join(name,options={}){
 const socket=new WebSocket(`ws://127.0.0.1:${server.address().port}/arena/ws`,options);clients.push(socket);
 await new Promise(r=>socket.once('open',r));
 const welcome=new Promise(r=>socket.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')r(m);}));
 socket.send(JSON.stringify({v:1,type:'hello',protocol:1,name}));
 return {socket,welcome:await welcome};
}
const send=(client,message)=>client.socket.send(JSON.stringify({v:1,...message}));
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 // A half-open socket (no pongs, no close) must not hold its slot as connected.
 const healthy=await join('Healthy'),silent=await join('Silent',{autoPong:false});
 assert.notEqual(room.players.get(healthy.welcome.slot).color,room.players.get(silent.welcome.slot).color,'Default paint colors are made distinct');
 const twin=await join('Healthy');assert.equal(room.players.get(twin.welcome.slot).name,'Healthy 2','Duplicate names are numbered');
 send(twin,{type:'leave'});await wait(()=>!room.players.has(twin.welcome.slot),'twin leaves');
 await wait(()=>!room.players.get(silent.welcome.slot)?.socket,'silent socket released',2000);
 assert(room.players.get(healthy.welcome.slot).socket,'Answering clients stay connected');
 assert(room.players.get(silent.welcome.slot).reservedUntil>Date.now(),'A dropped player keeps a reconnect reservation');
 // One blip during a countdown does not cancel it for the remaining staff.
 const third=await join('Third');
 for(const c of [healthy,third])send(c,{type:'ready',ready:true});
 await wait(()=>room.state==='countdown','countdown');
 const fourth=await join('Fourth');send(fourth,{type:'ready',ready:true});await sleep(50);
 assert.equal(room.state,'countdown');
 fourth.socket.terminate();await sleep(150);
 assert.equal(room.state,'countdown','A single disconnect keeps the countdown');
 await wait(()=>room.state==='active','match starts after the blip',3000);
 // Input sequence restarts after a page reload are accepted.
 const player=room.players.get(healthy.welcome.slot);
 send(healthy,{type:'input',matchId:room.matchId,seq:1,moveY:1,yaw:0});
 await wait(()=>player.lastSeq===1,'fresh input accepted');
 console.log('Arena connection: PASS (heartbeat releases half-open sockets, answering clients stay, countdown survives one disconnect, fixed-step inputs consumed)');
}catch(error){console.error(error);process.exitCode=1;}finally{for(const client of clients)client.terminate();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
