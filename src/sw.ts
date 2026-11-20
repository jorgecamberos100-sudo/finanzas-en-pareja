/// <reference lib="webworker" />
/**
 * Service worker de Finanzas en Pareja (vite-plugin-pwa, injectManifest).
 *
 * Por qué existe este archivo así (bug real, nov 2026): el SW viejo no tenía
 * skipWaiting ni clientsClaim, así que cada despliegue nuevo quedaba
 * "esperando" para siempre mientras la app instalada o la pestaña siguieran
 * abiertas, y el dominio principal seguía sirviendo la versión vieja
 * (tema claro, sin PIBBI, sin inicio de sesión) aunque Vercel ya estuviera
 * en el commit nuevo. La recarga normal no lo arreglaba.
 *
 * Reglas de este SW:
 * - skipWaiting + clientsClaim: el SW nuevo se activa solo y toma el
 *   control de las pestañas abiertas de inmediato. La app (ver
 *   src/lib/sw-update.ts) escucha el cambio de controlador y avisa con
 *   "Nueva versión disponible" para recargar con un toque.
 * - Navegación (/, /chat, ...): NetworkFirst. El index.html siempre se
 *   pide a la red primero: una navegación con red trae la versión nueva.
 *   Sin red, se sirve lo último guardado en el caché de navegación y, si
 *   no hay nada, el index.html precacheado. Los assets (JS/CSS/imágenes)
 *   siguen saliendo del precache de Workbox, que se invalida por revisión.
 * - La API de Supabase siempre va en vivo (NetworkFirst, nunca solo caché).
 * - Push (Web Push + VAPID): muestra la notificación aunque la app esté
 *   cerrada. El push lo envía la Edge Function reminders-push (ver README).
 * - Al tocar la notificación, abre la pestaña de recordatorios.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { skipWaiting, clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>
}

/** Versión del SW (subirla cuando cambie su lógica): la app la puede pedir
 *  con un mensaje { type: 'GET_VERSION' } para verificar qué SW está activo. */
export const SW_VERSION = '2026-11-17-networkfirst'

// El SW nuevo se activa solo en cuanto se instala y toma el control de las
// pestañas abiertas: sin esto, quedaba "esperando" hasta que el usuario
// cerrara todas las pestañas o borrara los datos del sitio.
skipWaiting()
clientsClaim()

// Compatibilidad con clientes workbox-window que mandan SKIP_WAITING
// (por ejemplo, el registro automático de vite-plugin-pwa).
self.addEventListener('message', (event) => {
  const data = (event.data ?? {}) as { type?: string }
  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
  if (data.type === 'GET_VERSION') {
    const port = (event as ExtendableMessageEvent).ports?.[0]
    port?.postMessage({ type: 'SW_VERSION', version: SW_VERSION })
  }
})

// Limpia precaches de versiones viejas (evita que un caché viejo sobreviva).
cleanupOutdatedCaches()

// Navegación: red primero, con un margen de 3 s. Si la red falla o tarda,
// se sirve la última navegación guardada y, en última instancia, el
// index.html precacheado (la app funciona offline después de la primera
// visita). Esta ruta se registra ANTES que el precache: Workbox prueba las
// rutas en orden de registro, así la navegación nunca se sirve solo desde
// el precache aunque el index.html esté precacheado.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'navegacion',
      networkTimeoutSeconds: 3,
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        {
          // Sin red y sin navegación guardada: el index.html precacheado.
          handlerDidError: async () => {
            const precached = await caches.match('/index.html', { ignoreSearch: true })
            return precached ?? undefined
          },
        },
      ],
    }),
  ),
)

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.origin.includes('supabase.co'),
  new NetworkFirst({ cacheName: 'supabase-api', networkTimeoutSeconds: 3 }),
)

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() ?? {}) as PushPayload
  } catch {
    payload = { title: 'Recordatorio' }
  }
  const title = payload.title ?? 'Recordatorio de pago'
  const body = payload.body ?? 'Tienes un pago pendiente. Toca para verlo.'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag ?? 'reminder',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/recordatorios' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/recordatorios'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url.includes(self.registration.scope)) {
          return client.focus().then((c) => ('navigate' in c ? (c as WindowClient).navigate(url) : c))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
