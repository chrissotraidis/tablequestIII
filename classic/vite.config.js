import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Generation 2 (classic 2.1). Sources in classic/ are frozen; this config only points
// the root and output at their new home (classic/ → dist/classic/index.html).
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    base: './',
    plugins: [viteSingleFile()],
    server: { port: 5173, strictPort: false },
    preview: { port: 4173 },
    build: {
        outDir: resolve(here, '../dist/classic'),
        emptyOutDir: true,
        assetsInlineLimit: 100000000, // inline everything (single-file dist)
        chunkSizeWarningLimit: 5000,
    },
});
