// Compartido por capture-parse y capture-confirm (Deno, Supabase Edge Functions).
// Sin dependencias externas: validación a mano, sin Zod, para que el deploy
// no dependa de paquetes pesados. La IA NUNCA escribe en BD: solo devuelve
// propuestas JSON que el usuario debe confirmar explícitamente.

export type CaptureSourceType = 'text' | 'ticket' | 'notebook' | 'voice'
export type PayerRef = 'current_user' | 'partner' | 'unknown'

export interface ProposedEntry {
  type: 'gasto' | 'ingreso' | 'transferencia'
  amount_minor: number // centavos enteros: 35000 = $350.00 MXN
  merchant: string | null
  category: string | null
  category_id?: string | null
  occurred_at: string // YYYY-MM-DD, en la zona horaria del dispositivo que captura
  payer: PayerRef
  split_pct: number
  note: string | null
  line_items?: string[]
  original_text: string
  needs_review: string[]
}

export interface CaptureResult {
  currency: 'MXN'
  source_type: CaptureSourceType
  entries: ProposedEntry[]
  requires_confirmation: true
  provider?: string
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Fecha YYYY-MM-DD de "hoy" en la zona horaria dada.
 * La zona la envía el frontend (la del dispositivo que captura, ej.
 * "America/Tijuana" para George). Si no se envía o no es válida, se usa
 * la zona del entorno (UTC en el servidor). NUNCA se hardcodea una zona
 * concreta: un gasto a las 23:30 en Tijuana es 01:30 del día siguiente
 * en CDMX, y con CDMX hardcodeada la fecha quedaba un día corrida.
 */
export function todayIsoForTimezone(timezone?: string | null): string {
  const tz = isValidTimeZone(timezone) ? timezone : undefined
  // 'en-CA' formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Suma días calendario a una fecha YYYY-MM-DD (a prueba de cambios de horario). */
export function addDaysToIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function yesterdayIsoForTimezone(timezone?: string | null): string {
  return addDaysToIso(todayIsoForTimezone(timezone), -1)
}

export function sanitizeCaptureResult(raw: unknown, sourceType: CaptureSourceType, timezone?: string | null): CaptureResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { entries?: unknown }
  if (!Array.isArray(r.entries)) return null
  const entries: ProposedEntry[] = []
  for (const item of r.entries as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue
    const amountMinor = Number(item.amount_minor)
    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) continue
    const type = item.type === 'ingreso' || item.type === 'transferencia' ? item.type : 'gasto'
    const date =
      typeof item.occurred_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.occurred_at) && !Number.isNaN(Date.parse(`${item.occurred_at}T12:00:00`))
        ? item.occurred_at
        : todayIsoForTimezone(timezone)
    const payer: PayerRef = item.payer === 'partner' || item.payer === 'current_user' ? item.payer : 'unknown'
    entries.push({
      type,
      amount_minor: Math.round(amountMinor),
      merchant: typeof item.merchant === 'string' && item.merchant.trim() ? item.merchant.trim().slice(0, 120) : null,
      category: typeof item.category === 'string' && item.category.trim() ? item.category.trim().slice(0, 120) : null,
      category_id: typeof item.category_id === 'string' ? item.category_id : null,
      occurred_at: date,
      payer,
      split_pct: type === 'transferencia' ? 100 : Math.min(100, Math.max(0, Number(item.split_pct ?? 50) || 50)),
      note: typeof item.note === 'string' ? item.note.slice(0, 300) : null,
      line_items: Array.isArray(item.line_items) ? item.line_items.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
      original_text: typeof item.original_text === 'string' ? item.original_text.slice(0, 500) : '',
      needs_review: Array.isArray(item.needs_review) ? item.needs_review.filter((x): x is string => typeof x === 'string') : [],
    })
  }
  if (entries.length === 0) return null
  return { currency: 'MXN', source_type: sourceType, entries, requires_confirmation: true }
}

/** Hash de deduplicación: mismo formato que src/lib/format.ts (fecha|monto|comercio|cuenta). */
export async function dedupeHash(input: { date: string; amount: number; merchant: string; account_id: string }): Promise<string> {
  const text = [input.date, input.amount.toFixed(2), input.merchant.trim().toLowerCase(), input.account_id].join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
  })
}

export const EXTRACTION_PROMPT = `Eres un extractor de movimientos financieros para una pareja en México (es-MX, MXN).
Devuelve SOLO un objeto JSON válido, sin texto fuera del JSON, con esta forma exacta:
{"currency":"MXN","source_type":"text","entries":[{"type":"gasto","amount_minor":35000,"merchant":"Walmart","category":"Súper y mercado","occurred_at":"2026-11-17","payer":"current_user","split_pct":50,"note":null,"line_items":[],"original_text":"Gasté $350 en Walmart","needs_review":[]}],"requires_confirmation":true}
Reglas:
- amount_minor son CENTAVOS enteros (35000 = $350.00). Nunca devuelvas montos en unidades.
- type: "gasto", "ingreso" o "transferencia". Una transferencia entre cuentas propias NO es gasto y NO se divide (split_pct 100).
- payer: "current_user" si pagó quien escribe, "partner" si pagó su pareja, "unknown" si no se sabe. Nunca inventes quién pagó.
- category: usa EXACTAMENTE uno de los nombres de categorías que se te den, o null si no estás seguro.
- occurred_at: fecha YYYY-MM-DD en la zona horaria del dispositivo que captura. "hoy" es la fecha de hoy en esa zona (se te indica en el mensaje del sistema como "Hoy es ..."); "ayer" es el día anterior a esa fecha en esa misma zona. Nunca asumas America/Mexico_City ni ninguna otra zona. Si no hay fecha, usa hoy y pon "date" en needs_review.
- Ticket: 1 movimiento principal (el total) + line_items con los ítems. Libreta con varias líneas: 1 entrada por línea con monto.
- Si un campo es dudoso, ponlo en needs_review (ej. ["category","payer"]). No inventes comercios, montos ni fechas.
- Si no hay ningún monto, devuelve entries vacías.`
