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

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Normaliza un monto tecleado ("1,250.50" / "1250,50") a número. */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[$\s]/g, '').replace(',', '.')
  const n = Number(cleaned)
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
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16)
}
