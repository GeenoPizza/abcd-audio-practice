import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ABCD method:audio',
        short_name: 'ABCD Audio',
        description: 'Metodo ABCD per musicisti',
        theme_color: '#5dda9d',
        background_color: '#0b0d0e',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      'soundtouchjs': 'soundtouchjs',
      'web-audio-beat-detector': 'web-audio-beat-detector'
    }
  },
  build: {
    rollupOptions: {
      external: [] // Forza a NON externalizzare nulla
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  }
})