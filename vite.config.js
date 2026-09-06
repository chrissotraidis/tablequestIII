import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { handleScoreboardRequest } from './server/scoreboard-server.mjs';

// MODERN — the main build (repo root → dist/index.html). The classic generation
// builds from classic/vite.config.js → dist/classic/index.html.
const here = dirname(fileURLToPath(import.meta.url));

function sourceHash(dir, hash = createHash('sha256')) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = resolve(dir, entry.name);
        hash.update(entry.name);
        if (entry.isDirectory()) sourceHash(path, hash);
        else hash.update(readFileSync(path));
    }
    return hash;
}
const buildId = sourceHash(resolve(here, 'src')).update(readFileSync(resolve(here, 'index.html'))).update(readFileSync(resolve(here, 'package-lock.json'))).digest('hex').slice(0, 12);

export default defineConfig(({ command }) => ({
    define: { __TQ_BUILD_ID__: JSON.stringify(command === 'build' ? buildId : 'dev') },
    root: here,
    base: './',
    plugins: [viteSingleFile(), {
        name: 'local-scoreboard',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url?.startsWith('/api/')) return handleScoreboardRequest(req, res);
                next();
            });
        },
    }],
    server: { port: 5174, strictPort: false },
    preview: { port: 4174 },
    build: {
        outDir: resolve(here, 'dist'),
        emptyOutDir: false, // dist/classic lives beside the main build
        assetsInlineLimit: 100000000, // inline everything (single-file dist)
        chunkSizeWarningLimit: 5000,
    },
}));
