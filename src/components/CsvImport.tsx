import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { dedupeHashSync, formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'

interface Props {
  data: AppData
  onDone: () => void
}

interface ParsedRow {
  date: string
  merchant: string
  amount: number
  type: 'gasto' | 'ingreso'
  category_id: string | null
  hash: string
  duplicate: boolean
  ruleApplied: boolean
}

/** Parsea CSV simple (coma o punto y coma), con encabezados flexibles. */
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/["\ufeff]/g, ''))
  return lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}

const DATE_KEYS = ['fecha', 'date']
const MERCHANT_KEYS = ['comercio', 'merchant', 'descripcion', 'description', 'concepto']
const AMOUNT_KEYS = ['monto', 'amount', 'importe', 'total']

export default function CsvImport({ data, onDone }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const currency = data.household?.currency ?? 'MXN'

  const existingHashes = useMemo(
    () => new Set(data.transactions.map((t) => t.dedupe_hash).filter(Boolean)),
    [data.transactions],
  )

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    const text = await file.text()
    const raw = parseCsv(text)
    // Traer todas las reglas del hogar en una sola consulta para no hacer
    // una petición por cada fila del CSV (evita N consultas secuenciales).
    const { data: rulesData } = await supabase
      .from('rules')
      .select('category_id, pattern')
      .eq('household_id', data.household!.id)
    const householdRules = rulesData ?? []

    const parsed: ParsedRow[] = []
    for (const r of raw) {
      const date = DATE_KEYS.map((k) => r[k]).find(Boolean) ?? ''
      const merchant = MERCHANT_KEYS.map((k) => r[k]).find(Boolean) ?? 'Sin comercio'
      const amountRaw = AMOUNT_KEYS.map((k) => r[k]).find(Boolean) ?? '0'
      const amount = Math.abs(Number(amountRaw.replace(/[$,\s]/g, ''))) || 0
      if (!date || !amount) continue
      const hash = dedupeHashSync({ date, amount, merchant, account_id: accountId })
      const mLower = merchant.toLowerCase()
      const rule = householdRules.find((rl) => mLower.includes(rl.pattern.toLowerCase()))
      parsed.push({
        date, merchant, amount,
        type: Number(amountRaw.replace(/[$,\s]/g, '')) < 0 ? 'gasto' : 'ingreso',
        category_id: rule?.category_id ?? null,
        hash,
        duplicate: existingHashes.has(hash),
        ruleApplied: Boolean(rule),
      })
    }
    setRows(parsed)
  }

  async function importRows() {
    if (!data.household || !data.me || importing) return
    const fresh = rows.filter((r) => !r.duplicate)
    if (fresh.length === 0) {
      setResult(`Todos los movimientos del archivo (${rows.length}) ya estaban registrados como duplicados. No se insertó ninguno nuevo.`)
      return
    }
    setImporting(true)
    setError(null)
    setResult(null)
    const payload = fresh.map((r) => ({
      household_id: data.household!.id,
      account_id: accountId,
      category_id: r.category_id,
      created_by: data.me!.id,
      paid_by: data.me!.id,
      type: r.type,
      amount: r.amount,
      date: r.date,
      merchant: r.merchant,
      note: 'Importado por CSV',
      split_pct: data.household!.default_split,
      visibility: 'compartida' as const,
      review_status: 'pendiente' as const, // van a la cola "Por revisar"
      dedupe_hash: r.hash,
    }))
    const { error: err } = await supabase.from('transactions').insert(payload)
    setImporting(false)
    if (err) { setError(`Error al importar: ${err.message}`); return }
    setResult(`Importados ${fresh.length} movimientos. ${rows.length - fresh.length} duplicados se omitieron. Los nuevos quedan en "Por revisar".`)
    onDone()
  }

  return (
    <div className="rounded-2xl border border-borde bg-tarjeta p-4  ">
      <h3 className="mb-2 font-bold">Importar CSV</h3>
      <p className="mb-3 text-sm text-humo">
        Columnas esperadas: fecha, comercio/descripción y monto. Se deduplica por hash (fecha + monto + comercio + cuenta) y se aplican tus reglas por comercio.
      </p>
      <div className="mb-3 flex gap-2">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta para importar" className="flex-1 rounded-xl border border-borde p-2 ">
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="cursor-pointer rounded-xl bg-rosafuerte px-4 py-2 text-sm font-semibold text-noche">
          Elegir archivo CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
        </label>
      </div>

      {rows.length > 0 && (
        <>
          <div className="mb-3 max-h-64 overflow-auto text-sm">
            <table className="w-full">
              <thead><tr className="text-left text-humo"><th>Fecha</th><th>Comercio</th><th>Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hash} className={r.duplicate ? 'text-humo line-through' : ''}>
                    <td>{r.date}</td><td>{r.merchant}</td><td>{formatMoney(r.amount, currency)}</td>
                    <td>{r.duplicate ? 'Duplicado — se omite' : r.ruleApplied ? 'Regla aplicada' : 'Nuevo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={importRows} disabled={importing} className="w-full rounded-xl bg-rosafuerte py-2 font-extrabold tracking-wide text-noche disabled:opacity-50">
            {importing ? 'Importando…' : `Importar ${rows.filter((r) => !r.duplicate).length} movimientos nuevos`}
          </button>
        </>
      )}
      {error && <div role="alert" className="mt-3 text-sm text-rojosuave">⚠️ {error}</div>}
      {result && <div role="status" className="mt-3 text-sm text-verde">✅ {result}</div>}
    </div>
  )
}
