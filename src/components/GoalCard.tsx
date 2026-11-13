import type { Goal } from '../types'
import { formatDateEs, formatMoney } from '../lib/format'
import { expectedProgress } from '../lib/split'

interface Props {
  goal: Goal
  currency?: string
  onContribute: (goal: Goal, amount: number) => void
}

/**
 * Meta compartida: barra de progreso + marcador del ritmo esperado
 * a la fecha actual (si vas por debajo del marcador, vas atrasado).
 */
export default function GoalCard({ goal, currency = 'MXN', onContribute }: Props) {
  const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0
  const expected = expectedProgress(goal) * 100
  const remaining = Math.max(0, goal.target - goal.current)

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold">🎯 {goal.name}</h3>
          <p className="text-sm text-stone-500">
            {formatMoney(goal.current, currency)} de {formatMoney(goal.target, currency)}
            {goal.due_date ? ` · vence ${formatDateEs(goal.due_date)}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-2 py-1 text-sm font-bold text-teal-700 dark:bg-teal-950">{pct.toFixed(0)}%</span>
      </div>

      <div className="relative mt-3 h-3 overflow-visible rounded-full bg-stone-200 dark:bg-stone-800">
        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
        {goal.due_date && (
          <div className="absolute -top-1 h-5 w-0.5 bg-amber-500" style={{ left: `${expected}%` }} title={`Ritmo esperado: ${expected.toFixed(0)}%`} />
        )}
      </div>
      <p className="mt-1 text-xs text-stone-500">
        {goal.due_date
          ? `Ritmo esperado hoy: ${expected.toFixed(0)}% ${pct < expected ? '· vas atrasado' : '· vas al corriente'}`
          : 'Sin fecha límite'}
        {' · '}Faltan {formatMoney(remaining, currency)}
      </p>

      <div className="mt-3 flex gap-2">
        {[200, 500, 1000].map((amt) => (
          <button key={amt} onClick={() => onContribute(goal, amt)}
            className="flex-1 rounded-xl bg-stone-100 py-2 text-sm font-semibold dark:bg-stone-800">
            +{formatMoney(amt, currency)}
          </button>
        ))}
      </div>
    </article>
  )
}
