import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/** Bumped with `npm version`: names the service-worker caches so each release starts clean. */
const APP_VERSION = pkg.version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/lib/pwa.ts so the app can also check for updates when it's reopened.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'theme-init.js'],
      manifest: {
        name: 'Money — personal finance',
        short_name: 'Money',
        description: 'Track income, expenses and recurring costs in seconds.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add expense', url: '/?add=expense', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Add income', url: '/?add=income', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        cacheId: `money-${APP_VERSION}`,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'assets/inter-latin-*.woff2'],
        navigateFallback: '/index.html',
        // Never let the service worker touch the API: data must always be fresh and authenticated.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    // `npm run dev:api` runs wrangler on 8788 in front of Vite; plain `npm run dev` proxies API calls to it.
    proxy: { '/api': { target: 'http://localhost:8788', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // The largest chunk is recharts (~160 KB gzipped). It is never in the initial load: it is fetched
    // on demand by `loadRecharts()` after the dashboard has painted, so the default 500 KB warning
    // doesn't apply to it.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
            if (id.includes('@tanstack')) return 'query';
            if (/[\\/](radix-ui|@radix-ui|sonner|lucide-react)[\\/]/.test(id)) return 'ui';
          }
          return undefined;
        },
      },
    },
  },
});
