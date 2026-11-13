import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y completa los valores de Supabase → Settings → API.',
  )
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key')

/** Id del hogar activo (se guarda tras el onboarding / login). */
export const HOUSEHOLD_KEY = 'fp_household_id'
export function getHouseholdId(): string | null {
  return localStorage.getItem(HOUSEHOLD_KEY)
}
export function setHouseholdId(id: string) {
  localStorage.setItem(HOUSEHOLD_KEY, id)
}
export function clearHouseholdId() {
  localStorage.removeItem(HOUSEHOLD_KEY)
}
