import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5176, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { emptyOutDir: false, chunkSizeWarningLimit: 700, assetsInlineLimit: 1024 * 1024,
    rollupOptions: { output: { entryFileNames: 'assets/game.js', chunkFileNames: 'assets/[name].js',
      assetFileNames: 'assets/[name][extname]' } } },
});
