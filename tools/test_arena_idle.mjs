import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {performance} from 'node:perf_hooks';
const {server,room,tick}=await import('../server/arena-server.mjs');
let socket;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(test){const end=Date.now()+3000;while(!test()){if(Date.now()>end)throw Error('Idle fixture timed out');await sleep(10);}}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const metrics=async()=> (await fetch(base+'/health').then(r=>r.json())).metrics;
 const before=await metrics();for(let i=0;i<60;i++)tick();
 const idle=await metrics();assert.equal(idle.snapshots,before.snapshots,'An empty room should not serialize snapshots');assert.equal(idle.snapshotBytes,before.snapshotBytes);
 socket=new WebSocket(base.replace('http','ws')+'/arena/ws');let snapshots=0;
 socket.on('message',raw=>{if(JSON.parse(raw).type==='snapshot')snapshots++;});
 await new Promise(r=>socket.once('open',r));socket.send(JSON.stringify({v:1,type:'hello',name:'Idle fixture'}));
 await wait(()=>snapshots>0);assert.equal(room.players.size,1,'Joining resumes snapshot delivery');
 const peer=room.players.get(0).socket,originalSend=peer.send;
 peer.send=function(...args){const until=performance.now()+5;while(performance.now()<until){}return originalSend.apply(this,args);};
 room.tickSamples.length=0;for(let i=0;i<60;i++)tick();
 assert((await metrics()).tickMsP95>=5,'Tick timing includes the controlled socket enqueue cost');
 peer.send=originalSend;
 socket.terminate();await wait(()=>![...room.players.values()].some(p=>p.socket));
 const disconnected=await metrics();for(let i=0;i<60;i++)tick();
 assert.equal((await metrics()).snapshots,disconnected.snapshots,'Reserved disconnect slots have no snapshot recipient');
 assert.equal(room.players.size,1,'Disconnect reservation is preserved');
 console.log('Arena idle: PASS (empty and disconnected rooms skip snapshots; joining receives state; timing includes socket enqueue)');
}finally{socket?.terminate();server.close();setTimeout(()=>process.exit(),100);}
