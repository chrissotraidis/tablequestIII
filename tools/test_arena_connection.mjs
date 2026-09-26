import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
process.env.TQ_ARENA_COUNTDOWN_MS='1500';
process.env.TQ_ARENA_HEARTBEAT_MS='150';
const {server,room,tick,snapshot}=await import('../server/arena-server.mjs');
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
 // Walking into a closed door opens it; it swings shut once nobody is near.
 const doorState=()=>snapshot().doors.find(d=>d.id==='7,19');
 assert.equal(doorState().open,false);
 player.x=6.2;player.z=19.5;player.alive=true;
 for(let s=2;s<12;s++){send(healthy,{type:'input',matchId:room.matchId,seq:s,moveY:1,yaw:0});await sleep(35);}
 await wait(()=>doorState().open,'walking into a door opens it',2000);
 player.x=2.5;player.z=3.5;send(healthy,{type:'input',matchId:room.matchId,seq:20,moveY:0,yaw:0});
 await wait(()=>!doorState().open,'open door closes after nobody is near',7000);
 const base=`http://127.0.0.1:${server.address().port}`;
 const page=await fetch(base+'/arena/',{headers:{'accept-encoding':'gzip'}});
 assert.equal(page.status,200);assert.equal(page.headers.get('content-encoding'),'gzip','Game pages are served compressed');
 assert.equal((await fetch(base+'/arena',{redirect:'manual'})).status,301,'/arena redirects to /arena/');
 // Backpressure: a lagging client skips snapshots, a hopeless one is dropped,
 // Lag compensation: a target seen 150 ms ago is hit where the shooter saw it.
 {
  const {seenPosition}=await import('../server/arena-server.mjs');
  const now=Date.now(),target={x:5,z:5,alive:true,history:[{t:now-300,x:2,z:5,alive:true},{t:now-150,x:3.5,z:5,alive:true},{t:now,x:5,z:5,alive:true}]};
  const seen=seenPosition(target,{bot:false,viewDelayMs:150},now);assert(Math.abs(seen.x-3.5)<1e-6,'Rewinds to what the shooter saw');
  assert.equal(seenPosition(target,{bot:true,viewDelayMs:150},now),target,'Bots are not rewound');
  const capped=seenPosition(target,{bot:false,viewDelayMs:5000},now);assert(capped.x>=2.9,'Rewind is bounded to 200 ms');
 }
 // and a healthy one keeps receiving.
 const fake=(buffered)=>({readyState:WebSocket.OPEN,bufferedAmount:buffered,sent:0,dropped:false,send(){this.sent++;},terminate(){this.dropped=true;this.readyState=WebSocket.CLOSED;}});
 const lagging=fake(200*1024),hopeless=fake(2*1024*1024),fine=fake(0);
 const guests=[lagging,hopeless,fine].map((socket,i)=>({slot:90+i,socket,bot:false,alive:false,name:'fake',x:2,z:2,yaw:0,pitch:0,vx:0,vz:0,health:0,paint:0,kills:0,deaths:0,weapon:'paintbrush',weapons:new Set(),lastSeq:0,inputQueue:[],respawnAt:Infinity}));
 for(const g of guests)room.players.set(g.slot,g);
 for(let i=0;i<4;i++)tick();
 for(const g of guests)room.players.delete(g.slot);
 assert.equal(lagging.sent,0,'A client more than 128 KB behind skips snapshots');assert.equal(lagging.dropped,false);
 assert.equal(hopeless.dropped,true,'A client more than 1 MB behind is disconnected');
 assert(fine.sent>=1,'Healthy clients keep receiving snapshots');
 console.log('Arena connection: PASS (heartbeat releases half-open sockets, answering clients stay, countdown survives one disconnect, fixed-step inputs consumed, distinct colors/names, gzip pages, slow-client skip/drop, walk-in doors open and close, bounded lag compensation)');
}catch(error){console.error(error);process.exitCode=1;}finally{for(const client of clients)client.terminate();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
