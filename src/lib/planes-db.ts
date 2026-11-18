import { supabase } from './supabase'
import { PLANES } from './planes'
import type { HouseholdPlan, PlanId } from '../types'

/**
 * Acceso a Supabase de los planes (tabla `household_plan`, migración 005).
 * Vive separado de lib/planes.ts para que ese módulo sea lógica pura
 * (sin cliente de Supabase ni DOM) y se pueda probar en Node.
 */

export interface IncrementoCaptura {
  allowed: boolean
  used: number
  limit: number
  plan: PlanId
}

/**
 * Lee el plan del hogar. null = sin fila (hogar anterior a la migración
 * o migración aún no aplicada): se trata como Free. Nunca lanza: si la
 * tabla no existe, devuelve null y la app sigue funcionando como Free.
 */
export async function cargarPlan(householdId: string): Promise<HouseholdPlan | null> {
  try {
    const { data, error } = await supabase
      .from('household_plan')
      .select('*')
      .eq('household_id', householdId)
      .maybeSingle()
    if (error || !data) return null
    return data as HouseholdPlan
  } catch {
    return null
  }
}

/**
 * Suma 1 captura con IA al contador mensual (RPC SECURITY DEFINER, atómica).
 * Se llama tras confirmar una captura en el chat y desde capture-confirm.
 * null = la función aún no existe en la BD (migración 005 sin aplicar):
 * el contador simplemente no se registra hasta aplicarla.
 */
export async function registrarCapturaIA(householdId: string): Promise<IncrementoCaptura | null> {
  try {
    const { data, error } = await supabase.rpc('increment_ai_capture', { p_household_id: householdId })
    if (error || !data) return null
    const row = (Array.isArray(data) ? data[0] : data) as {
      allowed?: unknown
      used?: unknown
      limit_captures?: unknown
      plan?: unknown
    } | undefined
    if (!row) return null
    return {
      allowed: row.allowed === true,
      used: typeof row.used === 'number' ? row.used : 0,
      limit: typeof row.limit_captures === 'number' ? row.limit_captures : PLANES.free.capturasIaMes,
      plan: row.plan === 'plus' || row.plan === 'fundadores' ? row.plan : 'free',
    }
  } catch {
    return null
  }
}

/**
 * Activa un plan a mano (solo admin del hogar). Vía MANUAL para pruebas y
 * para activar Plus/Fundadores hasta conectar Stripe: NO es el cobro.
 * Cuando Stripe se conecte, su webhook (service_role) será quien escriba
 * el plan. Fundadores asigna el siguiente número del 1 al 100.
 */
export async function activarPlanManual(
  householdId: string,
  plan: PlanId,
): Promise<{ ok: boolean; error?: string; foundersNumber?: number | null }> {
  try {
    const { data, error } = await supabase.rpc('set_household_plan', {
      p_household_id: householdId,
      p_plan: plan,
    })
    if (error) return { ok: false, error: error.message }
    const row = (Array.isArray(data) ? data[0] : data) as { founders_number?: unknown } | undefined
    return {
      ok: true,
      foundersNumber: typeof row?.founders_number === 'number' ? row.founders_number : null,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo activar el plan.' }
  }
}
