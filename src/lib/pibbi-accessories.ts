/** Prendas/accesorios con los que cada persona puede vestir a su PIBBI. (Módulo puro, sin Supabase: se prueba en Node.) */
export type PibbiAccessory = 'ninguno' | 'lentes' | 'gorra' | 'mono' | 'corona'

export const PIBBI_ACCESSORIES: { id: PibbiAccessory; name: string }[] = [
  { id: 'ninguno', name: 'Ninguna' },
  { id: 'lentes', name: 'Lentes' },
  { id: 'gorra', name: 'Gorra' },
  { id: 'mono', name: 'Moño' },
  { id: 'corona', name: 'Corona' },
]

export function isPibbiAccessory(v: string | null | undefined): v is PibbiAccessory {
  return v === 'ninguno' || v === 'lentes' || v === 'gorra' || v === 'mono' || v === 'corona'
}
