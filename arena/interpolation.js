// Remote staff are drawn slightly in the past, between two real snapshots,
// so 15 Hz updates and network jitter do not show up as stutter.
export const INTERP_DELAY_MS = 100;

export class ServerClock {
    constructor(){this.offset=null;}
    // Track the smallest observed delay; drift upward slowly so a clock
    // change or a lasting route change is still followed.
    sample(serverTime,localNow=Date.now()){
        const offset=localNow-serverTime;
        if(this.offset===null || offset<this.offset)this.offset=offset;
        else this.offset+=(offset-this.offset)*.02;
    }
    renderTime(localNow=Date.now()){return this.offset===null ? null : localNow-this.offset-INTERP_DELAY_MS;}
}

export function pushSample(samples,sample){
    if(samples.length && sample.t<=samples.at(-1).t)return;
    samples.push(sample);
    while(samples.length>12)samples.shift();
}

const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export function sampleAt(samples,time){
    if(!samples.length)return null;
    if(time===null || time>=samples.at(-1).t)return samples.at(-1);
    if(time<=samples[0].t)return samples[0];
    for(let i=samples.length-1;i>0;i--){
        const a=samples[i-1],b=samples[i];
        if(time>=a.t){const t=(time-a.t)/(b.t-a.t);return {t:time,x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:angle(a.yaw,b.yaw,t)};}
    }
    return samples[0];
}
