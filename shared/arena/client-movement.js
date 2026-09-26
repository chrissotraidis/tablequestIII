import {moveCircle} from './movement.js';
// Client presentation only. Server snapshots remain authoritative for position,
// damage, pickups and doors; replay only input frames newer than their ack.
export class ClientMovement {
    constructor(){this.state=null;this.pending=[];this.offset={x:0,z:0};this.correction=0;}
    reset(player){this.state={...player};this.pending=[];this.offset={x:0,z:0};}
    step(map,input,dt,seq){
        if(!this.state)return;
        const frame={input:{...input},dt:Math.min(dt,.05),seq};
        this.pending.push(frame);if(this.pending.length>240)this.pending.shift();
        moveCircle(map,this.state,frame.input,frame.dt);
    }
    reconcile(map,player,reset=false){
        if(!this.state||reset){this.reset(player);return;}
        const before={x:this.state.x+this.offset.x,z:this.state.z+this.offset.z};
        this.pending=this.pending.filter(frame=>frame.seq>player.lastSeq);
        this.state={...player};
        for(const frame of this.pending)moveCircle(map,this.state,frame.input,frame.dt);
        this.correction=Math.hypot(before.x-this.state.x,before.z-this.state.z);
        this.offset=this.correction<.8 ? {x:before.x-this.state.x,z:before.z-this.state.z} : {x:0,z:0};
    }
    view(dt){
        const decay=Math.exp(-18*dt);this.offset.x*=decay;this.offset.z*=decay;
        return this.state && {x:this.state.x+this.offset.x,z:this.state.z+this.offset.z};
    }
}
