import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Defence in depth for the production build: whatever code the host serves, the
// browser will only let the page talk to Microsoft (sign-in, Graph, SharePoint)
// and Google Fonts. Not applied to the demo build, which inlines its scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://graph.microsoft.com https://*.sharepoint.com https://*.sharepointonline.com",
  "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.sharepoint.com https://*.sharepointonline.com",
  "frame-src https://login.microsoftonline.com",
  "form-action https://login.microsoftonline.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta name="viewport"', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="viewport"`),
});

// Production build: static files for a Hugging Face static Space, Cloudflare Pages,
// or any plain web host. Nothing here talks to a server of its own.
export default defineConfig({
  plugins: [react(), cspMeta()],
  base: './',
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
