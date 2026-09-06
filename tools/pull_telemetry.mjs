import { spawn } from 'node:child_process';
import { mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: {
    host: { type: 'string' }, remote: { type: 'string' }, out: { type: 'string', default: 'data/vps-telemetry.jsonl' },
} });
const host = values.host || process.env.TQ_VPS_HOST;
const remote = values.remote || process.env.TQ_VPS_TELEMETRY_FILE;
if (!host || !remote) throw new Error('Use --host user@vps --remote /absolute/path/telemetry.jsonl (or TQ_VPS_HOST / TQ_VPS_TELEMETRY_FILE)');
// scp can pass remote paths to a shell on older servers. Accept plain paths only.
if (!/^[a-zA-Z0-9][a-zA-Z0-9._@:-]*$/.test(host) || !/^\/[a-zA-Z0-9._/-]+$/.test(remote)) throw new Error('Use a plain SSH host/alias and absolute path without spaces or shell characters');
const out = resolve(values.out);
await mkdir(dirname(out), { recursive: true });
const temp = await mkdtemp(join(dirname(out), '.telemetry-pull-'));
try {
    const partial = join(temp, 'telemetry.jsonl');
    await new Promise((resolveCopy, reject) => {
        const child = spawn('scp', [`${host}:${remote}`, partial], { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolveCopy() : reject(new Error(`scp failed (${code}); previous log copy preserved`)));
    });
    await rename(partial, out);
    console.log(`Saved ${out}`);
} finally { await rm(temp, { recursive: true, force: true }); }
