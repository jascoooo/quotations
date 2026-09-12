import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One-file build of the real app: the setup screen, Microsoft sign-in and all.
//
// It exists so the app can be tested with no build tooling and no web server:
// create an empty static Space (or any plain web host), upload this single
// index.html, and open it. The multi-file `npm run build` remains the one that
// CI publishes for day-to-day use.
//
// Because everything is inlined, `script-src 'self'` would block the page's own
// code. Rather than fall back to 'unsafe-inline', the policy below carries a
// sha256 hash of each inlined script, which keeps the same guarantee: the
// browser runs exactly the code that was built here and nothing else, and can
// still only talk to Microsoft.
const csp = (scriptHashes: string[]) =>
  [
    "default-src 'self'",
    `script-src ${scriptHashes.map((h) => `'${h}'`).join(' ') || "'self'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://graph.microsoft.com https://*.sharepoint.com https://*.sharepointonline.com",
    "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.sharepoint.com https://*.sharepointonline.com",
    "frame-src https://login.microsoftonline.com",
    "form-action https://login.microsoftonline.com",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

/** Runs on the finished file, so it hashes exactly what ships. */
const cspHashes = (outDir: string): Plugin => ({
  name: 'csp-meta-hashed',
  apply: 'build',
  enforce: 'post',
  closeBundle() {
    const file = resolve(outDir, 'index.html');
    if (!existsSync(file)) return;
    const html = readFileSync(file, 'utf8');
    const hashes: string[] = [];
    for (const m of html.matchAll(/<script\b[^>]*>([\s\S]+?)<\/script>/g)) {
      hashes.push(`sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}`);
    }
    if (!hashes.length) throw new Error('single-file build: no inline script found to hash');
    const stripped = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/g, '');
    writeFileSync(file, stripped.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp(hashes)}" />`));
  },
});

export default defineConfig({
  plugins: [react(), viteSingleFile(), cspHashes('dist-single')],
  base: './',
  build: { outDir: 'dist-single', sourcemap: false, target: 'es2022', cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
