import type { Category, ProposedReminder, ReminderRecurrence, TxType } from '../types'

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
  /**
   * Propuestas de RECORDATORIO (no movimientos): el usuario pidió que le
   * avisaran de un pago futuro ("recuérdame pagar..."). Se confirman por
   * separado y nunca se guardan como movimientos. Ver lib/reminders.ts.
   */
  reminders?: ProposedReminder[]
}

export function amountMinorToUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100
}

export function unitsToAmountMinor(amount: number): number {
  return Math.round(amount * 100)
}

/** Zona horaria del dispositivo que captura (ej. "America/Tijuana"). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Fecha YYYY-MM-DD de "hoy" en la zona horaria dada.
 * Nunca se hardcodea una zona: a las 23:30 en Tijuana todavía es hoy
 * en Tijuana, pero en UTC (y en CDMX) ya es mañana.
 */
export function todayIsoForTimezone(timezone?: string | null): string {
  const tz = timezone ?? deviceTimeZone()
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function yesterdayIso(timezone?: string | null): string {
  return yesterdayIsoForTimezone(timezone)
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

/** Sustantivos de cantidad: el número que les precede no es dinero ("2 cosas", "3 kilos"). */
const COUNT_NOUNS = [
  'cosas', 'piezas', 'articulos', 'unidades', 'kilos', 'kilogramos', 'litros',
  'paquetes', 'bolsas', 'cajas', 'docenas', 'personas', 'huevos', 'panes',
  'botellas', 'latas', 'boletos', 'entradas',
]

const MONTHS_ES_PATTERN = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'

/** Todos los montos con $ o seguidos de "pesos"/"mxn" en el texto.
 *  Las fechas NO son montos: antes "compré 2 cosas por 50 el 12/11/2026"
 *  devolvía [2, 50, 12, 11, 2026] y la propuesta tomaba $2. Ahora se
 *  quitan las fechas (12/11/2026, 2026-11-12, "12 de noviembre") y los
 *  años sueltos (2026), y se ignoran las cantidades ("2 cosas"). */
export function extractAmounts(text: string): number[] {
  const cleaned = text
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(new RegExp(`\\b(?:el\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTHS_ES_PATTERN})\\b`, 'gi'), ' ')
    // Año suelto (2026) salvo que sea monto con $ o "pesos" ("$2026", "2026 pesos").
    .replace(/\b(?:19|20)\d{2}\b/g, (y, offset: number, s: string) => {
      const before = s.slice(Math.max(0, offset - 3), offset)
      const after = s.slice(offset + y.length, offset + y.length + 8)
      if (/\$\s*$/.test(before) || /^\s*(pesos|mxn|varos)\b/i.test(after)) return y
      return ' '
    })
  // Montos agrupados con separador (1,250.50) o lisos de cualquier longitud (2350).
  // OJO: el primer alternativo exige al menos un grupo de miles, si no
  // "2350" se partía en "235" y el resto se perdía.
  const re = /\$?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*(?:pesos|mxn|varos)?/gi
  const out: number[] = []
  for (const m of cleaned.matchAll(re)) {
    if (!m[0].includes('$')) {
      const after = cleaned.slice((m.index ?? 0) + m[0].length)
      if (new RegExp(`^\\s*(?:${COUNT_NOUNS.join('|')})\\b`, 'i').test(after)) continue
    }
    const n = parseMoneyToken(m[1])
    if (n > 0) out.push(n)
  }
  return out
}

export function parseDateEs(text: string, timezone?: string | null): { date: string; found: boolean } {
  const t = normalize(text)
  if (/\banteayer\b/.test(t)) {
    return { date: addDaysToIso(todayIsoForTimezone(timezone), -2), found: true }
  }
  if (/\bayer\b/.test(t)) return { date: yesterdayIso(timezone), found: true }
  if (/\bhoy\b/.test(t)) return { date: todayIsoForTimezone(timezone), found: true }
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})/) ?? text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const iso = m[0].includes('/')
      ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      : m[0]
    if (!Number.isNaN(Date.parse(`${iso}T12:00:00`))) return { date: iso, found: true }
  }
  return { date: todayIsoForTimezone(timezone), found: false }
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
  /** Zona horaria del dispositivo que captura (ej. "America/Tijuana"). */
  timezone?: string | null
}

/** Una línea / un mensaje -> una propuesta (o null si no hay monto). */
export function parseLineToEntry(line: string, opts: ParseOptions): ProposedEntry | null {
  const amounts = extractAmounts(line)
  if (amounts.length === 0) return null
  // En un ticket el total suele ser el monto mayor; en texto, el primero.
  const amount = opts.sourceType === 'ticket' ? Math.max(...amounts) : amounts[0]
  const type = detectType(line)
  const category = type === 'transferencia' ? null : findCategory(line, opts.categories)
  const { date, found: dateFound } = parseDateEs(line, opts.timezone)
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
    // Una frase con varios montos ("$60 en el camión y $40 en un elote"):
    // intentar partir por " y " y parsear cada cláusula con monto.
    const amounts = extractAmounts(text)
    if (amounts.length > 1) {
      const clauses = text.split(/\s+y\s+/i).map((c) => c.trim()).filter(Boolean)
      const split: ProposedEntry[] = []
      for (const clause of clauses) {
        const e = parseLineToEntry(clause, opts)
        if (e) split.push(e)
      }
      if (split.length > 1) return { currency: 'MXN', source_type: sourceType, entries: split, requires_confirmation: true, provider: 'local', raw_text: text.slice(0, 1000) }
    }
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

/** Sanea una propuesta de recordatorio que viene de la IA (capture-parse). */
export function sanitizeProposedReminder(raw: unknown, timezone?: string | null): ProposedReminder | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 200) : null
  if (!title) return null
  const amountMinor = r.amount_minor === null || r.amount_minor === undefined ? null : Number(r.amount_minor)
  if (amountMinor !== null && (!Number.isFinite(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000)) return null
  const dueDate =
    typeof r.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date) && !Number.isNaN(Date.parse(`${r.due_date}T12:00:00`))
      ? r.due_date
      : todayIsoForTimezone(timezone)
  const recurrence: ReminderRecurrence =
    r.recurrence === 'daily' || r.recurrence === 'weekly' || r.recurrence === 'monthly' || r.recurrence === 'yearly' ? r.recurrence : 'once'
  return {
    title,
    amount_minor: amountMinor !== null ? Math.round(amountMinor) : null,
    due_date: dueDate,
    due_time: typeof r.due_time === 'string' && /^\d{2}:\d{2}$/.test(r.due_time) ? r.due_time : null,
    recurrence,
    category: typeof r.category === 'string' && r.category.trim() ? r.category.trim().slice(0, 120) : null,
    category_id: typeof r.category_id === 'string' ? r.category_id : null,
    note: typeof r.note === 'string' ? r.note.slice(0, 300) : null,
    original_text: typeof r.original_text === 'string' ? r.original_text.slice(0, 500) : '',
    needs_review: Array.isArray(r.needs_review) ? r.needs_review.filter((x): x is string => typeof x === 'string') : [],
  }
}

/** Valida / sanea una propuesta que viene de la IA antes de mostrarla. */
export function sanitizeCaptureResult(raw: unknown, sourceType: CaptureSourceType): CaptureResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { entries?: unknown; currency?: unknown; reminders?: unknown }
  if (!Array.isArray(r.entries)) return null
  const entries: ProposedEntry[] = []
  for (const item of r.entries as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue
    const amountMinor = Number(item.amount_minor)
    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) continue
    const type = item.type === 'ingreso' || item.type === 'transferencia' ? item.type : 'gasto'
    const date = typeof item.occurred_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.occurred_at) ? item.occurred_at : todayIsoForTimezone()
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
  // Recordatorios: se pasan tal cual, aunque no haya movimientos (un
  // "recuérdame pagar..." no es un gasto, no va en entries).
  const reminders = Array.isArray(r.reminders)
    ? r.reminders.map((x) => sanitizeProposedReminder(x)).filter((x): x is ProposedReminder => x !== null)
    : []
  if (entries.length === 0 && reminders.length === 0) return null
  return { currency: 'MXN', source_type: sourceType, entries, requires_confirmation: true, reminders }
}
