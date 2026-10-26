import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const deferStylesheets = (): Plugin => ({
  name: 'defer-stylesheets',
  enforce: 'post',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue;

      const html = typeof output.source === 'string'
        ? output.source
        : new TextDecoder().decode(output.source);
      let deferredStylesheetCount = 0;
      const transformedHtml = html.replace(/<link\b[^>]*>/g, (link) => {
        if (!/\brel="stylesheet"/.test(link) || !/\bhref="[^"]+\.css"/.test(link)) {
          return link;
        }

        deferredStylesheetCount += 1;
        const preloadLink = link.replace(
          /\brel="stylesheet"/,
          'rel="preload" as="style" onload="this.onload=null;this.rel=\'stylesheet\'"',
        );
        return `${preloadLink}<noscript>${link}</noscript>`;
      });

      if (deferredStylesheetCount === 0 && /href="[^"]+\.css"/.test(html)) {
        throw new Error(`Failed to defer the stylesheet in ${output.fileName}`);
      }

      output.source = transformedHtml;
    }
  },
});

const rawPort = process.env.PORT || '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';


export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    deferStylesheets(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  // Load VITE_-prefixed vars from the monorepo root .env instead of this package's own directory
  envDir: path.resolve(import.meta.dirname, '..', '..'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Forward API calls to the separately-running Express server during local dev
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
