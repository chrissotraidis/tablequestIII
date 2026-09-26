// Pause-only wayfinding. Uses authoritative availability; never reveals enemies.
export function drawSupplyMap(canvas,map,snapshot,player,yaw=0) {
    const ctx=canvas.getContext('2d'),pad=12;
    const scale=Math.min((canvas.width-pad*2)/map.width,(canvas.height-pad*2)/map.height);
    const left=(canvas.width-map.width*scale)/2,top=(canvas.height-map.height*scale)/2;
    ctx.fillStyle='#141816';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.translate(left,top);ctx.scale(scale,scale);
    for(let z=0;z<map.height;z++)for(let x=0;x<map.width;x++) {
        ctx.fillStyle=map.map[z][x]==='#'?'#706850':'#242c28';ctx.fillRect(x,z,1,1);
    }
    const destroyed=new Set(snapshot?.destroyedCover||[]);
    ctx.fillStyle='#424739';
    for(const id of map.blockingCells){if(destroyed.has(id))continue;const [x,z]=id.split(',').map(Number);ctx.fillRect(x+.15,z+.15,.7,.7);}
    for(const door of snapshot?.doors||map.doors){const [x,z]=door.id.split(',').map(Number);ctx.fillStyle=door.open?'#80bb99':'#d6a855';ctx.fillRect(x+.1,z+.3,.8,.4);}
    for(const pickup of snapshot?.pickups||map.pickups){
        ctx.globalAlpha=pickup.available===false?.4:1;
        const r=pickup.weapon?.7:.3;ctx.beginPath();ctx.arc(pickup.x,pickup.z,r,0,Math.PI*2);
        ctx.fillStyle=pickup.weapon?'#e6c477':pickup.kind==='paint'?'#76b8e8':'#e88c7d';ctx.fill();
        if(pickup.weapon){ctx.fillStyle='#171913';ctx.font='bold 1px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(['paintbrush','tableLeg','sprayer','nailgun','roller'].indexOf(pickup.weapon)+1),pickup.x,pickup.z);}
    }
    ctx.globalAlpha=1;
    if(player){ctx.translate(player.x,player.z);ctx.rotate(yaw);ctx.beginPath();ctx.moveTo(.9,0);ctx.lineTo(-.55,-.55);ctx.lineTo(-.3,0);ctx.lineTo(-.55,.55);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#151914';ctx.lineWidth=.13;ctx.stroke();}
    ctx.restore();
}
