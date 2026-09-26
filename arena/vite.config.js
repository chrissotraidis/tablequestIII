import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    base: './',
    plugins: [viteSingleFile()],
    build: {
        outDir: resolve(here, '../dist/arena'),
        emptyOutDir: true,
        assetsInlineLimit: 100000000,
        chunkSizeWarningLimit: 5000,
    },
});

