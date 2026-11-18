import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../App'
import type { Transaction, TxType, Visibility } from '../types'
import { formatMoney, parseAmount, todayIso } from '../lib/format'
import { splitPctFor, type SplitMode } from '../lib/split'
import { supabase } from '../lib/supabase'
import { mensajeHumano } from '../lib/errores'
import {
  Alerta, Boton, Campo, IconoGasto, IconoIngreso, IconoTransferencia, IconoX,
} from './ui'

interface Props {
  data: AppData
  onClose: () => void
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'>) => Promise<void>
}

interface ErroresCampo { monto?: string; categoria?: string; cuenta?: string }

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
  // Hogar de 1 persona: no hay con quién dividir, quien paga lo absorbe todo.
  const [splitMode, setSplitMode] = useState<SplitMode>(data.partner ? '50/50' : 'absorbe_todo')
  const [customPct, setCustomPct] = useState(50)
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('compartida')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<ErroresCampo>({})

  // Cerrar con Escape para accesibilidad de teclado
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const currency = data.household?.currency ?? 'MXN'
  const isPaidByMe = paidBy === data.me?.id
  const amount = parseAmount(amountRaw)
  const categories = useMemo(
    () => data.categories.filter((c) => (type === 'ingreso' ? c.group === 'Ingresos' : c.group !== 'Ingresos')),
    [data.categories, type],
  )
  const splitPct = splitPctFor(splitMode, customPct)
  const otherShare = type === 'gasto' ? Math.round(amount * ((100 - splitPct) / 100) * 100) / 100 : 0

  async function handleSave() {
    const e: ErroresCampo = {}
    if (!amount) e.monto = 'Escribe un monto mayor a $0.'
    if (type !== 'transferencia' && !categoryId) e.categoria = 'Elige una categoría.'
    if (!accountId) e.cuenta = 'Elige una cuenta.'
    setErrores(e)
    if (Object.keys(e).length > 0 || !data.me) return
    setSaving(true)
    setError(null)
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
    } catch (err) {
      setError(mensajeHumano(err, 'No se pudo guardar. Inténtalo de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  const segmentos: Array<{ t: TxType; etiqueta: string; icono: React.ReactNode; activo: string }> = [
    { t: 'gasto', etiqueta: 'Gasto', icono: <IconoGasto className="h-4 w-4" />, activo: 'bg-rojosuave/15 text-rojosuave' },
    { t: 'ingreso', etiqueta: 'Ingreso', icono: <IconoIngreso className="h-4 w-4" />, activo: 'bg-verde/15 text-verde' },
    { t: 'transferencia', etiqueta: 'Transferencia', icono: <IconoTransferencia className="h-4 w-4" />, activo: 'bg-menta/15 text-menta' },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] animate-aparecer sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-tarjeta p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-elevado animate-hoja-subir sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-borde sm:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 id="quick-add-title" className="font-display text-lg font-bold">Nuevo movimiento</h2>
          <button onClick={onClose} aria-label="Cerrar modal" className="rounded-full bg-elevado p-2 text-humo transition hover:text-crema active:scale-90">
            <IconoX className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {segmentos.map(({ t, etiqueta, icono, activo }) => (
            <button key={t} type="button" onClick={() => { setType(t); setError(null); setErrores({}) }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition active:scale-95 ${type === t ? activo : 'bg-elevado text-humo'}`}>
              {icono}{etiqueta}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-sm font-semibold text-crema" htmlFor="qa-monto">Monto ({currency})</label>
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-display text-xl font-bold text-humo">$</span>
          <input
            id="qa-monto"
            autoFocus
            inputMode="decimal"
            value={amountRaw}
            onChange={(e) => { setAmountRaw(e.target.value); setErrores((x) => ({ ...x, monto: undefined })); setError(null) }}
            placeholder="0.00"
            aria-invalid={Boolean(errores.monto)}
            className={`nums w-full rounded-2xl border bg-elevado py-3.5 pl-9 pr-3.5 font-display text-3xl font-extrabold tracking-tight text-crema placeholder:text-humo/50 transition-colors focus:border-foco ${errores.monto ? 'border-rojosuave ring-1 ring-rojosuave/40' : 'border-borde'}`}
          />
        </div>
        {errores.monto && <p role="alert" className="-mt-3 mb-3 text-xs font-medium text-rojosuave">{errores.monto}</p>}

        {type !== 'transferencia' && (
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-semibold text-crema" htmlFor="qa-categoria">Categoría</label>
            <select id="qa-categoria" value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setErrores((x) => ({ ...x, categoria: undefined })); setError(null) }}
              aria-invalid={Boolean(errores.categoria)}
              className={`w-full rounded-xl border bg-tarjeta p-3 transition-colors focus:border-foco ${errores.categoria ? 'border-rojosuave ring-1 ring-rojosuave/40' : 'border-borde'}`}>
              <option value="">Elige una categoría…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            {errores.categoria && <p role="alert" className="mt-1.5 text-xs font-medium text-rojosuave">{errores.categoria}</p>}
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-crema" htmlFor="qa-cuenta">Cuenta</label>
            <select id="qa-cuenta" value={accountId}
              onChange={(e) => { setAccountId(e.target.value); setErrores((x) => ({ ...x, cuenta: undefined })); setError(null) }}
              aria-invalid={Boolean(errores.cuenta)}
              className={`w-full rounded-xl border bg-tarjeta p-3 transition-colors focus:border-foco ${errores.cuenta ? 'border-rojosuave ring-1 ring-rojosuave/40' : 'border-borde'}`}>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {errores.cuenta && <p role="alert" className="mt-1.5 text-xs font-medium text-rojosuave">{errores.cuenta}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-crema" htmlFor="qa-pagador">Quién pagó</label>
            <select id="qa-pagador" value={paidBy} onChange={(e) => { setPaidBy(e.target.value); setError(null) }}
              className="w-full rounded-xl border border-borde bg-tarjeta p-3 transition-colors focus:border-foco">
              {[data.me, data.partner].filter(Boolean).map((u) => <option key={u!.id} value={u!.id}>{u!.name}</option>)}
            </select>
          </div>
        </div>

        {type === 'gasto' && data.partner && (
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-semibold text-crema">¿Cómo se divide?</label>
            <div className="grid grid-cols-3 gap-2">
              {(['50/50', 'personalizado', 'absorbe_todo'] as SplitMode[]).map((m) => (
                <button key={m} type="button" onClick={() => setSplitMode(m)}
                  className={`rounded-xl py-2 text-xs font-semibold transition active:scale-95 ${splitMode === m ? 'bg-dorado text-tinta' : 'bg-elevado text-humo'}`}>
                  {m === '50/50' ? '50 / 50' : m === 'personalizado' ? 'Personalizado' : 'Lo absorbe todo'}
                </button>
              ))}
            </div>
            {splitMode === 'personalizado' && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <input type="range" min={0} max={100} value={customPct} onChange={(e) => setCustomPct(Number(e.target.value))} aria-label="Porcentaje que absorbe quien pagó" className="flex-1" />
                <span className="nums">{isPaidByMe ? 'Yo absorbo' : (data.partner?.name ?? 'Tu pareja') + ' absorbe'} {customPct}%</span>
              </div>
            )}
            {otherShare > 0 && (
              <p className="mt-1 text-sm text-humo">
                {isPaidByMe
                  ? `Tu pareja te debe ${formatMoney(otherShare, currency)} por este gasto.`
                  : `Le debes a tu pareja ${formatMoney(otherShare, currency)} por este gasto.`}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Campo etiqueta="Comercio" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Ej. OXXO, Walmart…" />
          <Campo etiqueta="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Para qué fue?" />
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-crema" htmlFor="qa-visibilidad">Visibilidad</label>
            <select id="qa-visibilidad" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="w-full rounded-xl border border-borde bg-tarjeta p-3 transition-colors focus:border-foco">
              <option value="compartida">Compartida (todo visible)</option>
              <option value="solo_saldo">Solo saldo (sin detalle)</option>
              <option value="privada">Privada (solo yo la veo)</option>
            </select>
          </div>
        </div>

        {error && <div className="mt-3"><Alerta>{error}</Alerta></div>}
        <Boton onClick={handleSave} cargando={saving} className="mt-4 w-full">Guardar movimiento</Boton>
        {type === 'transferencia' && <p className="mt-2 text-center text-xs text-humo">Las transferencias entre cuentas propias no cuentan como gasto en los reportes.</p>}
      </div>
    </div>
  )
}