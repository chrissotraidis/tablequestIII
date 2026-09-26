// Remote staff are drawn slightly in the past, between two real snapshots,
// so 15 Hz updates and network jitter do not show up as stutter. The delay
// is one snapshot interval plus the jitter actually observed.
const SNAPSHOT_INTERVAL_MS = 1000 / 15;
export const MIN_DELAY_MS = 80, MAX_DELAY_MS = 250;

export class ServerClock {
    constructor(){this.offset=null;this.jitter=0;this.delayMs=MIN_DELAY_MS;}
    sample(serverTime,localNow=Date.now()){
        const offset=localNow-serverTime;
        // Track the fastest observed delivery; drift upward slowly so a clock
        // change or a lasting route change is still followed.
        if(this.offset===null || offset<this.offset)this.offset=offset;
        else this.offset+=(offset-this.offset)*.01;
        // Jitter: a decaying peak of lateness beyond the fastest delivery.
        this.jitter=Math.max(offset-this.offset,this.jitter*.995);
        // Ease delay changes in so the drawn timeline never visibly jumps.
        const target=Math.max(MIN_DELAY_MS,Math.min(MAX_DELAY_MS,SNAPSHOT_INTERVAL_MS+this.jitter+10));
        this.delayMs+=(target-this.delayMs)*.08;
    }
    delay(){return this.delayMs;}
    renderTime(localNow=Date.now()){return this.offset===null ? null : localNow-this.offset-this.delay();}
}

export function pushSample(samples,sample){
    if(samples.length && sample.t<=samples.at(-1).t)return;
    samples.push(sample);
    while(samples.length>16)samples.shift();
}

const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:angle(a.yaw,b.yaw,t)});
export function sampleAt(samples,time){
    if(!samples.length)return null;
    const last=samples.at(-1);
    if(time===null)return last;
    if(time>=last.t){
        // Briefly continue the last motion rather than freezing on a late packet.
        const prev=samples.at(-2);
        if(!prev || time-last.t>100)return last;
        return {t:time,...mix(prev,last,1+(time-last.t)/(last.t-prev.t))};
    }
    if(time<=samples[0].t)return samples[0];
    for(let i=samples.length-1;i>0;i--){
        const a=samples[i-1],b=samples[i];
        if(time>=a.t)return {t:time,...mix(a,b,(time-a.t)/(b.t-a.t))};
    }
    return samples[0];
}
