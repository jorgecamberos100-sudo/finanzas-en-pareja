/** Formato de moneda es-MX, MXN por defecto. */
export function formatMoney(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatMoneyShort(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

export function formatDateEs(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
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
 * Fecha YYYY-MM-DD de "hoy" en la zona horaria del dispositivo.
 * Antes usaba UTC (new Date().toISOString()): a las 23:30 en Tijuana
 * ya era mañana en UTC y la fecha quedaba un día corrida.
 * Nunca se hardcodea una zona: en Tijuana es America/Tijuana.
 */
export function todayIso(timezone?: string | null): string {
  const tz = timezone ?? deviceTimeZone()
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Normaliza un monto tecleado a número. Acepta "$1,500.50", "1.500,50",
 *  "1500,50", "1,500", "$89.50" y "89,50": el último separador (coma o punto)
 *  es el decimal y los demás son separadores de miles. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[$\s ]/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Hay ambos: el último es el decimal, el otro son miles.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    const dec = s.slice(lastComma + 1)
    // Una sola coma con 1-2 decimales = decimal; si no, son miles ("1,500").
    s = s.indexOf(',') === lastComma && dec.length >= 1 && dec.length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (lastDot !== -1) {
    const dec = s.slice(lastDot + 1)
    if (s.indexOf('.') === lastDot && dec.length === 3) s = s.replace('.', '') // "1.500" = 1500
    else if (s.indexOf('.') !== lastDot) s = dec.length <= 2 ? s.slice(0, lastDot).replace(/\./g, '') + '.' + dec : s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

/** Hash estable para deduplicación de CSV: fecha + monto + comercio + cuenta. */
export async function dedupeHash(input: {
  date: string
  amount: number
  merchant: string
  account_id: string
}): Promise<string> {
  const text = [input.date, input.amount.toFixed(2), input.merchant.trim().toLowerCase(), input.account_id]
    .join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Fallback síncrono (sin WebCrypto) para el hash de deduplicación. */
export function dedupeHashSync(input: { date: string; amount: number; merchant: string; account_id: string }): string {
  const text = [input.date, input.amount.toFixed(2), input.merchant.trim().toLowerCase(), input.account_id].join('|')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
