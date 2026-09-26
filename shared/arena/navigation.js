// Conservative cell-center routes. Door cells are planning edges: actors open
// them before crossing; furniture and structural walls remain obstacles.
export function arenaRoute(map, player, goal) {
    const start = `${Math.floor(player.x)},${Math.floor(player.z)}`;
    const end = `${Math.floor(goal[0])},${Math.floor(goal[1])}`;
    const queue = [start], previous = new Map([[start, null]]);
    const blocked = new Set(map.blockingCells);
    for (let i = 0; i < queue.length && !previous.has(end); i++) {
        const [x, z] = queue[i].split(',').map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz, id = `${nx},${nz}`;
            if (previous.has(id) || nx < 1 || nz < 1 || nx >= map.width - 1 || nz >= map.height - 1 || map.map[nz][nx] === '#' || blocked.has(id)) continue;
            previous.set(id, queue[i]); queue.push(id);
        }
    }
    if (!previous.has(end)) return [];
    const path = [];
    for (let id = end; id && id !== start; id = previous.get(id)) path.unshift(id.split(',').map(n => Number(n) + .5));
    return path;
}
