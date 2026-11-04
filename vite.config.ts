import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/duo/',
  build: {
    rollupOptions: {
      output: {
        // Firebase (sync) is big and only used once PO sets sync up, so it
        // gets its own chunk that is not part of the offline precache.
        manualChunks(id: string) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Duo',
        short_name: 'Duo',
        description: 'Công cụ học từ vựng Anh – Đức (Breadth & Depth)',
        start_url: '/duo/',
        scope: '/duo/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#9bc2e9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Cached the first time sync is used instead (see runtimeCaching).
        globIgnores: ['**/firebase-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/firebase-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'firebase-sdk' },
          },
        ],
      },
    }),
  ],
})
