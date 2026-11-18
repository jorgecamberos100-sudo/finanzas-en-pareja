/** Temas de la interfaz (paletas A noche, C día y Esmeralda).
 *
 * Las tres paletas viven como variables CSS en :root (ver src/index.css):
 * los tokens de Tailwind son `rgb(var(--X-rgb) / <alpha-value>)`, así el
 * cambio de tema es solo cambiar `data-theme` en <html>, sin recargar y
 * sin duplicar clases en los componentes. A PIBBI no le afecta: sus
 * colores viven en sus propias variables de párpados y sombra y en
 * sus imágenes, y este módulo no las toca.
 *
 * Esmeralda (propuesta "Emerald Finance" de ChatGPT, pedida por George
 * nov 2026): marca verde esmeralda #137A55, menta #20B981, fondo claro
 * blanco verdoso, fondo oscuro verde casi negro; el verde domina la
 * interfaz y el rosa es solo de PIBBI (igual que en noche/día: el rosa
 * nunca entra en la interfaz). En este tema el acento de dinero es la
 * menta brillante (botones) y la esmeralda es marca/foco/positivo.
 *
 * Por defecto: noche (la identidad actual de la app).
 */

export type Tema = 'noche' | 'dia' | 'esmeralda'

export const TEMAS: readonly Tema[] = ['noche', 'dia', 'esmeralda'] as const

export const TEMA_KEY = 'finanzas-tema'

/** Color del <meta name="theme-color"> (chrome del navegador/PWA) por tema. */
export const META_THEME_COLOR: Record<Tema, string> = {
  noche: '#0A0F1E',
  dia: '#F7F1E3',
  esmeralda: '#EDF5EF',
}

/** Valor guardado -> tema. Cualquier valor raro o ausente es noche. */
export function temaDesdeStorage(valor: string | null): Tema {
  return valor === 'dia' || valor === 'esmeralda' ? valor : 'noche'
}

/** Siguiente tema en el ciclo del interruptor: noche -> día -> esmeralda -> noche. */
export function siguienteTema(tema: Tema): Tema {
  const i = TEMAS.indexOf(tema)
  return TEMAS[(i + 1) % TEMAS.length]
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
