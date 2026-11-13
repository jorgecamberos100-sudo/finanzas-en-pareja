import type { Category } from '../types'
import { formatMoney } from '../lib/format'

interface Props {
  category: Category
  spent: number
  rolloverBalance?: number
  currency?: string
  onTransfer: (category: Category) => void
}

/**
 * Sobre de presupuesto: límite, gastado, disponible, rollover.
 * Alerta al 80% (ámbar) y al 100% (rojo).
 */
export default function EnvelopeCard({ category, spent, rolloverBalance = 0, currency = 'MXN', onTransfer }: Props) {
  const limit = category.monthly_limit + (category.rollover ? rolloverBalance : 0)
  const available = Math.round((limit - spent) * 100) / 100
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
  const bar = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-600'

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold">{category.icon} {category.name}</h3>
          <p className="text-xs text-stone-500">{category.group}{category.rollover ? ' · rollover activado' : ''}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${available < 0 ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600 dark:bg-stone-800'}`}>
          {available < 0 ? 'Excedido' : 'Disponible'}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span>Gastado: <strong className="text-red-600 dark:text-red-400">{formatMoney(spent, currency)}</strong></span>
        <span>De {formatMoney(limit, currency)}</span>
      </div>
      <p className="mt-1 text-sm">
        Disponible: <strong className={available < 0 ? 'text-red-600' : 'text-teal-700 dark:text-teal-400'}>{formatMoney(available, currency)}</strong>
        {pct >= 80 && pct < 100 && <span className="ml-2 text-amber-600">⚠️ Vas al {pct.toFixed(0)}% del sobre</span>}
        {pct >= 100 && <span className="ml-2 text-red-600">⚠️ Sobre al 100% o excedido</span>}
      </p>
      <button onClick={() => onTransfer(category)} className="mt-3 w-full rounded-xl bg-stone-100 py-2 text-sm font-semibold dark:bg-stone-800">
        Traspasar entre sobres
      </button>
    </article>
  )
}
