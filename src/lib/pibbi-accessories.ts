/** Prendas/accesorios con los que cada persona puede vestir a su PIBBI. (Módulo puro, sin Supabase: se prueba en Node.) */
export type PibbiAccessory = 'ninguno' | 'lentes' | 'gorra' | 'mono' | 'corona'

export const PIBBI_ACCESSORIES: { id: PibbiAccessory; name: string; emoji: string }[] = [
  { id: 'ninguno', name: 'Ninguna', emoji: '🐷' },
  { id: 'lentes', name: 'Lentes', emoji: '👓' },
  { id: 'gorra', name: 'Gorra', emoji: '🧢' },
  { id: 'mono', name: 'Moño', emoji: '🎀' },
  { id: 'corona', name: 'Corona', emoji: '👑' },
]

export function isPibbiAccessory(v: string | null | undefined): v is PibbiAccessory {
  return v === 'ninguno' || v === 'lentes' || v === 'gorra' || v === 'mono' || v === 'corona'
}
