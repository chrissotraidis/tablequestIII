// Validates level maps: enclosure, start, elevator, reachability of objectives.
import { LEVELS } from '../src/levels.js';

const WALLS = new Set(['#', 'W', 'B', 'M', 'O', 'C']);
let failures = 0;

LEVELS.forEach((lvl, li) => {
    const rows = lvl.map;
    const w = Math.max(...rows.map(r => r.length));
    const grid = rows.map(r => r.padEnd(w, lvl.wallChar));
    const h = grid.length;
    const issues = [];

    // enclosure: border must be wall
    for (let x = 0; x < w; x++) {
        if (!WALLS.has(grid[0][x])) issues.push(`top border open at x=${x} '${grid[0][x]}'`);
        if (!WALLS.has(grid[h - 1][x])) issues.push(`bottom border open at x=${x} '${grid[h - 1][x]}'`);
    }
    for (let y = 0; y < h; y++) {
        if (!WALLS.has(grid[y][0])) issues.push(`left border open at y=${y} '${grid[y][0]}'`);
        if (!WALLS.has(grid[y][w - 1])) issues.push(`right border open at y=${y} '${grid[y][w - 1]}'`);
    }

    // entity counts
    const count = {};
    let start = null;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const c = grid[y][x];
            count[c] = (count[c] || 0) + 1;
            if (c === 'S') start = [x, y];
        }
    if (count['S'] !== 1) issues.push(`expected 1 start, got ${count['S'] || 0}`);
    if (!lvl.boss) {
        if (!count['E']) issues.push('no elevator pad');
        if (!count['X']) issues.push('no elevator gate');
        if (!count['T']) issues.push('no tables');
    } else if (count['G'] !== 1) issues.push(`boss level needs exactly 1 G, got ${count['G'] || 0}`);

    // BFS reachability (doors '+' and gates 'X' passable, walls not)
    if (start) {
        const seen = Array.from({ length: h }, () => new Array(w).fill(false));
        const q = [start];
        seen[start[1]][start[0]] = true;
        while (q.length) {
            const [cx, cy] = q.pop();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny][nx]) continue;
                if (WALLS.has(grid[ny][nx])) continue;
                seen[ny][nx] = true;
                q.push([nx, ny]);
            }
        }
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const c = grid[y][x];
                if ('TEAH$ZLPGgmxD'.includes(c) && c !== '.' && !seen[y][x])
                    issues.push(`'${c}' at (${x},${y}) unreachable`);
            }
    }

    const tag = `L${li + 1} ${lvl.name} (${w}x${h})`;
    if (issues.length) {
        failures++;
        console.log(`FAIL ${tag}`);
        issues.slice(0, 20).forEach(i => console.log(`   - ${i}`));
    } else {
        console.log(`OK   ${tag} tables=${count['T'] || 0} enemies=${(count['g']||0)+(count['m']||0)+(count['x']||0)+(count['D']||0)+(count['G']||0)}`);
    }
});

process.exit(failures ? 1 : 0);
