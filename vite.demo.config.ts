import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Demo build: one self-contained HTML file running on made-up data only.
// Used for the shareable preview; it never signs in or touches Microsoft 365.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: { 'import.meta.env.VITE_DEMO_ONLY': JSON.stringify('1') },
  build: { outDir: 'dist-demo', sourcemap: false, target: 'es2022', cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
