/**
 * Registro manual del service worker + aviso de actualización.
 *
 * Por qué manual (bug real, nov 2026): con el registro automático de
 * vite-plugin-pwa, el SW nuevo quedaba "esperando" para siempre porque
 * src/sw.ts no tenía skipWaiting, y la app instalada seguía sirviendo la
 * versión vieja aunque Vercel ya estuviera al día. Ahora el SW nuevo se
 * activa solo (skipWaiting + clientsClaim en src/sw.ts) y cuando toma el
 * control de esta pestaña se avisa con un banner en vez de recargar sin
 * avisar o, peor, no enterarse nunca.
 *
 * - Solo se registra en producción: en dev no hay SW (vite-plugin-pwa
 *   solo lo genera en el build) y el registro fallaría.
 * - `controllerchange` también dispara en la primera instalación (cuando
 *   el controlador pasa de null al SW): eso NO es una actualización, así
 *   que solo se avisa si ya había un controlador antes.
 * - Se revisa si hay SW nuevo cada 30 min, por si la pestaña lleva
 *   abierta mucho rato.
 */
type UpdateListener = () => void

const listeners = new Set<UpdateListener>()
let updateAvailable = false

/** Suscribe el aviso "hay versión nueva". Devuelve la función para quitarlo. */
export function onUpdateAvailable(fn: UpdateListener): () => void {
  listeners.add(fn)
  if (updateAvailable) fn()
  return () => {
    listeners.delete(fn)
  }
}

/** Recarga la página: la navegación es NetworkFirst, así trae el index.html nuevo. */
export function applyUpdate() {
  window.location.reload()
}

export function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  // ¿Ya había un SW controlando esta pestaña al cargar? Solo si lo había
  // y cambia, hay una actualización: en la primera instalación el
  // controlador pasa de null al SW y eso no debe mostrar el banner.
  const hadController = Boolean(navigator.serviceWorker.controller)

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      window.setInterval(() => {
        void reg.update()
      }, 30 * 60 * 1000)
    })
    .catch(() => {
      // Sin SW (navegador sin soporte o registro bloqueado): la app sigue
      // funcionando como página web normal, sin modo offline ni push.
    })

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updateAvailable) return
    updateAvailable = true
    listeners.forEach((fn) => fn())
  })
}
