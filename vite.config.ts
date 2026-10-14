/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

// Relative base so the build works on any static host and in sub-paths (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
// `vite build --mode standalone`: one self-contained HTML file (all scripts, styles, fonts and images
// inlined, no lazy chunks) that runs from the local disk (file://) without installation or internet.
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    ...(standalone
      ? [
          viteSingleFile({ removeViteModuleLoader: true }),
          {
            name: 'inline-favicon',
            transformIndexHtml: (html: string) =>
              html.replace('./favicon.svg', `data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}`),
          },
        ]
      : []),
  ],
  build: standalone
    ? { target: 'es2022', outDir: 'dist-standalone', copyPublicDir: false, assetsInlineLimit: () => true, chunkSizeWarningLimit: 10000 }
    : { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  };
});
