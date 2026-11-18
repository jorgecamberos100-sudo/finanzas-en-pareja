import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { formatMoney, parseAmount, todayIso } from '../lib/format'
import { supabase } from '../lib/supabase'
import GoalCard from '../components/GoalCard'
import PibbiReaction, { type ReactionContext } from '../components/PibbiReaction'
import type { Goal } from '../types'

interface Props { data: AppData; onRefresh: () => void }

export default function Plan({ data, onRefresh }: Props) {
  const currency = data.household?.currency ?? 'MXN'
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [moneyNotes, setMoneyNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // PIBBI reacciona al crear una meta, aportar y guardar la revisión.
  const [reaction, setReaction] = useState<ReactionContext | null>(null)

  const patrimonio = useMemo(() => data.accounts.reduce((acc, a) => acc + (a.type === 'deuda' || a.type === 'tarjeta' ? -a.balance : a.balance), 0), [data.accounts])

  async function createGoal() {
    if (!data.household || !goalName.trim() || !goalTarget.trim()) return
    const target = parseAmount(goalTarget)
    if (!target || target <= 0) { setMessage('El monto objetivo debe ser mayor a $0.'); return }
    const { error } = await supabase.from('goals').insert({
      household_id: data.household.id, name: goalName.trim(), target,
      current: 0, due_date: goalDate || null,
    })
    if (error) { setMessage(error.message); return }
    setGoalName(''); setGoalTarget(''); setGoalDate(''); setMessage('Meta creada 🎉')
    setReaction('ahorrando')
    onRefresh()
  }

  async function contribute(goal: Goal, amount: number) {
    if (!data.me) return
    const { error } = await supabase.from('goal_contributions').insert({ goal_id: goal.id, user_id: data.me.id, amount, date: todayIso() })
    if (error) { setMessage(error.message); return }
    await supabase.from('goals').update({ current: goal.current + amount }).eq('id', goal.id)
    setMessage(`Aportaste ${formatMoney(amount, currency)} a “${goal.name}”.`)
    setReaction(goal.current + amount >= goal.target ? 'celebrando' : 'progreso')
    onRefresh()
  }

  async function saveMoneyDate() {
    if (!data.household) return
    const { error } = await supabase.from('money_dates').insert({
      household_id: data.household.id, date: todayIso(),
      notes: moneyNotes || null, settled_amount: 0,
    })
    if (error) { setMessage(error.message); return }
    setMoneyNotes(''); setMessage(data.partner ? 'Money date guardado 💬. Recuerden exportar su CSV de respaldo en Movimientos.' : 'Revisión guardada 💬. Recuerda exportar tu CSV de respaldo en Movimientos.')
    setReaction('pensando')
    onRefresh()
  }

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Plan</h1>

      <section>
        <h2 className="mb-2 font-bold">{data.partner ? 'Metas compartidas' : 'Mis metas'}</h2>
        {data.goals.map((g) => <div key={g.id} className="mb-3"><GoalCard goal={g} currency={currency} onContribute={contribute} /></div>)}
        {data.goals.length === 0 && <p className="mb-3 text-sm text-humo">Sin metas todavía. Crea la primera abajo.</p>}
        <div className="rounded-2xl border border-borde bg-tarjeta p-4  ">
          <h3 className="mb-2 font-bold">Nueva meta</h3>
          <input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Nombre (ej. Vacaciones en la playa)" className="mb-2 w-full rounded-xl border p-2" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} inputMode="decimal" placeholder="Monto objetivo" className="min-w-0 flex-1 rounded-xl border p-2" />
            <input value={goalDate} onChange={(e) => setGoalDate(e.target.value)} type="date" className="min-w-0 flex-1 rounded-xl border p-2" />
          </div>
          <button onClick={createGoal} className="mt-2 w-full rounded-xl bg-rosafuerte py-2 font-extrabold tracking-wide text-noche">Crear meta</button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Cuentas y patrimonio</h2>
        {data.accounts.map((a) => (
          <div key={a.id} className="mb-2 flex justify-between rounded-2xl border border-borde bg-tarjeta p-3 text-sm  ">
            <span>{a.name} · {a.type} · {a.visibility === 'privada' ? '🔒 privada' : a.visibility === 'solo_saldo' ? '👁️ solo saldo' : '👥 compartida'}</span>
            <strong className={a.type === 'deuda' || a.type === 'tarjeta' ? 'text-rojosuave' : ''}>{formatMoney(a.balance, currency)}</strong>
          </div>
        ))}
        <p className="text-sm">Patrimonio (activos − deudas): <strong>{formatMoney(patrimonio, currency)}</strong></p>
      </section>

      <section className="rounded-2xl border border-borde bg-tarjeta p-4  ">
        <h2 className="font-bold">💬 {data.partner ? 'Money date' : 'Mi revisión'}</h2>
        <p className="mb-2 text-sm text-humo">{data.partner ? 'Revisión en pareja: resumen del período, notas y acuerdos, y liquidación de la deuda mutua (se liquida desde Inicio).' : 'Tu revisión: resumen del período, notas y acuerdos.'}</p>
        <textarea value={moneyNotes} onChange={(e) => setMoneyNotes(e.target.value)} placeholder="Notas y acuerdos de hoy…" rows={3} className="mb-2 w-full rounded-xl border p-2" />
        <button onClick={saveMoneyDate} className="w-full rounded-xl bg-rosafuerte py-2 font-extrabold tracking-wide text-noche">Guardar money date</button>
        {message && <p className="mt-2 text-sm text-verde ">{message}</p>}
        {reaction && <div className="mt-2"><PibbiReaction contexto={reaction} /></div>}
      </section>
    </main>
  )
}
