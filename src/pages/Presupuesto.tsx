import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { formatMoney, monthKey } from '../lib/format'
import { monthTotals } from '../lib/split'
import { supabase } from '../lib/supabase'
import EnvelopeCard from '../components/EnvelopeCard'
import type { Category } from '../types'

interface Props { data: AppData; onRefresh: () => void }

export default function Presupuesto({ data, onRefresh }: Props) {
  const currency = data.household?.currency ?? 'MXN'
  const month = monthKey()
  const [transferFrom, setTransferFrom] = useState<Category | null>(null)
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { ingresos } = useMemo(() => monthTotals(data.transactions, month), [data.transactions, month])
  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const tx of data.transactions) {
      if (tx.type === 'gasto' && tx.date.startsWith(month) && tx.category_id) {
        m.set(tx.category_id, (m.get(tx.category_id) ?? 0) + tx.amount)
      }
    }
    return m
  }, [data.transactions, month])

  const budgeted = data.categories.filter((c) => c.monthly_limit > 0)
  const totalBudget = budgeted.reduce((s, c) => s + c.monthly_limit, 0)
  const totalSpent = budgeted.reduce((s, c) => s + (spentByCategory.get(c.id) ?? 0), 0)
  // Por asignar = ingresos del mes − lo ya presupuestado. Rollover: lo no gastado
  // de un sobre con rollover se suma a su límite del mes siguiente (aquí se
  // muestra como saldo acumulado; la migración guarda rollover por categoría).
  const porAsignar = Math.max(0, ingresos - totalBudget)
  const recurringTotal = data.recurring.reduce((s, r) => s + r.amount, 0)
  const disponibleReal = Math.max(0, porAsignar - recurringTotal)

  async function doTransfer() {
    if (!transferFrom || !transferTo || !transferAmount) return
    const amount = Number(transferAmount)
    if (!amount || amount <= 0) { setError('Escribe un monto válido.'); return }
    const to = data.categories.find((c) => c.id === transferTo)
    if (!to) return
    // Traspaso entre sobres = mover límite, no un gasto.
    const { error: e1 } = await supabase.from('categories').update({ monthly_limit: transferFrom.monthly_limit - amount }).eq('id', transferFrom.id)
    const { error: e2 } = await supabase.from('categories').update({ monthly_limit: to.monthly_limit + amount }).eq('id', to.id)
    if (e1 || e2) { setError('No se pudo hacer el traspaso.'); return }
    setTransferFrom(null); setTransferAmount(''); setTransferTo(''); setError(null)
    onRefresh()
  }

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Presupuesto</h1>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-tarjeta p-3 "><p className="text-xs text-humo">Ingresos</p><p className="font-bold text-verde">{formatMoney(ingresos, currency)}</p></div>
        <div className="rounded-2xl bg-tarjeta p-3 "><p className="text-xs text-humo">Presupuestado</p><p className="font-bold">{formatMoney(totalBudget, currency)}</p></div>
        <div className="rounded-2xl bg-tarjeta p-3 "><p className="text-xs text-humo">Por asignar</p><p className="font-bold text-rosaclaro">{formatMoney(porAsignar, currency)}</p></div>
      </section>
      <p className="text-sm text-humo">
        Recurrentes proyectados este mes: <strong>{formatMoney(recurringTotal, currency)}</strong> · Disponible real tras recurrentes: <strong>{formatMoney(disponibleReal, currency)}</strong>
      </p>

      {budgeted.map((c) => (
        <EnvelopeCard key={c.id} category={c} spent={spentByCategory.get(c.id) ?? 0} currency={currency} onTransfer={setTransferFrom} />
      ))}
      {budgeted.length === 0 && <p className="text-sm text-humo">Sin sobres todavía. Termina el onboarding para crear las categorías.</p>}

      {transferFrom && (
        <div className="rounded-2xl border border-rosafuerte bg-[#F4728F1A] p-4  ">
          <h3 className="font-bold">Traspasar desde {transferFrom.name}</h3>
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="mb-2 mt-2 w-full rounded-xl border p-2">
            <option value="">Hacia…</option>
            {budgeted.filter((c) => c.id !== transferFrom.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} inputMode="decimal" placeholder="Monto" className="mb-2 w-full rounded-xl border p-2" />
          {error && <p className="mb-2 text-sm text-rojosuave">{error}</p>}
          <div className="flex gap-2">
            <button onClick={doTransfer} className="flex-1 rounded-xl bg-rosafuerte py-2 font-bold text-noche">Confirmar traspaso</button>
            <button onClick={() => setTransferFrom(null)} className="rounded-xl bg-borde px-4 ">Cancelar</button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-bold">Recurrentes (gastos fijos y suscripciones)</h2>
        {data.recurring.length === 0 && <p className="text-sm text-humo">Sin recurrentes. Las suscripciones se restan del disponible del mes.</p>}
        {data.recurring.map((r) => (
          <div key={r.id} className="mb-2 flex justify-between rounded-2xl border border-borde bg-tarjeta p-3 text-sm  ">
            <span>🔁 {r.title} · día {r.due_day}</span><strong>{formatMoney(r.amount, currency)}</strong>
          </div>
        ))}
        <p className="text-xs text-humo">Total gastado en sobres este mes: {formatMoney(totalSpent, currency)} de {formatMoney(totalBudget, currency)} presupuestados.</p>
      </section>
    </main>
  )
}
