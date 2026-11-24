import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Percorsi relativi: funziona su GitHub Pages in qualsiasi sottocartella
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Blank Out — Diario cefalea',
        short_name: 'Blank Out',
        description: 'Diario del mal di testa veloce, privato e offline',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#121316',
        theme_color: '#121316',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [{ name: 'Registra mal di testa', short_name: 'Registra', url: './#/log' }]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], importScripts: ['sw-notify.js'] }
    })
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
