import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const duration=Number(process.env.TQ_SIM_MS || 60000),port=4192;
const server=spawn(process.execPath,['server/arena-server.mjs'],{env:{...process.env,PORT:String(port),TQ_ARENA_COUNTDOWN_MS:'250',TQ_ARENA_ROUND_MS:String(duration)},stdio:['ignore','pipe','pipe']});
let log='',snapshot=null,result=null,client,seq=0;const visits=new Map(),events={},distance=new Map(),last=new Map(),activity=new Map();
server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(test,ms=5000){const until=Date.now()+ms;while(Date.now()<until){if(test())return;await sleep(50);}throw Error('Simulation timed out: '+log);}
try {
await waitFor(()=>log.includes('arena.started'));
client=new WebSocket(`ws://127.0.0.1:${port}/arena/ws`);
client.on('message',raw=>{
const m=JSON.parse(raw);if(m.type==='welcome'){client.send(JSON.stringify({v:1,type:'bots',enabled:true}));client.send(JSON.stringify({v:1,type:'ready',ready:true}));}
if(m.type==='event'){events[m.kind]=(events[m.kind]||0)+1;if(m.kind==='fire'){const a=activity.get(m.slot)||{shots:0,aliveSamples:0,emptyPaintSamples:0};a.shots++;activity.set(m.slot,a);}}
if(m.type==='result')result=m;
if(m.type==='snapshot') {snapshot=m;for(const p of m.players){const a=activity.get(p.slot)||{shots:0,aliveSamples:0,emptyPaintSamples:0};if(p.alive){a.aliveSamples++;if(p.paint===0)a.emptyPaintSamples++;}activity.set(p.slot,a);if(!visits.has(p.slot))visits.set(p.slot,new Set());visits.get(p.slot).add(`${Math.floor(p.x)},${Math.floor(p.z)}`);const prev=last.get(p.slot);if(prev&&p.alive&&prev.alive){const step=Math.hypot(p.x-prev.x,p.z-prev.z);if(step<1)distance.set(p.slot,(distance.get(p.slot)||0)+step);}last.set(p.slot,p);}}
});
await new Promise((res,rej)=>{client.once('open',res);client.once('error',rej);});
client.send(JSON.stringify({v:1,type:'hello',protocol:1,name:'Simulation observer'}));
await waitFor(()=>snapshot?.state==='active');
if(snapshot.doors.length!==4)throw Error('Door states absent from snapshots');
console.log(`Simulating one human observer + seven bots for ${duration/1000}s`);
await waitFor(()=>result,duration+10000);
const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json());
const report={durationMs:duration,events,bots:result.results.map(p=>({...p,...activity.get(p.slot),cellsVisited:visits.get(p.slot)?.size,distance:+(distance.get(p.slot)||0).toFixed(1)})),metrics:health.metrics};
const output=process.env.TQ_SIM_OUTPUT||'docs/evidence/arena-refinement/simulation.json';mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(health.metrics.protocolErrors)throw Error('Protocol errors during simulation');
if((events.death||0)<5)throw Error('Too little combat in full simulation');
if(result.results.filter(p=>p.slot!==0).some(p=>(visits.get(p.slot)?.size||0)<5))throw Error('A bot failed to explore five cells');
}finally{client?.close();server.kill('SIGTERM');}
