import { defineConfig } from 'vite';
export default defineConfig({ root: 'client', publicDir: 'public', build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' }, server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000', '/auth': 'http://127.0.0.1:3000', '/ws': { target: 'ws://127.0.0.1:3000', ws: true } } } });
