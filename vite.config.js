import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// MODERN — the main build (repo root → dist/index.html). The classic generation
// builds from classic/vite.config.js → dist/classic/index.html.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    base: './',
    plugins: [viteSingleFile()],
    server: { port: 5174, strictPort: false },
    preview: { port: 4174 },
    build: {
        outDir: resolve(here, 'dist'),
        emptyOutDir: false, // dist/classic lives beside the main build
        assetsInlineLimit: 100000000, // inline everything (single-file dist)
        chunkSizeWarningLimit: 5000,
    },
});
