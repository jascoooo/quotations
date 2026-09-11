import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production build: static files for a Hugging Face static Space, Cloudflare Pages,
// or any plain web host. Nothing here talks to a server of its own.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
