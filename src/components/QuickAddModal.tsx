import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import type { Transaction, TxType, Visibility } from '../types'
import { parseAmount, todayIso } from '../lib/format'
import { splitPctFor, type SplitMode } from '../lib/split'
import { supabase } from '../lib/supabase'

interface Props {
  data: AppData
  onClose: () => void
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'>) => Promise<void>
}

/**
 * Captura rápida en ≤3 toques: monto → categoría → guardar.
 * El botón "+" fijo la abre desde cualquier pantalla.
 */
export default function QuickAddModal({ data, onClose, onSave }: Props) {
  const [amountRaw, setAmountRaw] = useState('')
  const [type, setType] = useState<TxType>('gasto')
  const [categoryId, setCategoryId] = useState<string>('')
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(data.me?.id ?? '')
  const [splitMode, setSplitMode] = useState<SplitMode>('50/50')
  const [customPct, setCustomPct] = useState(50)
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('compartida')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseAmount(amountRaw)
  const categories = useMemo(
    () => data.categories.filter((c) => (type === 'ingreso' ? c.group === 'Ingresos' : c.group !== 'Ingresos')),
    [data.categories, type],
  )
  const splitPct = splitPctFor(splitMode, customPct)
  const otherShare = type === 'gasto' ? Math.round(amount * ((100 - splitPct) / 100) * 100) / 100 : 0

  async function handleSave() {
    if (!amount || !data.me) { setError('Escribe un monto mayor a $0.'); return }
    if (type !== 'transferencia' && !categoryId) { setError('Elige una categoría.'); return }
    if (!accountId) { setError('Elige una cuenta.'); return }
    setSaving(true)
    try {
      // Regla por comercio: al guardar con categoría, recordamos el comercio
      // para aplicarla automáticamente a futuros movimientos.
      if (merchant.trim() && categoryId) {
        await supabase.from('rules').upsert(
          { household_id: data.household!.id, pattern: merchant.trim().toLowerCase(), category_id: categoryId },
          { onConflict: 'household_id,pattern' },
        )
      }
      await onSave({
        account_id: accountId,
        category_id: type === 'transferencia' ? null : categoryId,
        created_by: data.me.id,
        paid_by: type === 'ingreso' ? data.me.id : paidBy,
        type,
        amount,
        date: todayIso(),
        merchant: merchant.trim() || null,
        note: note.trim() || null,
        split_pct: splitPct,
        visibility,
        review_status: 'aprobado',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 dark:bg-stone-900 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo movimiento</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full bg-stone-100 px-3 py-1 dark:bg-stone-800">✕</button>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {(['gasto', 'ingreso', 'transferencia'] as TxType[]).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`rounded-xl py-2 text-sm font-semibold capitalize ${type === t ? (t === 'gasto' ? 'bg-red-100 text-red-700' : t === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700') : 'bg-stone-100 text-stone-600 dark:bg-stone-800'}`}>
              {t}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm text-stone-500">Monto ({data.household?.currency ?? 'MXN'})</label>
        <input autoFocus inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)}
          placeholder="0.00" className="mb-3 w-full rounded-xl border border-stone-300 p-3 text-2xl font-bold dark:border-stone-700" />

        {type !== 'transferencia' && (
          <>
            <label className="mb-1 block text-sm text-stone-500">Categoría</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mb-3 w-full rounded-xl border border-stone-300 p-3 dark:border-stone-700">
              <option value="">Elige una categoría…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm text-stone-500">Cuenta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-xl border border-stone-300 p-3 dark:border-stone-700">
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-stone-500">Quién pagó</label>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="w-full rounded-xl border border-stone-300 p-3 dark:border-stone-700">
              {[data.me, data.partner].filter(Boolean).map((u) => <option key={u!.id} value={u!.id}>{u!.name}</option>)}
            </select>
          </div>
        </div>

        {type === 'gasto' && (
          <div className="mb-3">
            <label className="mb-1 block text-sm text-stone-500">¿Cómo se divide?</label>
            <div className="grid grid-cols-3 gap-2">
              {(['50/50', 'personalizado', 'absorbe_todo'] as SplitMode[]).map((m) => (
                <button key={m} onClick={() => setSplitMode(m)}
                  className={`rounded-xl py-2 text-xs font-semibold ${splitMode === m ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800'}`}>
                  {m === '50/50' ? '50 / 50' : m === 'personalizado' ? 'Personalizado' : 'Lo absorbo todo'}
                </button>
              ))}
            </div>
            {splitMode === 'personalizado' && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <input type="range" min={0} max={100} value={customPct} onChange={(e) => setCustomPct(Number(e.target.value))} className="flex-1" />
                <span>Yo pago {customPct}%</span>
              </div>
            )}
            {otherShare > 0 && <p className="mt-1 text-sm text-stone-500">Tu pareja te debe ${otherShare.toFixed(2)} por este gasto.</p>}
          </div>
        )}

        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Comercio (ej. OXXO, Walmart…)"
          className="mb-2 w-full rounded-xl border border-stone-300 p-3 dark:border-stone-700" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)"
          className="mb-3 w-full rounded-xl border border-stone-300 p-3 dark:border-stone-700" />

        <label className="mb-1 block text-sm text-stone-500">Visibilidad</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className="mb-4 w-full rounded-xl border border-stone-300 p-3 dark:border-stone-700">
          <option value="compartida">Compartida (todo visible)</option>
          <option value="solo_saldo">Solo saldo (sin detalle)</option>
          <option value="privada">Privada (solo yo la veo)</option>
        </select>

        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <button onClick={handleSave} disabled={saving}
          className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar movimiento'}
        </button>
        {type === 'transferencia' && <p className="mt-2 text-center text-xs text-stone-500">Las transferencias entre cuentas propias no cuentan como gasto en los reportes.</p>}
      </div>
    </div>
  )
}
