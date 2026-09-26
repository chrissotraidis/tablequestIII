// Build a self-contained VPS runtime: the built game, the Arena/scoreboard
// server, the shared Arena rules, and the one runtime dependency (ws).
// Usage: npm run build && npm run build:arena && npm run package:vps
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const rev = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'server', 'shared', 'src', 'arena', 'index.html'], { cwd: repo }).toString().trim();
const name = `tablequest-runtime-${rev}${dirty ? '-dirty' : ''}`;
const out = resolve(repo, 'artifacts', name);

for (const built of ['dist/index.html', 'dist/arena/index.html']) {
    if (!existsSync(resolve(repo, built))) throw new Error(`Missing ${built}; run npm run build && npm run build:arena first.`);
}
const newest = (path) => { const info = statSync(path); return info.isDirectory() ? Math.max(0, ...readdirSync(path).map((child) => newest(resolve(path, child)))) : info.mtimeMs; };
const sources = Math.max(...['src', 'arena', 'shared', 'index.html'].map((p) => newest(resolve(repo, p))));
if (Math.min(statSync(resolve(repo, 'dist/index.html')).mtimeMs, statSync(resolve(repo, 'dist/arena/index.html')).mtimeMs) < sources) throw new Error('dist/ is older than the game sources; run npm run build && npm run build:arena.');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const path of ['dist', 'server', 'shared', 'src/levels.js', 'deploy', 'node_modules/ws']) {
    cpSync(resolve(repo, path), resolve(out, path), { recursive: true });
}
const wsVersion = JSON.parse(readFileSync(resolve(repo, 'node_modules/ws/package.json'), 'utf8')).version;
writeFileSync(resolve(out, 'package.json'), JSON.stringify({
    name: 'tablequest-runtime', private: true, type: 'module', version: rev,
    engines: { node: '>=22.12' }, dependencies: { ws: wsVersion },
    scripts: { start: 'node server/arena-server.mjs' },
}, null, 2) + '\n');
writeFileSync(resolve(out, 'REVISION'), `${rev}${dirty ? ' (uncommitted changes)' : ''}\n`);

const archive = resolve(repo, 'artifacts', `${name}.tgz`);
execFileSync('tar', ['-czf', archive, '-C', resolve(repo, 'artifacts'), name]);
const sha = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${sha}  ${name}.tgz\n`);
console.log(JSON.stringify({ archive, sha256: sha, bytes: statSync(archive).size, dirty: Boolean(dirty) }, null, 2));
