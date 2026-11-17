import type { Category, TxType } from '../types'
import { todayIso } from './format'

/**
 * Chat de captura — tipos y parser local (fallback $0, sin red).
 *
 * El esquema JSON es el de la investigación del 17-nov-2026:
 * la IA (Cloudflare Workers AI) devuelve propuestas en este formato y
 * NUNCA guarda en BD. Solo tras confirmación explícita del usuario se
 * convierten en Transaction (ver ChatCapture.tsx / capture-confirm).
 *
 * amounts: amount_minor son CENTAVOS (35000 = $350.00 MXN).
 * En la app, Transaction.amount está en UNIDADES ($350), así que al
 * confirmar hay que dividir entre 100 (amountMinorToUnits).
 */

export type CaptureSourceType = 'text' | 'ticket' | 'notebook' | 'voice'
export type PayerRef = 'current_user' | 'partner' | 'unknown'

export interface ProposedEntry {
  type: TxType
  /** Centavos enteros. Ej. 35000 = $350.00 */
  amount_minor: number
  merchant: string | null
  /** Nombre de categoría tal como está en data.categories, o null. */
  category: string | null
  category_id?: string | null
  occurred_at: string // YYYY-MM-DD
  payer: PayerRef
  /** % que asume quien pagó. 50 = 50/50, 100 = lo absorbe todo. */
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
  /** Qué motor produjo la propuesta: 'cloudflare' | 'groq' | 'zai' | 'local'. */
  provider?: string
  raw_text?: string
  /** Cuando no se pudo proponer nada (ej. falta el monto). */
  message?: string
}

export function amountMinorToUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100
}

export function unitsToAmountMinor(amount: number): number {
  return Math.round(amount * 100)
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function yesterdayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** "1,250.50" / "1.250,50" / "1250" -> número en unidades, o 0. */
export function parseMoneyToken(raw: string): number {
  let s = raw.replace(/[$\s]/g, '')
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s)) s = s.replace(/,/g, '')
  else if (/^\d+,\d{2}$/.test(s)) s = s.replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

/** Todos los montos con $ o seguidos de "pesos"/"mxn" en el texto. */
export function extractAmounts(text: string): number[] {
  const re = /\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*(?:pesos|mxn|varos)?/gi
  const out: number[] = []
  for (const m of text.matchAll(re)) {
    const n = parseMoneyToken(m[1])
    if (n > 0) out.push(n)
  }
  return out
}

export function parseDateEs(text: string): { date: string; found: boolean } {
  const t = normalize(text)
  if (/\banteayer\b/.test(t)) {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    return { date: d.toISOString().slice(0, 10), found: true }
  }
  if (/\bayer\b/.test(t)) return { date: yesterdayIso(), found: true }
  if (/\bhoy\b/.test(t)) return { date: todayIso(), found: true }
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})/) ?? text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const iso = m[0].includes('/')
      ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      : m[0]
    if (!Number.isNaN(Date.parse(`${iso}T12:00:00`))) return { date: iso, found: true }
  }
  return { date: todayIso(), found: false }
}

const MERCHANT_KEYWORDS = [
  'walmart', 'soriana', 'chedraui', 'costco', 'oxxo', 'seven eleven', '7-eleven',
  'cfe', 'telmex', 'izzi', 'totalplay', 'netflix', 'spotify', 'disney', 'amazon',
  'mercado libre', 'liverpool', 'palacio de hierro', 'sams', 'heb', 'bodega aurrera',
  'starbucks', 'uber', 'didi', 'rappi', 'corner shop',
]

/** Palabras clave -> fragmento del nombre de categoría (seed / onboarding). */
const CATEGORY_KEYWORDS: Array<{ match: string[]; category: string }> = [
  { match: ['despensa', 'super', 'mercado', 'walmart', 'soriana', 'chedraui', 'costco', 'oxxo', 'abarrotes', 'verdura', 'fruta', 'tortilla', 'panaderia'], category: 'Súper y mercado' },
  { match: ['gasolina', 'gas ', 'uber', 'didi', 'taxi', 'metro', 'camion', 'transporte', 'estacionamiento', 'tenencia', 'verificacion'], category: 'Gasolina y transporte' },
  { match: ['luz', 'cfe', 'agua', 'internet', 'telmex', 'izzi', 'totalplay', 'telefono', 'celular', 'recibo'], category: 'Luz, agua e internet' },
  { match: ['renta', 'hipoteca', 'alquiler', 'departamento'], category: 'Renta / Hipoteca' },
  { match: ['farmacia', 'doctor', 'medico', 'salud', 'medicina', 'hospital', 'dentista', 'consulta'], category: 'Salud y farmacia' },
  { match: ['restaurante', 'tacos', 'pizza', 'cafe', 'starbucks', 'uber eats', 'rappi', 'cena', 'desayuno', 'comer fuera', 'taqueria'], category: 'Comer fuera' },
  { match: ['cine', 'ocio', 'fiesta', 'concierto', 'juego', 'entretenimiento', 'pelicula'], category: 'Ocio y entretenimiento' },
  { match: ['netflix', 'spotify', 'disney', 'suscripcion', 'membresia', 'gimnasio', 'gym'], category: 'Suscripciones' },
  { match: ['escuela', 'colegiatura', 'curso', 'libro', 'educacion', 'universidad'], category: 'Educación' },
  { match: ['ropa', 'zapatos', 'camisa', 'pantalon', 'liverpool'], category: 'Ropa' },
  { match: ['reparacion', 'emergencia', 'imprevisto', 'taller', 'mecanico'], category: 'Imprevistos' },
  { match: ['ahorro', 'meta', 'vacaciones'], category: 'Ahorro para metas' },
  { match: ['sueldo', 'nomina', 'salario', 'quincena', 'pago de', 'cobro'], category: 'Sueldo' },
]

export function findCategory(text: string, categories: Category[]): Category | null {
  const t = normalize(text)
  // 1. Coincidencia directa con el nombre / grupo de una categoría real.
  for (const c of categories) {
    const name = normalize(c.name)
    const group = normalize(c.group)
    if (t.includes(name) || name.split(' ').some((w) => w.length > 4 && t.includes(w))) return c
    if (t.includes(group)) return c
  }
  // 2. Palabras clave -> nombre de categoría del seed/onboarding.
  for (const kw of CATEGORY_KEYWORDS) {
    if (kw.match.some((m) => t.includes(m))) {
      const hit = categories.find((c) => normalize(c.name).includes(normalize(kw.category).split(' ')[0]) || normalize(c.name) === normalize(kw.category))
      if (hit) return hit
      const byGroup = categories.find((c) => normalize(c.group) === normalize(kw.category))
      if (byGroup) return byGroup
    }
  }
  return null
}

export function extractMerchant(text: string): string | null {
  const t = normalize(text)
  for (const m of MERCHANT_KEYWORDS) if (t.includes(m)) return m
  const m = text.match(/\ben\s+([A-ZÁÉÍÓÚ][\wÁÉÍÓÚáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚ][\wÁÉÍÓÚáéíóúñ]+)?)/)
  if (m) return m[1].trim()
  return null
}

function detectType(text: string): TxType {
  const t = normalize(text)
  if (/\b(transferi|transferencia|traspase|pase de|movi de)\b/.test(t)) return 'transferencia'
  if (/\b(me pagaron|cobre|ingreso|recibi|me depositaron|sueldo|nomina|me transfirieron)\b/.test(t)) return 'ingreso'
  return 'gasto'
}

function detectPayer(text: string, partnerName: string | null): { payer: PayerRef; found: boolean } {
  const t = normalize(text)
  if (/\b(pague yo|yo pague|lo pague yo|yo lo pague|pague con mi)\b/.test(t)) return { payer: 'current_user', found: true }
  if (partnerName && t.includes(normalize(partnerName))) return { payer: 'partner', found: true }
  if (/\b(mi pareja|mi esposa|mi esposo|mi novia|mi novio)\b/.test(t) && /\bpag[oa]\b/.test(t)) return { payer: 'partner', found: true }
  if (/\bpagamos\b/.test(t)) return { payer: 'current_user', found: true }
  return { payer: 'unknown', found: false }
}

function detectSplitPct(text: string): number {
  const t = normalize(text)
  if (/\b(lo absorbo|todo yo|yo lo pago todo|no se divide)\b/.test(t)) return 100
  const m = t.match(/yo pago el (\d{1,3})\s*%|(\d{1,3})\s*%\s*yo/)
  if (m) return Math.min(100, Math.max(0, Number(m[1] ?? m[2])))
  return 50
}

interface ParseOptions {
  categories: Category[]
  partnerName?: string | null
  sourceType?: CaptureSourceType
}

/** Una línea / un mensaje -> una propuesta (o null si no hay monto). */
export function parseLineToEntry(line: string, opts: ParseOptions): ProposedEntry | null {
  const amounts = extractAmounts(line)
  if (amounts.length === 0) return null
  // En un ticket el total suele ser el monto mayor; en texto, el primero.
  const amount = opts.sourceType === 'ticket' ? Math.max(...amounts) : amounts[0]
  const type = detectType(line)
  const category = type === 'transferencia' ? null : findCategory(line, opts.categories)
  const { date, found: dateFound } = parseDateEs(line)
  const { payer, found: payerFound } = detectPayer(line, opts.partnerName ?? null)
  const needsReview: string[] = []
  if (!category && type !== 'transferencia') needsReview.push('category')
  if (!payerFound) needsReview.push('payer')
  if (!dateFound) needsReview.push('date')
  if (amounts.length > 1 && opts.sourceType !== 'ticket') needsReview.push('amount')
  const merchant = extractMerchant(line)
  if (!merchant) needsReview.push('merchant')
  return {
    type,
    amount_minor: unitsToAmountMinor(amount),
    merchant,
    category: category?.name ?? null,
    category_id: category?.id ?? null,
    occurred_at: date,
    payer,
    split_pct: type === 'transferencia' ? 100 : detectSplitPct(line),
    note: null,
    original_text: line.trim().slice(0, 500),
    needs_review: needsReview,
  }
}

/**
 * Parser local en español. Sirve como fallback cuando la Edge Function
 * (Cloudflare / Groq / Z.AI) no está configurada o falla, y para texto
 * simple sin necesidad de red. No inventa montos: sin monto, no hay entrada.
 */
export function parseCaptureText(text: string, opts: ParseOptions): CaptureResult {
  const sourceType = opts.sourceType ?? 'text'
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const entries: ProposedEntry[] = []
  // Libreta: varias líneas, cada una con su monto, son varias entradas.
  const isNotebook = sourceType === 'notebook' || lines.length > 1
  if (isNotebook) {
    for (const line of lines) {
      const e = parseLineToEntry(line, { ...opts, sourceType: 'notebook' })
      if (e) entries.push(e)
    }
  } else {
    const e = parseLineToEntry(text, opts)
    if (e) entries.push(e)
  }
  if (entries.length === 0) {
    return {
      currency: 'MXN',
      source_type: sourceType,
      entries: [],
      requires_confirmation: true,
      provider: 'local',
      raw_text: text.slice(0, 1000),
      message: 'No encontré un monto en ese mensaje. Prueba con algo como: "Gasté $350 en Walmart en despensa, pagué yo".',
    }
  }
  return { currency: 'MXN', source_type: sourceType, entries, requires_confirmation: true, provider: 'local', raw_text: text.slice(0, 1000) }
}

/** Valida / sanea una propuesta que viene de la IA antes de mostrarla. */
export function sanitizeCaptureResult(raw: unknown, sourceType: CaptureSourceType): CaptureResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { entries?: unknown; currency?: unknown }
  if (!Array.isArray(r.entries)) return null
  const entries: ProposedEntry[] = []
  for (const item of r.entries as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue
    const amountMinor = Number(item.amount_minor)
    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) continue
    const type = item.type === 'ingreso' || item.type === 'transferencia' ? item.type : 'gasto'
    const date = typeof item.occurred_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.occurred_at) ? item.occurred_at : todayIso()
    const payer: PayerRef = item.payer === 'partner' || item.payer === 'current_user' ? item.payer : 'unknown'
    const splitPct = type === 'transferencia' ? 100 : Math.min(100, Math.max(0, Number(item.split_pct ?? 50) || 50))
    entries.push({
      type,
      amount_minor: Math.round(amountMinor),
      merchant: typeof item.merchant === 'string' && item.merchant.trim() ? item.merchant.trim().slice(0, 120) : null,
      category: typeof item.category === 'string' && item.category.trim() ? item.category.trim().slice(0, 120) : null,
      category_id: typeof item.category_id === 'string' ? item.category_id : null,
      occurred_at: date,
      payer,
      split_pct: splitPct,
      note: typeof item.note === 'string' ? item.note.slice(0, 300) : null,
      line_items: Array.isArray(item.line_items) ? item.line_items.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
      original_text: typeof item.original_text === 'string' ? item.original_text.slice(0, 500) : '',
      needs_review: Array.isArray(item.needs_review) ? item.needs_review.filter((x): x is string => typeof x === 'string') : [],
    })
  }
  if (entries.length === 0) return null
  return { currency: 'MXN', source_type: sourceType, entries, requires_confirmation: true }
}
