import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { formatMoney, parseAmount, todayIso } from '../lib/format'
import { defPlan, puedeCrearMeta } from '../lib/planes'
import { supabase } from '../lib/supabase'
import GoalCard from '../components/GoalCard'
import Paywall from '../components/Paywall'
import PibbiHeader from '../components/PibbiHeader'
import { PAGE_PIBBI_POSES } from '../lib/pibbi-poses'
import PibbiReaction, { type ReactionContext } from '../components/PibbiReaction'
import type { Account, Goal } from '../types'
import { Confirmar, IconoAlerta, IconoCheck, IconoLapiz } from '../components/ui'

interface Props { data: AppData; onRefresh: () => void }

export default function Plan({ data, onRefresh }: Props) {
  const currency = data.household?.currency ?? 'MXN'
  const [seccion, setSeccion] = useState<'metas' | 'cuentas' | 'revision'>('metas')
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [moneyNotes, setMoneyNotes] = useState('')
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountBalance, setAccountBalance] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Motivo del paywall (null = cerrado).
  const [paywall, setPaywall] = useState<string | null>(null)
  // PIBBI reacciona al crear una meta, aportar y guardar la revisión.
  const [reaction, setReaction] = useState<ReactionContext | null>(null)
  const [metaAEliminar, setMetaAEliminar] = useState<Goal | null>(null)

  const patrimonio = useMemo(() => data.accounts.reduce((acc, a) => acc + (a.type === 'deuda' || a.type === 'tarjeta' ? -a.balance : a.balance), 0), [data.accounts])

  async function createGoal() {
    if (!data.household || !goalName.trim() || !goalTarget.trim() || busy) return
    const target = parseAmount(goalTarget)
    if (!target || target <= 0) { setError('El monto objetivo debe ser mayor a $0.'); return }
    // En Free el límite es 1 meta: la 2.ª abre el paywall de Plus en vez
    // de crearla. Aportar a una meta que ya existe no está limitado.
    if (!puedeCrearMeta(data.plan, data.goals.length)) {
      const def = defPlan(data.plan)
      setPaywall(`El plan ${def.nombre} permite ${def.metasMax} meta y ya tienes ${data.goals.length}. Con Plus las metas son ilimitadas.`)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: err } = await supabase.from('goals').insert({
      household_id: data.household.id, name: goalName.trim(), target,
      current: 0, due_date: goalDate || null,
    })
    setBusy(false)
    if (err) { setError(`No se pudo crear la meta: ${err.message}`); return }
    setGoalName(''); setGoalTarget(''); setGoalDate(''); setMessage('Meta creada')
    setReaction('ahorrando')
    onRefresh()
  }

  async function contribute(goal: Goal, amount: number) {
    if (!data.me || busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: err1 } = await supabase.from('goal_contributions').insert({ goal_id: goal.id, user_id: data.me.id, amount, date: todayIso() })
    if (err1) { setBusy(false); setError(`Error al registrar aportación: ${err1.message}`); return }
    const { error: err2 } = await supabase.from('goals').update({ current: goal.current + amount }).eq('id', goal.id)
    setBusy(false)
    if (err2) { setError(`Error al actualizar meta: ${err2.message}`); return }
    setMessage(`Aportaste ${formatMoney(amount, currency)} a “${goal.name}”.`)
    setReaction(goal.current + amount >= goal.target ? 'celebrando' : 'progreso')
    onRefresh()
  }

  async function deleteGoal(goal: Goal) {
    if (busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: err } = await supabase.from('goals').delete().eq('id', goal.id)
    setBusy(false)
    if (err) { setError(`No se pudo eliminar la meta: ${err.message}`); return }
    setMessage(`Meta “${goal.name}” eliminada.`)
    onRefresh()
  }

  async function updateAccountBalance() {
    if (!editingAccount || busy) return
    const balance = parseAmount(accountBalance)
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: err } = await supabase.from('accounts').update({ balance }).eq('id', editingAccount.id)
    setBusy(false)
    if (err) { setError(`No se pudo actualizar el saldo: ${err.message}`); return }
    setMessage(`Saldo de “${editingAccount.name}” actualizado a ${formatMoney(balance, currency)}.`)
    setEditingAccount(null)
    setAccountBalance('')
    onRefresh()
  }

  async function saveMoneyDate() {
    if (!data.household || busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: err } = await supabase.from('money_dates').insert({
      household_id: data.household.id, date: todayIso(),
      notes: moneyNotes || null, settled_amount: 0,
    })
    setBusy(false)
    if (err) { setError(`No se pudo guardar la revisión: ${err.message}`); return }
    setMoneyNotes(''); setMessage(data.partner ? 'Money date guardado. Recuerden exportar su CSV de respaldo en Movimientos.' : 'Revisión guardada. Recuerda exportar tu CSV de respaldo en Movimientos.')
    setReaction('pensando')
    onRefresh()
  }

  return (
    <main className="space-y-5 p-5">
      <PibbiHeader pose={PAGE_PIBBI_POSES.plan} title="Plan" subtitle="Tus metas, tus cuentas y tu revisión." className="-mx-5 -mt-5 px-5 pb-3 pt-3" />

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-rojosuave/10 p-3 text-sm text-rojosuave">
          <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {message && (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-verde/10 p-3 text-sm text-verde">
          <IconoCheck className="mt-0.5 h-4 w-4 shrink-0" />{message}
        </div>
      )}

      {/* Una sección a la vez: antes las tres (metas, cuentas, revisión)
          se apilaban en un scroll largo y nada se encontraba. El control
          segmentado deja ver una sola; los avisos de error/éxito quedan
          arriba del control para que siempre se vean. */}
      <div role="tablist" aria-label="Secciones del plan" className="flex rounded-full border border-borde bg-elevado p-1">
        {([['metas', 'Metas'], ['cuentas', 'Cuentas'], ['revision', 'Revisión']] as const).map(([clave, etiqueta]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={seccion === clave}
            onClick={() => setSeccion(clave)}
            className={`flex-1 rounded-full px-2 py-2 text-sm font-semibold ${seccion === clave ? 'bg-azul text-white shadow-tarjeta' : 'text-humo'}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {seccion === 'metas' && (
      <section>
        <h2 className="mb-2 font-bold">{data.partner ? 'Metas compartidas' : 'Mis metas'}</h2>
        <p className="mb-2 text-xs text-humo">
          Plan {defPlan(data.plan).nombre} · {data.goals.length} de {Number.isFinite(defPlan(data.plan).metasMax) ? defPlan(data.plan).metasMax : '∞'} metas
        </p>
        {data.goals.map((g) => (
          <div key={g.id} className="mb-3">
            <GoalCard goal={g} currency={currency} onContribute={contribute} onDelete={(goal) => setMetaAEliminar(goal)} />
          </div>
        ))}
        {data.goals.length === 0 && <p className="mb-3 text-sm text-humo">Sin metas todavía. Crea la primera abajo.</p>}
        <div className="rounded-2xl border border-borde bg-tarjeta p-4  ">
          <h3 className="mb-2 font-bold">Nueva meta</h3>
          <input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Nombre (ej. Vacaciones en la playa)" className="mb-2 w-full rounded-xl border p-2" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} inputMode="decimal" placeholder="Monto objetivo" className="min-w-0 flex-1 rounded-xl border p-2" />
            <input value={goalDate} onChange={(e) => setGoalDate(e.target.value)} type="date" className="min-w-0 flex-1 rounded-xl border p-2" />
          </div>
          <button onClick={createGoal} disabled={busy} className="mt-2 w-full rounded-xl bg-dorado py-2 font-extrabold tracking-wide text-tinta disabled:opacity-50">
            {busy ? 'Creando…' : 'Crear meta'}
          </button>
        </div>
      </section>)}

      {seccion === 'cuentas' && (
      <section>
        <h2 className="mb-2 font-bold">Cuentas y patrimonio</h2>
        {editingAccount && (
          <div className="mb-3 rounded-2xl border border-foco/60 bg-doradotenue p-4">
            <h3 className="font-bold">Ajustar saldo: {editingAccount.name}</h3>
            <p className="mt-1 text-xs text-humo">Actualiza el saldo actual de esta cuenta para conciliar tu dinero.</p>
            <input
              value={accountBalance}
              onChange={(e) => setAccountBalance(e.target.value)}
              inputMode="decimal"
              placeholder="Saldo actual"
              className="my-2 w-full rounded-xl border p-2"
            />
            <div className="flex gap-2">
              <button
                onClick={updateAccountBalance}
                disabled={busy}
                className="flex-1 rounded-xl bg-dorado py-2 font-extrabold tracking-wide text-tinta disabled:opacity-50"
              >
                {busy ? 'Actualizando…' : 'Guardar saldo'}
              </button>
              <button
                onClick={() => setEditingAccount(null)}
                className="rounded-xl bg-borde px-4 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {data.accounts.map((a) => (
          <div key={a.id} className="mb-2 flex items-center justify-between rounded-2xl border border-borde bg-tarjeta p-3 text-sm  ">
            <div className="min-w-0 pr-2">
              <p className="font-semibold truncate">{a.name}</p>
              <p className="text-xs text-humo">{a.type} · {a.visibility === 'privada' ? 'privada' : a.visibility === 'solo_saldo' ? 'solo saldo' : 'compartida'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <strong className={a.type === 'deuda' || a.type === 'tarjeta' ? 'text-rojosuave' : ''}>{formatMoney(a.balance, currency)}</strong>
              <button
                onClick={() => { setEditingAccount(a); setAccountBalance(String(a.balance)); setError(null); setMessage(null) }}
                title="Ajustar saldo"
                aria-label={`Ajustar saldo de ${a.name}`}
                className="rounded-lg border border-borde px-2 py-1 text-xs text-humo hover:text-crema"
              >
                <IconoLapiz className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <p className="text-sm mt-3">Patrimonio (activos − deudas): <strong>{formatMoney(patrimonio, currency)}</strong></p>
      </section>)}

      {seccion === 'revision' && (
      <section className="rounded-2xl border border-borde bg-tarjeta p-4  ">
        <h2 className="font-bold">{data.partner ? 'Money date' : 'Mi revisión'}</h2>
        <p className="mb-2 text-sm text-humo">{data.partner ? 'Revisión en pareja: resumen del período, notas y acuerdos, y liquidación de la deuda mutua (se liquida desde el chat con PIBBI).' : 'Tu revisión: resumen del período, notas y acuerdos.'}</p>
        <textarea value={moneyNotes} onChange={(e) => setMoneyNotes(e.target.value)} placeholder="Notas y acuerdos de hoy…" rows={3} className="mb-2 w-full rounded-xl border p-2" />
        <button onClick={saveMoneyDate} disabled={busy} className="w-full rounded-xl bg-dorado py-2 font-extrabold tracking-wide text-tinta disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar money date'}
        </button>
        {reaction && <div className="mt-2"><PibbiReaction contexto={reaction} /></div>}
      </section>)}

      {paywall && <Paywall motivo={paywall} onClose={() => setPaywall(null)} />}

      {/* Confirmación dentro de la app (no el diálogo del navegador). */}
      <Confirmar
        abierto={metaAEliminar !== null}
        titulo="¿Eliminar esta meta?"
        mensaje={metaAEliminar ? `Se borrará la meta “${metaAEliminar.name}” y sus aportaciones.` : ''}
        textoConfirmar="Eliminar"
        peligro
        onCancelar={() => setMetaAEliminar(null)}
        onConfirmar={() => { const g = metaAEliminar; setMetaAEliminar(null); if (g) void deleteGoal(g) }}
      />
    </main>
  )
}
