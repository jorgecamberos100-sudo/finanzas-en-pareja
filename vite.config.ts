import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Registro manual en src/main.tsx (vía src/lib/sw-update.ts): el
      // registro automático del plugin recargaba solo al activarse el SW
      // nuevo, pero como src/sw.ts no tenía skipWaiting, el SW quedaba
      // "esperando" para siempre y la app vieja nunca se actualizaba.
      // Ahora el registro es explícito y la app avisa con un banner.
      registerType: 'prompt',
      injectRegister: false,
      // injectManifest: el service worker propio (src/sw.ts) con precache de
      // Workbox + manejo de push (notificaciones aunque la app esté cerrada).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon.png',
        'icons/icon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
      ],
      // Único manifest de la app: el public/manifest.webmanifest viejo se
      // eliminó porque sobrescribía a este en el build (solo traía un SVG).
      manifest: {
        id: '/',
        name: 'Finanzas en Pareja',
        short_name: 'Finanzas',
        description: 'Control de finanzas en pareja: gastos, presupuesto por sobres, metas y deuda mutua. Gratis para los dos.',
        theme_color: '#0A0F1E',
        background_color: '#0A0F1E',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'es-MX',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
  server: { port: 5173, host: true },
})