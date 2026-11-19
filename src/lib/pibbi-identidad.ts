/**
 * Identidad de PIBBI (sistema de mascota igualito al de Muse): nombre,
 * personalidad (vibe) y tamaño del avatar. Módulo puro, sin React ni
 * Supabase: se prueba en Node.
 *
 * - El nombre lo elige la pareja (2 sugerencias + escribir el propio) y
 *   se usa en TODOS los textos donde antes decía PIBBI.
 * - La vibe cambia sus saludos y reacciones.
 * - El tamaño cambia el avatar del encabezado (40 px normal, 32 px
 *   compacto, 56 px grande). El avatar junto a sus mensajes es de 32 px,
 *   el del panel de 96 px y al bailar/celebrar de 120 px.
 */
import type { ReactionContext } from './pibbi-poses'

export type PibbiVibe = 'alegre' | 'tranquilo' | 'motivador' | 'bromista'
export type PibbiSize = 'compacto' | 'normal' | 'grande'

export const DEFAULT_MASCOT_NAME = 'PIBBI'
export const MASCOT_NAME_MAX = 20
/** 2 sugerencias, como Muse al crear la cuenta: el nombre de siempre + una más. */
export const MASCOT_NAME_SUGGESTIONS = ['PIBBI', 'Chonchito'] as const

export const PIBBI_VIBES: { id: PibbiVibe; name: string; desc: string }[] = [
  { id: 'alegre', name: 'Alegre', desc: 'Contagiando buena energía' },
  { id: 'tranquilo', name: 'Tranquilo', desc: 'Sin prisa y sin drama' },
  { id: 'motivador', name: 'Motivador', desc: 'Te empuja a lograrlo' },
  { id: 'bromista', name: 'Bromista', desc: 'Siempre con un chiste' },
]

export const PIBBI_SIZES: { id: PibbiSize; name: string; desc: string }[] = [
  { id: 'compacto', name: 'Compacto', desc: 'Discreto, 32 px' },
  { id: 'normal', name: 'Normal', desc: 'El de siempre, 40 px' },
  { id: 'grande', name: 'Grande', desc: 'Bien visible, 56 px' },
]

/** Clase Tailwind del avatar del encabezado según el tamaño elegido. */
export const HEADER_SIZE_CLASS: Record<PibbiSize, string> = {
  compacto: 'h-8 w-8',
  normal: 'h-10 w-10',
  grande: 'h-14 w-14',
}

export function isPibbiVibe(v: string | null | undefined): v is PibbiVibe {
  return v === 'alegre' || v === 'tranquilo' || v === 'motivador' || v === 'bromista'
}

export function isPibbiSize(v: string | null | undefined): v is PibbiSize {
  return v === 'compacto' || v === 'normal' || v === 'grande'
}

/** Nombre limpio: sin espacios de más, máximo 20 caracteres, nunca vacío. */
export function normalizarNombreMascota(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return DEFAULT_MASCOT_NAME
  return t.slice(0, MASCOT_NAME_MAX)
}

/** Claves de localStorage (fallback sin sesión; ver src/lib/pibbi.tsx). */
export const MASCOT_NAME_STORAGE_KEY = 'fp_pibbi_name'
export const MASCOT_VIBE_STORAGE_KEY = 'fp_pibbi_vibe'
export const MASCOT_SIZE_STORAGE_KEY = 'fp_pibbi_size'

/**
 * Nombre guardado localmente, para los componentes que viven fuera del
 * PibbiProvider (p. ej. App.tsx). Quien vive dentro del provider usa
 * usePibbi() en su lugar.
 */
export function leerNombreMascota(): string {
  try {
    return normalizarNombreMascota(localStorage.getItem(MASCOT_NAME_STORAGE_KEY))
  } catch {
    return DEFAULT_MASCOT_NAME
  }
}

/** Cómo se presenta PIBBI según su personalidad (Onboarding y Chat). */
export function saludoPibbi(vibe: PibbiVibe, name: string): string {
  switch (vibe) {
    case 'tranquilo':
      return `Hola, soy ${name}. Tranquilo: te ayudo a cuidar cada peso, en pareja.`
    case 'motivador':
      return `¡Hola! Soy ${name}. ¡Vamos por cada peso, en pareja!`
    case 'bromista':
      return `¡Hola! Soy ${name}. El cerdito que cuida tus pesos (y a veces se ríe de ellos).`
    default:
      return `¡Hola! Soy ${name}, tu cerdito de los ahorros. Te ayudo a cuidar cada peso, en pareja.`
  }
}

/** Cómo celebra PIBBI una meta lograda, según su personalidad. */
export function celebracionPibbi(vibe: PibbiVibe, name: string): string {
  switch (vibe) {
    case 'tranquilo':
      return 'Meta lograda. Bien hecho, sin prisa y sin pausa.'
    case 'motivador':
      return '¡Meta alcanzada! Lo lograste con constancia. ¡A por la siguiente!'
    case 'bromista':
      return '¡Meta alcanzada! ¡Ni el cochinito se lo cree!'
    default:
      return `¡Meta alcanzada! ${name} celebra contigo.`
  }
}

/** Texto de cada reacción de PIBBI según el contexto y su personalidad. */
export function textoReaccion(contexto: ReactionContext, vibe: PibbiVibe, name: string): string {
  switch (contexto) {
    case 'saludando':
      if (vibe === 'tranquilo') return 'Hola'
      if (vibe === 'motivador') return '¡Hola! ¡A por ello!'
      if (vibe === 'bromista') return '¡Hola! ¿Qué se cuenta?'
      return '¡Hola!'
    case 'apuntando':
      return '¡Anotado!'
    case 'calculando':
      return 'Haciendo cuentas…'
    case 'pensando':
      return 'Déjame pensar…'
    case 'celebrando':
      return celebracionPibbi(vibe, name)
    case 'progreso':
      return '¡Vas muy bien!'
    case 'ahorrando':
      return '¡A ahorrar!'
  }
}
