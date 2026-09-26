import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
process.env.TQ_ACCESS_PASSWORD='office party';
const {server}=await import('../server/arena-server.mjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const gate=await fetch(base+'/');assert.equal(gate.status,401);assert.match(await gate.text(),/name="password"/,'Visitors get the sign-in page');
 assert.equal((await fetch(base+'/api/scores')).status,401,'API needs the password');
 assert.equal((await fetch(base+'/health')).status,200,'Health check stays open for monitoring');
 const refused=await new Promise(r=>{const s=new WebSocket(base.replace('http','ws')+'/arena/ws');s.on('open',()=>r('open'));s.on('error',()=>r('refused'));s.on('unexpected-response',()=>r('refused'));});
 assert.equal(refused,'refused','Arena sockets need the password');
 const login=(password,next='/arena/')=>fetch(base+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password,next})});
 const wrong=await login('nope');assert.equal(wrong.status,401);assert.match(await wrong.text(),/not right/);
 const evil=await login('office party','//evil.example');assert.equal(evil.headers.get('location'),'/','No open redirect after sign-in');
 const ok=await login('office party');assert.equal(ok.status,303);assert.equal(ok.headers.get('location'),'/arena/');
 const cookie=ok.headers.get('set-cookie').split(';')[0];assert.match(ok.headers.get('set-cookie'),/HttpOnly/);
 assert.equal((await fetch(base+'/',{headers:{cookie}})).status,200,'Signed-in visitors get the game');
 const welcome=await new Promise((resolve,reject)=>{const s=new WebSocket(base.replace('http','ws')+'/arena/ws',{headers:{cookie}});s.on('open',()=>s.send(JSON.stringify({v:1,type:'hello',protocol:1,name:'Guest'})));s.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome'){resolve(true);s.close();}});s.on('error',reject);});
 assert(welcome,'Signed-in visitors join Arena');
 console.log('Arena access: PASS (sign-in page, API and socket refused without the password, wrong/right password, HttpOnly cookie, open health check, no open redirect)');
}catch(error){console.error(error);process.exitCode=1;}finally{server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
