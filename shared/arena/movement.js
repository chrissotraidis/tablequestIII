import { ARENA_CONFIG } from './rules.js';
import { isSolidCell } from './maps.js';

export function circleHits(map, x, z, radius) {
    const minX = Math.floor(x - radius) - 1;
    const maxX = Math.floor(x + radius) + 1;
    const minZ = Math.floor(z - radius) - 1;
    const maxZ = Math.floor(z + radius) + 1;
    for (let gz = minZ; gz <= maxZ; gz++) {
        for (let gx = minX; gx <= maxX; gx++) {
            if (!isSolidCell(map, gx, gz)) continue;
            const prop = map.blockingCells?.includes(`${gx},${gz}`) && map.props?.[`${gx},${gz}`];
            if (prop) {
                if (Math.hypot(x - gx - 0.5, z - gz - 0.5) < radius + prop.radius) return true;
                continue;
            }
            const nx = Math.max(gx, Math.min(x, gx + 1));
            const nz = Math.max(gz, Math.min(z, gz + 1));
            const dx = x - nx;
            const dz = z - nz;
            if (dx * dx + dz * dz < radius * radius) return true;
        }
    }
    return false;
}

export function moveCircle(map, player, input, dt) {
    const speed = input.sprint ? ARENA_CONFIG.sprintSpeed : ARENA_CONFIG.walkSpeed;
    const length = Math.hypot(input.moveX, input.moveY) || 1;
    const forwardX = Math.cos(input.yaw);
    const forwardZ = Math.sin(input.yaw);
    const rightX = Math.cos(input.yaw + Math.PI / 2);
    const rightZ = Math.sin(input.yaw + Math.PI / 2);
    const vx = (forwardX * (input.moveY / length) + rightX * (input.moveX / length)) * speed;
    const vz = (forwardZ * (input.moveY / length) + rightZ * (input.moveX / length)) * speed;
    const nx = player.x + vx * dt;
    const nz = player.z + vz * dt;
    if (!circleHits(map, nx, player.z, ARENA_CONFIG.playerRadius)) player.x = nx;
    if (!circleHits(map, player.x, nz, ARENA_CONFIG.playerRadius)) player.z = nz;
    player.vx = vx;
    player.vz = vz;
    player.yaw = input.yaw;
    player.pitch = input.pitch;
}

export function segmentBlocked(map, x1, z1, x2, z2) {
    const distance = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(distance * 8));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x=x1+(x2-x1)*t,z=z1+(z2-z1)*t,gx=Math.floor(x),gz=Math.floor(z),id=`${gx},${gz}`;
        const prop=map.blockingCells?.includes(id) && map.props?.[id];
        if(prop) { if(prop.height >= .7 && Math.hypot(x-gx-.5,z-gz-.5)<prop.radius) return true; }
        else if(isSolidCell(map,gx,gz)) return true;
    }
    return false;
}

export function insideMap(map, x, z) {
    return x >= 1 && z >= 1 && x < map.width - 1 && z < map.height - 1 && !circleHits(map, x, z, ARENA_CONFIG.playerRadius);
}

