/** Tema claro/oscuro de la interfaz (paletas A noche y C día).
 *
 * Las dos paletas viven como variables CSS en :root (ver src/index.css):
 * los tokens de Tailwind son `rgb(var(--X-rgb) / <alpha-value>)`, así el
 * cambio de tema es solo cambiar `data-theme` en <html>, sin recargar y
 * sin duplicar clases en los componentes. A PIBBI no le afecta: sus
 * colores viven en sus propias variables de párpados y sombra y en
 * sus imágenes, y este módulo no las toca.
 *
 * Por defecto: noche (la identidad actual de la app).
 */

export type Tema = 'noche' | 'dia'

export const TEMA_KEY = 'finanzas-tema'

/** Color del <meta name="theme-color"> (chrome del navegador/PWA) por tema. */
export const META_THEME_COLOR: Record<Tema, string> = {
  noche: '#0A0F1E',
  dia: '#F7F1E3',
}

/** Valor guardado -> tema. Cualquier valor raro o ausente es noche. */
export function temaDesdeStorage(valor: string | null): Tema {
  return valor === 'dia' ? 'dia' : 'noche'
}

/** Tema guardado en este dispositivo (noche si no hay nada guardado). */
export function leerTema(): Tema {
  try {
    return temaDesdeStorage(window.localStorage.getItem(TEMA_KEY))
  } catch {
    return 'noche'
  }
}

/** Aplica el tema: atributo en <html> (lo leen las variables CSS),
 *  meta theme-color y persistencia en localStorage. */
export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = tema
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_THEME_COLOR[tema])
  try {
    window.localStorage.setItem(TEMA_KEY, tema)
  } catch {
    // Modo privado o almacenamiento bloqueado: el tema aplica igual
    // en esta sesión, solo no se recuerda para la próxima.
  }
}
