/// <reference lib="webworker" />
/**
 * Service worker de Finanzas en Pareja (vite-plugin-pwa, injectManifest).
 * - Precarga el shell de la app (Workbox).
 * - La API de Supabase siempre va en vivo (NetworkFirst, nunca cache).
 * - Push (Web Push + VAPID): muestra la notificación aunque la app esté cerrada.
 *   El push lo envía la Edge Function reminders-push (ver README).
 * - Al tocar la notificación, abre la pestaña de recordatorios.
 */
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>
}

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
  const title = payload.title ?? '🔔 Recordatorio de pago'
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
