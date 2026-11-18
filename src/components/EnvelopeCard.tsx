import type { Category } from '../types'
import { formatMoney } from '../lib/format'
import { ChipCategoria, IconoAlerta, IconoLapiz } from './ui'

interface Props {
  category: Category
  spent: number
  rolloverBalance?: number
  currency?: string
  onTransfer: (category: Category) => void
  onEditLimit?: (category: Category) => void
}

/**
 * Sobre de presupuesto: límite, gastado, disponible, rollover.
 * Alerta al 80% (ámbar) y al 100% (rojo).
 */
export default function EnvelopeCard({ category, spent, rolloverBalance = 0, currency = 'MXN', onTransfer, onEditLimit }: Props) {
  const limit = category.monthly_limit + (category.rollover ? rolloverBalance : 0)
  const available = Math.round((limit - spent) * 100) / 100
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
  const bar = pct >= 100 ? 'bg-rojosuave' : pct >= 80 ? 'bg-dorado' : 'bg-verde'

  return (
    <article className="rounded-[28px] border border-borde/70 bg-tarjeta p-4 shadow-tarjeta">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold"><ChipCategoria nombre={category.name} group={category.group} className="h-8 w-8" />{category.name}</h3>
          <p className="text-xs text-humo">{category.group}{category.rollover ? ' · rollover activado' : ''}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${available < 0 ? 'bg-rojosuave/15 text-rojosuave' : 'bg-elevado text-humo '}`}>
          {available < 0 ? 'Excedido' : 'Disponible'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Gasto en ${category.name}`}
        className="mt-3 h-3 overflow-hidden rounded-full bg-borde "
      >
        <div className={`h-full w-full origin-left rounded-full transition-transform duration-300 ${bar}`} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span>Gastado: <strong className="text-rojosuave ">{formatMoney(spent, currency)}</strong></span>
        <span>De {formatMoney(limit, currency)}</span>
      </div>
      <p className="mt-1 text-sm">
        Disponible: <strong className={available < 0 ? 'text-rojosuave' : 'text-doradotexto '}>{formatMoney(available, currency)}</strong>
        {pct >= 80 && pct < 100 && <span className="ml-2 inline-flex items-center gap-1 text-doradotexto"><IconoAlerta className="h-3.5 w-3.5" />Vas al {pct.toFixed(0)}% del sobre</span>}
        {pct >= 100 && <span className="ml-2 inline-flex items-center gap-1 text-rojosuave"><IconoAlerta className="h-3.5 w-3.5" />Sobre al 100% o excedido</span>}
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onTransfer(category)} className="flex-1 rounded-xl bg-elevado py-2 text-sm font-semibold transition hover:bg-borde">
          Traspasar
        </button>
        {onEditLimit && (
          <button onClick={() => onEditLimit(category)} className="rounded-xl border border-borde bg-tarjeta px-3 py-2 text-sm font-semibold text-humo transition hover:border-foco/60 hover:text-crema">
            <span className="flex items-center gap-1.5"><IconoLapiz className="h-4 w-4" />Ajustar límite</span>
          </button>
        )}
      </div>
    </article>
  )
}
