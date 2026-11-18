import { addDaysToIso } from './capture'
import { monthKey } from './format'
import type { HouseholdPlan, PlanId } from '../types'

/**
 * Planes Free / Plus / Fundadores (modelo de negocio decidido, nov 2026).
 *
 *   Free:       $0 — captura manual + chat de texto; 10 capturas con IA al
 *               mes; 3 sobres; 1 meta; historial 90 días; sin exportar CSV.
 *   Plus:       $59 MXN/mes o $399 MXN/año por hogar — IA ilimitada con uso
 *               justo de 300 capturas/mes; sobres y metas ilimitados;
 *               historial completo + exportar CSV.
 *   Fundadores: $699 MXN pago único de por vida, solo los primeros 100
 *               hogares (mismos límites que Plus).
 *
 * Las reglas de los gates viven aquí como funciones puras (probadas en
 * scripts/test-planes.ts) para que la UI solo pregunte y el paywall solo
 * explique. El contador mensual vive en la tabla `household_plan`
 * (migración 005) y solo lo incrementa la función SECURITY DEFINER
 * `increment_ai_capture`: el cliente nunca escribe el contador directo.
 */

export interface PlanDef {
  id: PlanId
  nombre: string
  /** Mensualidad en MXN; null si el plan no tiene mensualidad. */
  precioMensualMxn: number | null
  /** Precio anual en MXN; null si el plan no tiene anualidad. */
  precioAnualMxn: number | null
  /** Pago único en MXN; null si el plan no es de pago único. */
  pagoUnicoMxn: number | null
  /** Capturas con IA al mes (uso justo). */
  capturasIaMes: number
  /** Sobres (categorías con presupuesto) permitidos; Infinity = ilimitados. */
  sobresMax: number
  /** Metas permitidas; Infinity = ilimitadas. */
  metasMax: number
  /** Días de historial visibles; Infinity = historial completo. */
  historialDias: number
  /** Exportar el CSV de movimientos. */
  exportaCsv: boolean
  descripcion: string
}

export const PLANES: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    nombre: 'Free',
    precioMensualMxn: 0,
    precioAnualMxn: 0,
    pagoUnicoMxn: null,
    capturasIaMes: 10,
    sobresMax: 3,
    metasMax: 1,
    historialDias: 90,
    exportaCsv: false,
    descripcion: 'Captura manual y chat de texto, 10 capturas con IA al mes, 3 sobres, 1 meta y 90 días de historial.',
  },
  plus: {
    id: 'plus',
    nombre: 'Plus',
    precioMensualMxn: 59,
    precioAnualMxn: 399,
    pagoUnicoMxn: null,
    capturasIaMes: 300,
    sobresMax: Infinity,
    metasMax: Infinity,
    historialDias: Infinity,
    exportaCsv: true,
    descripcion: 'Capturas con IA ilimitadas (uso justo: 300 al mes), sobres y metas sin límite, historial completo y exportar CSV.',
  },
  fundadores: {
    id: 'fundadores',
    nombre: 'Fundadores',
    precioMensualMxn: null,
    precioAnualMxn: null,
    pagoUnicoMxn: 699,
    capturasIaMes: 300,
    sobresMax: Infinity,
    metasMax: Infinity,
    historialDias: Infinity,
    exportaCsv: true,
    descripcion: 'Lo mismo que Plus, de por vida, por un solo pago de $699. Solo para los primeros 100 hogares.',
  },
}

/** Plan del hogar: sin fila en la BD, el hogar es Free. */
export function planActual(row: HouseholdPlan | null | undefined): PlanId {
  return row?.plan ?? 'free'
}

export function defPlan(row: HouseholdPlan | null | undefined): PlanDef {
  return PLANES[planActual(row)]
}

/**
 * Capturas con IA usadas este mes. Si la fila es de un mes anterior, el
 * contador ya caducó (el servidor lo reinicia al incrementar): se lee 0.
 */
export function capturasUsadas(row: HouseholdPlan | null | undefined, hoyKey: string = monthKey()): number {
  if (!row) return 0
  if (row.ai_captures_month_key !== hoyKey) return 0
  return Math.max(0, row.ai_captures_month)
}

export function capturasRestantes(row: HouseholdPlan | null | undefined, hoyKey: string = monthKey()): number {
  const def = defPlan(row)
  return Math.max(0, def.capturasIaMes - capturasUsadas(row, hoyKey))
}

/** ¿El hogar puede usar la captura con IA ahora mismo? */
export function puedeUsarIA(row: HouseholdPlan | null | undefined, hoyKey: string = monthKey()): boolean {
  return capturasRestantes(row, hoyKey) > 0
}

/** ¿El hogar puede crear un sobre más (categoría con presupuesto)? */
export function puedeCrearSobre(row: HouseholdPlan | null | undefined, sobresActuales: number): boolean {
  return sobresActuales < defPlan(row).sobresMax
}

/** ¿El hogar puede crear una meta más? */
export function puedeCrearMeta(row: HouseholdPlan | null | undefined, metasActuales: number): boolean {
  return metasActuales < defPlan(row).metasMax
}

/** ¿El hogar puede exportar el CSV de movimientos? */
export function puedeExportarCsv(row: HouseholdPlan | null | undefined): boolean {
  return defPlan(row).exportaCsv
}

/**
 * Fecha de corte del historial (YYYY-MM-DD): los movimientos con fecha
 * anterior están bloqueados en Free. null = historial completo (Plus).
 */
export function corteHistorialIso(row: HouseholdPlan | null | undefined, hoyIso: string): string | null {
  const dias = defPlan(row).historialDias
  if (!Number.isFinite(dias)) return null
  return addDaysToIso(hoyIso, -dias)
}

/** ¿Este movimiento es de hace más de lo que el plan deja ver? */
export function esMovimientoAntiguo(
  row: HouseholdPlan | null | undefined,
  fechaTx: string,
  hoyIso: string,
): boolean {
  const corte = corteHistorialIso(row, hoyIso)
  return corte !== null && fechaTx < corte
}

/** Etiqueta corta del precio para el paywall y los encabezados. */
export function etiquetaPrecio(def: PlanDef): string {
  if (def.id === 'free') return 'Gratis'
  if (def.id === 'fundadores') return '$699 pago único'
  return `$${def.precioMensualMxn}/mes o $${def.precioAnualMxn}/año`
}

// ============ Acceso a Supabase ============
// Las funciones que hablan con Supabase (cargarPlan, registrarCapturaIA,
// activarPlanManual) viven en './planes-db': este módulo es lógica pura
// (sin cliente de Supabase ni DOM) para que se pueda probar en Node
// (scripts/test-planes.ts) igual que lib/capture.ts.

/**
 * PUNTO DE INTEGRACIÓN DE PAGO (Stripe).
 *
 * Hoy NO hay cuenta de Stripe conectada (ni llaves en el código, a
 * propósito), así que el checkout no cobra: devuelve el aviso de que el
 * pago se activará pronto. Cuando George lo indique, aquí se crea la
 * sesión de Stripe Checkout (Edge Function con la llave secreta en los
 * secretos de Supabase, nunca en el cliente) y se redirige al usuario a
 * pagar; el plan se activa con el webhook de Stripe (service_role), no
 * desde el cliente. La activación manual (activarPlanManual) es solo
 * para pruebas.
 */
export function iniciarCheckout(plan: PlanId): { ok: false; mensaje: string } {
  const def = PLANES[plan]
  return {
    ok: false,
    mensaje:
      `El pago de ${def.nombre} (${etiquetaPrecio(def)}) se activará pronto. ` +
      'Por ahora sigues con tu plan actual y nada cambia; te avisaremos cuando el pago con tarjeta esté listo.',
  }
}
