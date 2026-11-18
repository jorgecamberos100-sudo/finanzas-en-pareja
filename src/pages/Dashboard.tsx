import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AppData } from '../App'
import { formatDateEs, formatMoney, monthKey, todayIso } from '../lib/format'
import { computeMutualBalance, monthTotals } from '../lib/split'
import { upcomingRecurring } from '../lib/recurring'
import { reminderStatus } from '../lib/reminders'
import { supabase } from '../lib/supabase'
import { mensajeHumano } from '../lib/errores'
import Mascota from '../components/Mascota'
import PibbiHeader from '../components/PibbiHeader'
import { PAGE_PIBBI_POSES } from '../lib/pibbi-poses'
import PibbiDresser from '../components/PibbiDresser'
import {
  Alerta, Boton, IconoBalanza, IconoCalendario, IconoCampana, IconoCheck, IconoCopiar,
  IconoCorazon, IconoMeta, IconoSalir, IconoSobre, Logo, Tarjeta,
} from '../components/ui'

interface Props { data: AppData; onRefresh: () => void; onSignOut?: () => void }

export default function Dashboard({ data, onRefresh, onSignOut }: Props) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [liquidando, setLiquidando] = useState(false)
  const [liquidarError, setLiquidarError] = useState<string | null>(null)
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
    () => (data.me && data.partner ? computeMutualBalance(data.transactions, data.me.id, data.partner.id, data.settlements) : null),
    [data.transactions, data.me, data.partner, data.settlements],
  )
  const debtorName = mutual?.debtor_id === data.me?.id ? 'Tú' : data.partner?.name ?? 'Tu pareja'
  const creditorName = mutual?.creditor_id === data.me?.id ? 'ti' : data.partner?.name ?? 'tu pareja'

  // Próximos vencimientos: este mes o el siguiente, ordenados por cercanía.
  const upcoming = useMemo(() => upcomingRecurring(data.recurring), [data.recurring])

  // Recordatorios que vencen hoy, mañana o ya vencieron (sin hacer).
  const dueReminders = useMemo(
    () =>
      (data.reminders ?? [])
        .filter((r) => !r.is_done && ['overdue', 'today', 'tomorrow'].includes(reminderStatus(r)))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [data.reminders],
  )

  async function liquidar() {
    if (!mutual || !data.me || !data.household || liquidando) return
    if (!confirm(`¿Confirmas que ${debtorName} le pagó ${formatMoney(mutual.amount, currency)} a ${creditorName}? Se registrará la liquidación.`)) return
    setLiquidando(true)
    setLiquidarError(null)
    // La liquidación es una transferencia entre personas: se registra como
    // money_date (revisión) y como transferencia, que NO cuenta como gasto.
    // El saldo mutuo resta estas liquidaciones (computeMutualBalance), así
    // que tras liquidar la deuda queda en cero y no reaparece al recargar.
    const { error } = await supabase.from('money_dates').insert({
      household_id: data.household.id, date: todayIso(),
      notes: `Liquidación de deuda mutua: ${formatMoney(mutual.amount, currency)}`, settled_amount: mutual.amount,
    })
    setLiquidando(false)
    if (error) { setLiquidarError(mensajeHumano(error.message, 'No se pudo registrar la liquidación. Inténtalo de nuevo.')); return }
    onRefresh()
  }

  async function copyInvite() {
    const code = data.household?.invite_code ?? ''
    const link = `${window.location.origin}/onboarding?codigo=${code}`
    setCopyFailed(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(`Únete a mi hogar en Finanzas en Pareja. Código: ${code} · Enlace: ${link}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      // Sin portapapeles: el código y el enlace se ven en la tarjeta; avisar para copiarlos a mano.
      setCopyFailed(true)
    }
  }

  return (
    <main className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Logo tamano="sm" conPibbi={false} />
        {onSignOut && (
          <button
            onClick={() => { if (confirm('¿Cerrar sesión en este dispositivo?')) onSignOut() }}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-xs font-semibold text-humo transition hover:border-foco hover:text-crema active:scale-95"
          >
            <IconoSalir className="h-4 w-4" /> Salir
          </button>
        )}
      </div>

      <PibbiHeader
        pose={PAGE_PIBBI_POSES.dashboard}
        title={<>Hola, {data.me?.name ?? 'pareja'}</>}
        subtitle={<>{data.household?.name} · {currency} · {new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</>}
      />

      {data.transactions.length === 0 && (
        <Tarjeta className="flex items-start gap-3 border-foco/60 p-4">
          <Mascota className="h-16 w-16 shrink-0" />
          <div>
            <p className="font-bold">Aún no hay movimientos</p>
            <p className="text-sm text-humo">Toca el botón + o escríbele a PIBBI en el Chat: un gasto, la foto de un ticket o una nota de voz.</p>
          </div>
        </Tarjeta>
      )}

      {/* Hogar de 1 persona: invitar a la pareja es una opción, no un requisito. */}
      {!data.partner && data.household && (
        <Tarjeta className="border-foco/60 p-4">
          <p className="flex items-center gap-2 font-bold"><IconoCorazon className="h-5 w-5 text-doradotexto" /> Invita a tu pareja (opcional)</p>
          <p className="mb-3 mt-1 text-sm text-humo">Usas la app solo por ahora. Cuando quieras, tu pareja crea su cuenta y se une con este código.</p>
          <div className="mb-3 rounded-2xl bg-doradotenue p-3 text-center">
            <p className="font-display text-2xl font-extrabold tracking-[0.25em] text-doradotexto">{data.household.invite_code}</p>
            <p className="mt-1 break-all text-xs text-humo">{`${window.location.origin}/onboarding?codigo=${data.household.invite_code}`}</p>
          </div>
          <Boton onClick={copyInvite} className="w-full">
            {copied ? <><IconoCheck className="h-4 w-4" /> ¡Copiado!</> : <><IconoCopiar className="h-4 w-4" /> Copiar código y enlace</>}
          </Boton>
          {copyFailed && <p role="alert" className="mt-2 text-center text-xs text-doradotexto">No se pudo copiar automáticamente: copia el código y el enlace de la tarjeta.</p>}
        </Tarjeta>
      )}

      <Tarjeta className="p-4">
        <PibbiDresser />
      </Tarjeta>

      {/* Tarjeta héroe: patrimonio del hogar. */}
      <Tarjeta className="border-foco/60 p-5">
        <p className="text-sm font-medium text-doradotexto">Patrimonio total</p>
        <p className="nums mt-1 font-display text-4xl font-extrabold tracking-tight text-crema">{formatMoney(patrimonio, currency)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-elevado p-3">
            <p className="text-xs text-humo">Ingresos del mes</p>
            <p className="nums mt-0.5 font-display font-bold text-verde">+{formatMoney(ingresos, currency)}</p>
          </div>
          <div className="rounded-2xl bg-elevado p-3">
            <p className="text-xs text-humo">Gastos del mes</p>
            <p className="nums mt-0.5 font-display font-bold text-rojosuave">−{formatMoney(gastos, currency)}</p>
          </div>
        </div>
      </Tarjeta>

      <section className="grid grid-cols-2 gap-3">
        <Tarjeta className="p-4">
          <p className="text-xs text-humo">Disponible</p>
          <p className="nums mt-0.5 font-display text-xl font-bold">{formatMoney(disponible, currency)}</p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs text-humo">Por asignar</p>
          <p className="nums mt-0.5 font-display text-xl font-bold">{formatMoney(porAsignar, currency)}</p>
        </Tarjeta>
      </section>

      {/* La deuda mutua solo existe cuando hay pareja en el hogar. */}
      {data.partner && (mutual ? (
        <Tarjeta className="border-foco/60 bg-doradotenue p-4">
          <p className="flex items-center gap-2 font-bold"><IconoBalanza className="h-5 w-5 text-doradotexto" /> Deuda mutua</p>
          <p className="mt-1 text-sm">{debtorName} le debe <strong className="nums">{formatMoney(mutual.amount, currency)}</strong> a {creditorName}.</p>
          <Boton onClick={liquidar} cargando={liquidando} className="mt-3 w-full">Liquidar ahora</Boton>
          {liquidarError && <div className="mt-2"><Alerta>{liquidarError}</Alerta></div>}
        </Tarjeta>
      ) : (
        <Tarjeta className="border-verde bg-verde/10 p-4">
          <p className="flex items-center gap-2 font-bold text-verde"><IconoCheck className="h-5 w-5" /> Están a mano</p>
          <p className="mt-1 text-sm text-humo">No hay deuda mutua pendiente.</p>
        </Tarjeta>
      ))}

      {dueReminders.length > 0 && (
        <Tarjeta className="border-foco/60 bg-doradotenue p-4">
          <p className="flex items-center gap-2 font-bold"><IconoCampana className="h-5 w-5 text-doradotexto" /> Recordatorios de pago</p>
          {dueReminders.map((r) => (
            <div key={r.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span>
                {r.title} · {reminderStatus(r) === 'overdue' ? `vencido (${formatDateEs(r.due_date)})` : reminderStatus(r) === 'today' ? 'hoy' : 'mañana'}
                {r.amount !== null ? ` · ${formatMoney(r.amount, currency)}` : ''}
              </span>
              <Link to="/recordatorios" className="shrink-0 rounded-xl bg-dorado px-3 py-1.5 font-bold text-tinta transition active:scale-95">Ver</Link>
            </div>
          ))}
        </Tarjeta>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display font-bold"><IconoMeta className="h-5 w-5 text-doradotexto" /> Metas</h2>
          {data.goals.length > 0 && (
            <Link to="/plan" className="text-xs font-semibold text-doradotexto hover:underline">Ver todas</Link>
          )}
        </div>
        {data.goals.length === 0 && <p className="text-sm text-humo">Aún no hay metas. Créalas en la pestaña Plan.</p>}
        {data.goals.slice(0, 3).map((g) => {
          const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0
          return (
            <Link key={g.id} to="/plan" className="mb-2 block rounded-2xl border border-borde bg-tarjeta p-3 shadow-tarjeta transition hover:border-foco/60 active:scale-[0.99]">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{g.name}</span>
                <span className="nums text-xs text-humo">{formatMoney(g.current, currency)} / {formatMoney(g.target, currency)} ({pct.toFixed(0)}%)</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso de meta ${g.name}`}
                className="mt-2 h-2 overflow-hidden rounded-full bg-borde"
              >
                <div className="h-full rounded-full bg-dorado transition-all" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          )
        })}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-display font-bold"><IconoCalendario className="h-5 w-5 text-doradotexto" /> Próximos vencimientos</h2>
        {upcoming.length === 0 && <p className="text-sm text-humo">Sin recurrentes próximos. Agrega suscripciones en Presupuesto.</p>}
        {upcoming.map(({ recurring: r, nextMonth }) => (
          <Tarjeta key={r.id} className="mb-2 flex justify-between p-3 text-sm">
            <span>Día {r.due_day}{nextMonth ? ' · próx. mes' : ''} · {r.title}</span>
            <strong className="nums">{formatMoney(r.amount, currency)}</strong>
          </Tarjeta>
        ))}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display font-bold"><IconoSobre className="h-5 w-5 text-doradotexto" /> Presupuesto del mes</h2>
          {data.categories.some((c) => c.monthly_limit > 0) && (
            <Link to="/presupuesto" className="text-xs font-semibold text-doradotexto hover:underline">Ver sobres</Link>
          )}
        </div>
        {data.categories.filter((c) => c.monthly_limit > 0).slice(0, 5).map((c) => {
          const spent = spentByCategory.get(c.id) ?? 0
          const pct = Math.min(100, (spent / c.monthly_limit) * 100)
          return (
            <div key={c.id} className="mb-2 text-sm">
              <div className="flex justify-between">
                <span>{c.icon} {c.name}</span>
                <span className="nums">{formatMoney(spent, currency)} / {formatMoney(c.monthly_limit, currency)}</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Gasto en ${c.name}`}
                className="mt-1 h-2 overflow-hidden rounded-full bg-borde"
              >
                <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-rojosuave' : pct >= 80 ? 'bg-dorado' : 'bg-verde'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </section>
    </main>
  )
}