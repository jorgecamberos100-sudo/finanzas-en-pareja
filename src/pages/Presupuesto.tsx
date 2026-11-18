import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { formatMoney, monthKey, parseAmount } from '../lib/format'
import { monthTotals } from '../lib/split'
import { defPlan, puedeCrearSobre } from '../lib/planes'
import { supabase } from '../lib/supabase'
import EnvelopeCard from '../components/EnvelopeCard'
import Mascota from '../components/Mascota'
import PibbiHeader from '../components/PibbiHeader'
import { PAGE_PIBBI_POSES } from '../lib/pibbi-poses'
import Paywall from '../components/Paywall'
import { ChipCategoria, IconoAlerta, IconoReloj } from '../components/ui'
import type { Category } from '../types'

interface Props { data: AppData; onRefresh: () => void }

export default function Presupuesto({ data, onRefresh }: Props) {
  const currency = data.household?.currency ?? 'MXN'
  const month = monthKey()
  const [transferFrom, setTransferFrom] = useState<Category | null>(null)
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [newLimit, setNewLimit] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Motivo del paywall (null = cerrado).
  const [paywall, setPaywall] = useState<string | null>(null)

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
  const unbudgeted = data.categories.filter((c) => c.monthly_limit === 0 && c.group !== 'Ingresos')
  const totalBudget = budgeted.reduce((s, c) => s + c.monthly_limit, 0)
  const totalSpent = budgeted.reduce((s, c) => s + (spentByCategory.get(c.id) ?? 0), 0)
  // Sobres que se pasaron de su límite este mes: PIBBI se preocupa, sin
  // juzgar (propuesta "Emerald Finance": gasto excesivo = expresión
  // preocupada, nunca un regaño).
  const pasados = budgeted.filter((c) => (spentByCategory.get(c.id) ?? 0) > c.monthly_limit)
  // Por asignar = ingresos del mes − lo ya presupuestado. Rollover: lo no gastado
  // de un sobre con rollover se suma a su límite del mes siguiente (aquí se
  // muestra como saldo acumulado; la migración guarda rollover por categoría).
  const porAsignar = Math.max(0, ingresos - totalBudget)
  const recurringTotal = data.recurring.reduce((s, r) => s + r.amount, 0)
  const disponibleReal = Math.max(0, porAsignar - recurringTotal)

  async function doTransfer() {
    if (!transferFrom || !transferTo || !transferAmount || busy) return
    const amount = parseAmount(transferAmount)
    if (!amount || amount <= 0) { setError('Escribe un monto válido mayor a $0.'); return }
    if (amount > transferFrom.monthly_limit) { setError(`El sobre solo tiene ${formatMoney(transferFrom.monthly_limit, currency)} para traspasar.`); return }
    const to = data.categories.find((c) => c.id === transferTo)
    if (!to) return
    setBusy(true)
    setError(null)
    // Traspaso entre sobres = mover límite, no un gasto.
    const { error: e1 } = await supabase.from('categories').update({ monthly_limit: transferFrom.monthly_limit - amount }).eq('id', transferFrom.id)
    if (e1) {
      setBusy(false)
      setError(`No se pudo descontar del sobre de origen: ${e1.message}`)
      return
    }
    const { error: e2 } = await supabase.from('categories').update({ monthly_limit: to.monthly_limit + amount }).eq('id', to.id)
    if (e2) {
      // Revertir descuento de origen si falló la acreditación
      await supabase.from('categories').update({ monthly_limit: transferFrom.monthly_limit }).eq('id', transferFrom.id)
      setBusy(false)
      setError(`No se pudo acreditar al sobre de destino: ${e2.message}`)
      return
    }
    setBusy(false)
    setTransferFrom(null); setTransferAmount(''); setTransferTo(''); setError(null)
    onRefresh()
  }

  async function saveCategoryLimit() {
    if (!editingCategory || busy) return
    const limit = parseAmount(newLimit)
    if (limit < 0) { setError('El límite debe ser mayor o igual a $0.'); return }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('categories').update({ monthly_limit: limit }).eq('id', editingCategory.id)
    setBusy(false)
    if (err) { setError(`No se pudo actualizar el límite: ${err.message}`); return }
    setEditingCategory(null)
    setNewLimit('')
    onRefresh()
  }

  function startEditLimit(c: Category) {
    setEditingCategory(c)
    setNewLimit(String(c.monthly_limit || ''))
    setError(null)
  }

  /**
   * Crear un sobre = asignar presupuesto a una categoría sin presupuesto.
   * En Free el límite es 3 sobres: el 4.º abre el paywall de Plus en vez
   * del editor. Editar el límite de un sobre que ya existe no está limitado.
   */
  function intentarAsignarSobre(c: Category) {
    const def = defPlan(data.plan)
    if (!puedeCrearSobre(data.plan, budgeted.length)) {
      setPaywall(`El plan ${def.nombre} permite ${def.sobresMax} sobres y ya tienes ${budgeted.length}. Con Plus los sobres son ilimitados.`)
      return
    }
    startEditLimit(c)
  }

  return (
    <main className="space-y-5 p-5">
      <PibbiHeader
        pose={PAGE_PIBBI_POSES.presupuesto}
        title="Presupuesto"
        subtitle={<>Plan {defPlan(data.plan).nombre} · {budgeted.length} de {Number.isFinite(defPlan(data.plan).sobresMax) ? defPlan(data.plan).sobresMax : '∞'} sobres</>}
      />

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-tarjeta p-3 "><p className="text-xs text-humo">Ingresos</p><p className="font-bold text-verde">{formatMoney(ingresos, currency)}</p></div>
        <div className="rounded-2xl bg-tarjeta p-3 "><p className="text-xs text-humo">Presupuestado</p><p className="font-bold">{formatMoney(totalBudget, currency)}</p></div>
        <div className="rounded-2xl bg-tarjeta p-3 "><p className="text-xs text-humo">Por asignar</p><p className="font-bold text-doradotexto">{formatMoney(porAsignar, currency)}</p></div>
      </section>
      <p className="text-sm text-humo">
        Recurrentes proyectados este mes: <strong>{formatMoney(recurringTotal, currency)}</strong> · Disponible real tras recurrentes: <strong>{formatMoney(disponibleReal, currency)}</strong>
      </p>

      {pasados.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-borde bg-tarjeta p-3">
          <Mascota pose="pensativo" className="h-14 w-14 shrink-0" />
          <p className="text-sm">
            Te pasaste un poco en {pasados.map((c) => c.name).join(', ')}, sin drama, lo ajustamos el próximo mes.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-rojosuave/10 p-3 text-sm text-rojosuave">
          <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {editingCategory && (
        <div className="rounded-2xl border border-foco/60 bg-doradotenue p-4">
          <h3 className="flex items-center gap-2 font-bold"><ChipCategoria nombre={editingCategory.name} group={editingCategory.group} className="h-7 w-7" /> Ajustar límite mensual: {editingCategory.name}</h3>
          <p className="mt-1 text-xs text-humo">Escribe el nuevo monto presupuestado para este sobre.</p>
          <input
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            inputMode="decimal"
            placeholder="Nuevo límite mensual (ej. 3500)"
            className="my-2 w-full rounded-xl border p-2"
          />
          <div className="flex gap-2">
            <button
              onClick={saveCategoryLimit}
              disabled={busy}
              className="flex-1 rounded-xl bg-dorado py-2 font-extrabold tracking-wide text-tinta disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Guardar nuevo límite'}
            </button>
            <button
              onClick={() => { setEditingCategory(null); setError(null) }}
              className="rounded-xl bg-borde px-4 text-sm font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {budgeted.map((c) => (
        <EnvelopeCard
          key={c.id}
          category={c}
          spent={spentByCategory.get(c.id) ?? 0}
          currency={currency}
          onTransfer={setTransferFrom}
          onEditLimit={startEditLimit}
        />
      ))}
      {budgeted.length === 0 && <p className="text-sm text-humo">Sin sobres todavía. Termina el onboarding para crear las categorías.</p>}

      {unbudgeted.length > 0 && (
        <section className="rounded-2xl border border-borde bg-tarjeta p-4">
          <h2 className="mb-2 text-sm font-bold text-humo">Otras categorías (sin presupuesto asignado)</h2>
          <div className="space-y-2">
            {unbudgeted.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-elevado p-2.5 text-sm">
                <span className="flex items-center gap-2 font-medium"><ChipCategoria nombre={c.name} group={c.group} className="h-7 w-7" />{c.name}</span>
                <button
                  onClick={() => intentarAsignarSobre(c)}
                  className="rounded-lg bg-tarjeta border border-borde px-2.5 py-1 text-xs font-semibold text-doradotexto hover:border-foco"
                >
                  + Asignar presupuesto
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {transferFrom && (
        <div className="rounded-2xl border border-foco bg-doradotenue p-4  ">
          <h3 className="font-bold">Traspasar desde {transferFrom.name}</h3>
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="mb-2 mt-2 w-full rounded-xl border p-2">
            <option value="">Hacia…</option>
            {budgeted.filter((c) => c.id !== transferFrom.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} inputMode="decimal" placeholder="Monto" className="mb-2 w-full rounded-xl border p-2" />
          <div className="flex gap-2">
            <button onClick={doTransfer} disabled={busy} className="flex-1 rounded-xl bg-dorado py-2 font-extrabold tracking-wide text-tinta disabled:opacity-50">
              {busy ? 'Traspasando…' : 'Confirmar traspaso'}
            </button>
            <button onClick={() => { setTransferFrom(null); setError(null) }} className="rounded-xl bg-borde px-4 ">Cancelar</button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-bold">Recurrentes (gastos fijos y suscripciones)</h2>
        {data.recurring.length === 0 && <p className="text-sm text-humo">Sin recurrentes. Las suscripciones se restan del disponible del mes.</p>}
        {data.recurring.map((r) => (
          <div key={r.id} className="mb-2 flex justify-between rounded-2xl border border-borde bg-tarjeta p-3 text-sm  ">
            <span className="flex items-center gap-2"><IconoReloj className="h-4 w-4 text-humo" />{r.title} · día {r.due_day}</span><strong>{formatMoney(r.amount, currency)}</strong>
          </div>
        ))}
        <p className="text-xs text-humo">Total gastado en sobres este mes: {formatMoney(totalSpent, currency)} de {formatMoney(totalBudget, currency)} presupuestados.</p>
      </section>

      {paywall && <Paywall motivo={paywall} onClose={() => setPaywall(null)} />}
    </main>
  )
}
