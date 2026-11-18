/** Temas de la interfaz: SOLO la paleta "Emerald Finance".
 *
 * Dos temas, ambos esmeralda (ver src/index.css): los valores viven
 * como variables CSS en :root y los tokens de Tailwind son
 * `rgb(var(--X-rgb) / <alpha-value>)`, así el cambio de tema es solo
 * cambiar `data-theme` en <html>, sin recargar y sin duplicar clases
 * en los componentes. A PIBBI no le afecta: sus colores viven en sus
 * propias variables de párpados y sombra y en sus imágenes, y este
 * módulo no las toca.
 *
 * Esmeralda (propuesta "Emerald Finance" de ChatGPT, pedida por George
 * nov 2026): marca verde esmeralda #137A55, menta #20B981, fondo claro
 * blanco verdoso de día y fondo verde casi negro de noche; el verde
 * domina la interfaz y el rosa es solo de PIBBI (el rosa nunca entra
 * en la interfaz). La señal de dinero es la menta brillante (relleno
 * de botones) y la esmeralda es marca/foco/positivo.
 *
 * Por defecto: noche (esmeralda oscura).
 *
 * Migración (nov 2026, al quedar solo dos temas): el valor guardado
 * 'esmeralda' de la época de los tres temas cae en día (era el tema
 * claro); 'noche' y 'dia' siguen siendo noche y día; cualquier valor
 * raro o ausente es noche.
 */

export type Tema = 'noche' | 'dia'

export const TEMAS: readonly Tema[] = ['noche', 'dia'] as const

export const TEMA_KEY = 'finanzas-tema'

/** Color del <meta name="theme-color"> (chrome del navegador/PWA) por tema. */
export const META_THEME_COLOR: Record<Tema, string> = {
  noche: '#07130C',
  dia: '#EDF5EF',
}

/** Valor guardado -> tema. 'esmeralda' (tema viejo) migra a día;
 *  cualquier valor raro o ausente es noche. */
export function temaDesdeStorage(valor: string | null): Tema {
  return valor === 'dia' || valor === 'esmeralda' ? 'dia' : 'noche'
}

/** Siguiente tema en el ciclo del interruptor: noche <-> día. */
export function siguienteTema(tema: Tema): Tema {
  return tema === 'noche' ? 'dia' : 'noche'
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
