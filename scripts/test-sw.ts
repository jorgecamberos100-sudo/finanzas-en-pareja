// Resguardos del service worker (nov 2026): el SW viejo no tenía skipWaiting
// ni clientsClaim y cada despliegue quedaba "esperando" para siempre, así que
// la app instalada seguía sirviendo la versión vieja aunque Vercel ya
// estuviera al día. Estas comprobaciones son a nivel de fuente: si alguien
// quita una de estas piezas, el test falla antes de publicar.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Se corre con npm desde la raíz del repo (igual que los demás test:*).
const root = process.cwd()

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}`)
  }
}

const sw = readFileSync(join(root, 'src/sw.ts'), 'utf8')
check('sw.ts activa el SW nuevo solo (skipWaiting)', sw.includes('skipWaiting()'))
check('sw.ts toma el control de las pestañas (clientsClaim)', sw.includes('clientsClaim()'))
check('sw.ts atiende SKIP_WAITING de clientes workbox-window', sw.includes("data.type === 'SKIP_WAITING'"))
check('sw.ts limpia precaches viejos', sw.includes('cleanupOutdatedCaches()'))
check('sw.ts tiene ruta de navegación NetworkFirst', sw.includes('NavigationRoute') && sw.includes('NetworkFirst'))
check('sw.ts guarda navegaciones en caché propio', sw.includes("cacheName: 'navegacion'"))
check('sw.ts cae al index.html precacheado sin red', sw.includes("caches.match('/index.html'"))
check('sw.ts expone su versión para verificar qué SW está activo', sw.includes('GET_VERSION') && sw.includes('SW_VERSION'))
check('sw.ts sigue con push de recordatorios', sw.includes("addEventListener('push'"))

const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8')
check('vite.config no inyecta registro automático (registro manual en main.tsx)', vite.includes('injectRegister: false'))
check('vite.config usa la paleta casi negra de Muse en el manifest', vite.includes("theme_color: '#0A0A0C'"))

check('existe src/lib/sw-update.ts', existsSync(join(root, 'src/lib/sw-update.ts')))
const upd = readFileSync(join(root, 'src/lib/sw-update.ts'), 'utf8')
check('sw-update.ts escucha el cambio de controlador', upd.includes('controllerchange'))
check('sw-update.ts no avisa en la primera instalación', upd.includes('hadController'))
check('sw-update.ts revisa si hay SW nuevo cada cierto rato', upd.includes('reg.update()'))
check('sw-update.ts recarga para traer la versión nueva', upd.includes('window.location.reload()'))

const main = readFileSync(join(root, 'src/main.tsx'), 'utf8')
check('main.tsx inicia el registro del SW', main.includes('initServiceWorker()'))

const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
check('App.tsx avisa "Nueva versión disponible"', app.includes('Nueva versión disponible'))
check('App.tsx tiene botón para actualizar', app.includes('Actualizar ahora') && app.includes('applyUpdate'))

console.log(`\ntest-sw: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
