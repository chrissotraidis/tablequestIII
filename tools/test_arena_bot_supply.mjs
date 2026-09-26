import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
process.env.TQ_ARENA_COUNTDOWN_MS='1';
const {server,room}=await import('../server/arena-server.mjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(test,label,timeout=5000){const end=Date.now()+timeout;while(!test()){if(Date.now()>end)throw Error(label);await sleep(20);}}
let socket;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 socket=new WebSocket(`ws://127.0.0.1:${server.address().port}/arena/ws`);await new Promise(r=>socket.once('open',r));
 const send=data=>socket.send(JSON.stringify({v:1,...data}));send({type:'hello',name:'Supply fixture'});await wait(()=>room.players.size===1,'join');send({type:'bots',enabled:true,count:1});await wait(()=>room.players.size===2,'bot');send({type:'ready',ready:true});await wait(()=>room.state==='active','start');
 const human=room.players.get(0),bot=room.players.get(1);human.x=24.5;human.z=5.5;human.protectedUntil=Infinity;
 bot.x=19.5;bot.z=5.5;bot.paint=0;bot.health=50;
 const food=[...room.pickups.values()].find(p=>p.kind==='food');food.x=19.5;food.z=4.5;food.availableAt=0;bot.brain.targetSlot=0;bot.brain.thinkAt=Number.MAX_SAFE_INTEGER;bot.brain.goal=[3.5,3.5];bot.brain.path=[[3.5,3.5]];bot.brain.stuckTicks=0;
 await wait(()=>bot.brain.seekingPaint,'Empty bot must break from ranged engagement');
 assert.deepEqual(bot.brain.goal,[19.5,3.5],'An empty, noncritical bot prioritizes paint over a closer health pickup');
 await wait(()=>bot.paint>0,'Bot must actually collect a refill',20000);
 assert(human.health===100,'An empty bot does not invent ammunition');
 bot.x=19.5;bot.z=5.5;bot.paint=0;bot.health=20;food.availableAt=0;
 bot.brain.seekingPaint=false;bot.brain.goal=null;bot.brain.path=[];bot.brain.pathAt=0;
 await wait(()=>bot.brain.goal,'Critical bot chooses a supply');
 assert.deepEqual(bot.brain.goal,[food.x,food.z],'Critical health takes priority over empty paint');
 await wait(()=>bot.health>20,'Critical bot actually collects health',10000);
 console.log('Bot supply: PASS (paint before optional healing, critical health priority, real pickup collection)');
}catch(error){console.error(error);process.exitCode=1;}finally{socket?.terminate();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
