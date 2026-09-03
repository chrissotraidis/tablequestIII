import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// MODERN preview build. Lives in modern/, builds to dist/modern/index.html.
// The classic build (../vite.config.js -> dist/index.html) is untouched.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    base: './',
    plugins: [viteSingleFile()],
    server: { port: 5174, strictPort: false },
    preview: { port: 4174 },
    build: {
        outDir: resolve(here, '../dist/modern'),
        emptyOutDir: true,
        assetsInlineLimit: 100000000, // inline everything (single-file dist)
        chunkSizeWarningLimit: 5000,
    },
});
