import { useMemo } from 'react'
import type { AppData } from '../App'
import { formatDateEs, formatMoney, monthKey, todayIso } from '../lib/format'
import { computeMutualBalance, monthTotals } from '../lib/split'
import { reminderStatus } from '../lib/reminders'
import { supabase } from '../lib/supabase'

interface Props { data: AppData; onRefresh: () => void }

export default function Dashboard({ data, onRefresh }: Props) {
  const currency = data.household?.currency ?? 'MXN'
  const month = monthKey()

  // Patrimonio = activos − deudas. Tarjetas/deudas restan.
  const patrimonio = useMemo(() => data.accounts.reduce((acc, a) => acc + (a.type === 'deuda' || a.type === 'tarjeta' ? -a.balance : a.balance), 0), [data.accounts])
  const { ingresos, gastos } = useMemo(() => monthTotals(data.transactions, month), [data.transactions, month])
  const disponible = ingresos - gastos

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const tx of data.transactions) {
      if (tx.type === 'gasto' && tx.date.startsWith(month) && tx.category_id) {
        m.set(tx.category_id, (m.get(tx.category_id) ?? 0) + tx.amount)
      }
    }
    return m
  }, [data.transactions, month])
  const totalBudget = data.categories.reduce((s, c) => s + c.monthly_limit, 0)
  const porAsignar = Math.max(0, disponible - totalBudget)

  const mutual = useMemo(
    () => (data.me && data.partner ? computeMutualBalance(data.transactions, data.me.id, data.partner.id) : null),
    [data.transactions, data.me, data.partner],
  )
  const debtorName = mutual?.debtor_id === data.me?.id ? 'Tú' : data.partner?.name ?? 'Tu pareja'
  const creditorName = mutual?.creditor_id === data.me?.id ? 'ti' : data.partner?.name ?? 'tu pareja'

  const upcoming = useMemo(() => {
    const today = new Date().getDate()
    return [...data.recurring].filter((r) => r.due_day >= today).sort((a, b) => a.due_day - b.due_day).slice(0, 3)
  }, [data.recurring])

  // Recordatorios que vencen hoy, mañana o ya vencieron (sin hacer).
  const dueReminders = useMemo(
    () =>
      (data.reminders ?? [])
        .filter((r) => !r.is_done && ['overdue', 'today', 'tomorrow'].includes(reminderStatus(r)))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [data.reminders],
  )

  async function liquidar() {
    if (!mutual || !data.me || !data.household) return
    if (!confirm(`¿Confirmas que ${debtorName} le pagó ${formatMoney(mutual.amount, currency)} a ${creditorName}? Se registrará la liquidación.`)) return
    // La liquidación es una transferencia entre personas: se registra como
    // money_date (revisión) y como transferencia, que NO cuenta como gasto.
    await supabase.from('money_dates').insert({
      household_id: data.household.id, date: todayIso(),
      notes: `Liquidación de deuda mutua: ${formatMoney(mutual.amount, currency)}`, settled_amount: mutual.amount,
    })
    onRefresh()
  }

  return (
    <main className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">Hola, {data.me?.name ?? 'pareja'} 👋</h1>
        <p className="text-sm text-stone-500">{data.household?.name} · {currency} · {new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</p>
      </header>

      <section className="rounded-2xl bg-teal-700 p-5 text-white">
        <p className="text-sm opacity-80">Patrimonio total</p>
        <p className="text-3xl font-black">{formatMoney(patrimonio, currency)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><p className="opacity-80">Ingresos del mes</p><p className="font-bold text-emerald-200">+{formatMoney(ingresos, currency)}</p></div>
          <div><p className="opacity-80">Gastos del mes</p><p className="font-bold text-red-200">−{formatMoney(gastos, currency)}</p></div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm text-stone-500">Disponible</p><p className="text-xl font-bold">{formatMoney(disponible, currency)}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm text-stone-500">Por asignar</p><p className="text-xl font-bold">{formatMoney(porAsignar, currency)}</p>
        </div>
      </section>

      {mutual ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="font-bold">⚖️ Deuda mutua</p>
          <p className="text-sm">{debtorName} le debe <strong>{formatMoney(mutual.amount, currency)}</strong> a {creditorName}.</p>
          <button onClick={liquidar} className="mt-2 w-full rounded-xl bg-amber-600 py-2 font-bold text-white">Liquidar ahora</button>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="font-bold">✅ Están a mano</p><p className="text-sm text-stone-600 dark:text-stone-300">No hay deuda mutua pendiente.</p>
        </section>
      )}

      {dueReminders.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="font-bold">🔔 Recordatorios de pago</p>
          {dueReminders.map((r) => (
            <div key={r.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span>
                {r.title} · {reminderStatus(r) === 'overdue' ? `vencido (${formatDateEs(r.due_date)})` : reminderStatus(r) === 'today' ? 'hoy' : 'mañana'}
                {r.amount !== null ? ` · ${formatMoney(r.amount, currency)}` : ''}
              </span>
              <a href="/recordatorios" className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 font-bold text-white">Ver</a>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Metas</h2>
        {data.goals.length === 0 && <p className="text-sm text-stone-500">Aún no hay metas. Créalas en la pestaña Plan.</p>}
        {data.goals.slice(0, 3).map((g) => {
          const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0
          return (
            <div key={g.id} className="mb-2 rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
              <div className="flex justify-between text-sm"><span>🎯 {g.name}</span><span>{pct.toFixed(0)}%</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"><div className="h-full bg-teal-600" style={{ width: `${pct}%` }} /></div>
            </div>
          )
        })}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Próximos vencimientos</h2>
        {upcoming.length === 0 && <p className="text-sm text-stone-500">Sin recurrentes próximos. Agrega suscripciones en Presupuesto.</p>}
        {upcoming.map((r) => (
          <div key={r.id} className="mb-2 flex justify-between rounded-2xl border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-900">
            <span>📅 Día {r.due_day} · {r.title}</span><strong>{formatMoney(r.amount, currency)}</strong>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Presupuesto del mes</h2>
        {data.categories.filter((c) => c.monthly_limit > 0).slice(0, 5).map((c) => {
          const spent = spentByCategory.get(c.id) ?? 0
          const pct = Math.min(100, (spent / c.monthly_limit) * 100)
          return (
            <div key={c.id} className="mb-2 text-sm">
              <div className="flex justify-between"><span>{c.icon} {c.name}</span><span>{formatMoney(spent, currency)} / {formatMoney(c.monthly_limit, currency)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <div className={`h-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </section>
    </main>
  )
}
