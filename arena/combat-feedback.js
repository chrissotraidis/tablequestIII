export function damageBearing(player, source, yaw) {
    if(!player || !source || ![player.x,player.z,source.x,source.z,yaw].every(Number.isFinite))return null;
    const dx=source.x-player.x,dz=source.z-player.z;
    if(Math.hypot(dx,dz)<.01)return null;
    const angle=Math.atan2(dz,dx)-yaw;
    return Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI;
}
