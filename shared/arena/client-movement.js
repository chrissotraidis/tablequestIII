import {moveCircle} from './movement.js';
import {insideMap} from './movement.js';
import {ARENA_CONFIG} from './rules.js';

// Every movement input advances exactly one fixed step on both sides.
export const INPUT_STEP = 1 / ARENA_CONFIG.tickRate;
export const MAX_QUEUED_INPUTS = 10;

// Server side: movement inputs to apply this tick. Taps (click fire sent
// between regular inputs) aim and fire without moving and cost no budget.
// A backlog from a network burst drains at two steps per tick.
export function takeTickInputs(queue) {
    const taken = [];
    let budget = queue.length > 2 ? 2 : 1;
    while (queue.length && budget > 0) {
        const input = queue.shift();
        taken.push(input);
        if (!input.tap) budget--;
    }
    return taken;
}

// Same push the server applies in separatePlayers (half the overlap each), so
// walking into another staff member is predicted instead of corrected.
export function separateFrom(map,state,others){
    const min=ARENA_CONFIG.playerRadius*2.15;
    for(const o of others){
        const dx=o.x-state.x,dz=o.z-state.z,d=Math.hypot(dx,dz);
        if(!d||d>=min)continue;
        const push=(min-d)/d*.5,x=state.x-dx*push,z=state.z-dz*push;
        if(insideMap(map,x,z)){state.x=x;state.z=z;}
    }
}

// Client presentation only. Server snapshots remain authoritative for position,
// damage, pickups and doors; replay only inputs newer than their ack.
export class ClientMovement {
    constructor(){this.state=null;this.prev=null;this.pending=[];this.offset={x:0,z:0};this.correction=0;this.stepAt=0;this.others=[];}
    reset(player){this.state={...player};this.prev={x:player.x,z:player.z};this.pending=[];this.offset={x:0,z:0};this.correction=0;}
    step(map,input,seq,now=performance.now()){
        if(!this.state)return;
        this.prev={x:this.state.x,z:this.state.z};
        this.pending.push({input:{...input},seq});
        if(this.pending.length>240)this.pending.shift();
        moveCircle(map,this.state,input,INPUT_STEP);
        separateFrom(map,this.state,this.others);
        this.stepAt=now;
    }
    reconcile(map,player,reset=false){
        if(!this.state||reset){this.reset(player);return;}
        const old={x:this.state.x,z:this.state.z};
        this.pending=this.pending.filter(frame=>frame.seq>player.lastSeq);
        this.state={...player};
        for(const frame of this.pending){moveCircle(map,this.state,frame.input,INPUT_STEP);separateFrom(map,this.state,this.others);}
        const dx=old.x-this.state.x,dz=old.z-this.state.z;
        this.correction=Math.hypot(dx,dz);
        // Keep the displayed position continuous; large errors snap.
        if(this.correction<.8){this.offset.x+=dx;this.offset.z+=dz;this.prev.x-=dx;this.prev.z-=dz;}
        else {this.offset={x:0,z:0};this.prev={x:this.state.x,z:this.state.z};}
    }
    // alpha: how far the render frame is into the next fixed step (0..1).
    view(dt,alpha=1){
        if(!this.state)return null;
        const decay=Math.exp(-12*dt);this.offset.x*=decay;this.offset.z*=decay;
        const t=Math.max(0,Math.min(1,alpha));
        return {x:this.prev.x+(this.state.x-this.prev.x)*t+this.offset.x,z:this.prev.z+(this.state.z-this.prev.z)*t+this.offset.z};
    }
}
