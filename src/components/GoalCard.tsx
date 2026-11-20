import { useState } from 'react'
import type { Goal } from '../types'
import { formatDateEs, formatMoney, parseAmount } from '../lib/format'
import { expectedProgress } from '../lib/split'
import Mascota from './Mascota'
import { usePibbi } from '../lib/pibbi'
import { celebracionPibbi } from '../lib/pibbi-identidad'
import { IconoBasura } from './ui'

interface Props {
  goal: Goal
  currency?: string
  onContribute: (goal: Goal, amount: number) => void
  onDelete?: (goal: Goal) => void
}

/**
 * Meta compartida: barra de progreso + marcador del ritmo esperado
 * a la fecha actual (si vas por debajo del marcador, vas atrasado).
 */
export default function GoalCard({ goal, currency = 'MXN', onContribute, onDelete }: Props) {
  const { name, vibe } = usePibbi()
  const [showCustom, setShowCustom] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0
  const expected = expectedProgress(goal) * 100
  const remaining = Math.max(0, goal.target - goal.current)

  function handleCustomSubmit() {
    const amt = parseAmount(customAmount)
    if (amt > 0) {
      onContribute(goal, amt)
      setCustomAmount('')
      setShowCustom(false)
    }
  }

  return (
    <article className="rounded-[28px] border border-borde bg-tarjeta p-4 shadow-elevada">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold truncate">{goal.name}</h3>
          <p className="text-sm text-humo">
            {formatMoney(goal.current, currency)} de {formatMoney(goal.target, currency)}
            {goal.due_date ? ` · vence ${formatDateEs(goal.due_date)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full bg-doradotenue px-2 py-1 text-sm font-bold text-doradotexto ">{pct.toFixed(0)}%</span>
          {onDelete && (
            <button
              onClick={() => onDelete(goal)}
              aria-label={`Eliminar meta ${goal.name}`}
              title="Eliminar meta"
              className="btn-icono text-rojosuave"
            >
              <IconoBasura className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de meta ${goal.name}`}
        className="relative mt-3 h-3 overflow-visible rounded-full bg-borde "
      >
        <div className="h-full rounded-full bg-dorado transition-all" style={{ width: `${pct}%` }} />
        {goal.due_date && (
          <div className="absolute -top-1 h-5 w-0.5 bg-dorado" style={{ left: `${expected}%` }} title={`Ritmo esperado: ${expected.toFixed(0)}%`} />
        )}
      </div>
      <p className="mt-1 text-xs text-humo">
        {goal.due_date
          ? `Ritmo esperado hoy: ${expected.toFixed(0)}% ${pct < expected ? '· vas atrasado' : '· vas al corriente'}`
          : 'Sin fecha límite'}
        {' · '}Faltan {formatMoney(remaining, currency)}
      </p>

      {pct >= 100 && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-elevado p-3">
          <Mascota pose="celebrando" dancing alt={`${name} celebrando la meta alcanzada`} className="h-[120px] w-[120px] shrink-0" />
          <p className="text-sm font-bold text-doradotexto">{celebracionPibbi(vibe, name)}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {[200, 500, 1000].map((amt) => (
          <button key={amt} onClick={() => onContribute(goal, amt)}
            className="btn-secundario-chico flex-1">
            +{formatMoney(amt, currency)}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className="btn-secundario-chico"
        >
          {showCustom ? 'Cerrar' : '+ Otro'}
        </button>
      </div>

      {showCustom && (
        <div className="mt-2 flex gap-2">
          <input
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Monto a aportar"
            className="campo flex-1"
          />
          <button
            onClick={handleCustomSubmit}
            className="btn-primario-chico"
          >
            Aportar
          </button>
        </div>
      )}
    </article>
  )
}
