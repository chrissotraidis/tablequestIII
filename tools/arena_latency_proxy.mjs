// Local-only WebSocket delay fixture. HTTP assets pass through unchanged.
import {createServer,request} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
const target=Number(process.env.TQ_TARGET_PORT||4198),port=Number(process.env.PORT||4199),delay=Number(process.env.TQ_DELAY_MS||100);
const server=createServer((req,res)=>{const upstream=request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end('Test server unavailable');});req.pipe(upstream);});
const wss=new WebSocketServer({server,path:'/arena/ws'});
wss.on('connection',client=>{
 const upstream=new WebSocket(`ws://127.0.0.1:${target}/arena/ws`),timers=new Set();
 const relay=(destination,raw)=>{const timer=setTimeout(()=>{timers.delete(timer);if(destination.readyState===WebSocket.OPEN)destination.send(raw.toString());else if(destination.readyState===WebSocket.CONNECTING)destination.once('open',()=>destination.send(raw.toString()));},delay);timers.add(timer);};
 client.on('message',raw=>relay(upstream,raw));upstream.on('message',raw=>relay(client,raw));
 const close=()=>{for(const timer of timers)clearTimeout(timer);client.terminate();upstream.terminate();};
 client.on('close',close);upstream.on('close',close);client.on('error',close);upstream.on('error',close);
});
server.listen(port,'127.0.0.1',()=>console.log(`Local latency fixture: ${delay} ms each way, http://127.0.0.1:${port} → ${target}`));
