import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData } from '../App'
import { formatDateEs, formatMoney, todayIso } from '../lib/format'
import { defPlan, esMovimientoAntiguo, puedeExportarCsv } from '../lib/planes'
import { supabase } from '../lib/supabase'
import CsvImport from '../components/CsvImport'
import Paywall from '../components/Paywall'
import Mascota from '../components/Mascota'
import PibbiHeader from '../components/PibbiHeader'
import { PAGE_PIBBI_POSES } from '../lib/pibbi-poses'
import { usePibbi } from '../lib/pibbi'
import { Alerta, ChipCategoria, Icono } from '../components/ui'
import type { Account, Category, Transaction } from '../types'

interface Props { data: AppData; onRefresh: () => void }

export default function Movimientos({ data, onRefresh }: Props) {
  const { name: mascotName } = usePibbi()
  const [search, setSearch] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  // Motivo del paywall (null = cerrado).
  const [paywall, setPaywall] = useState<string | null>(null)

  const currency = data.household?.currency ?? 'MXN'
  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const accountById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])
  const userById = useMemo(() => {
    const m = new Map<string, string>()
    if (data.me) m.set(data.me.id, data.me.name)
    if (data.partner) m.set(data.partner.id, data.partner.name)
    return m
  }, [data.me, data.partner])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return data.transactions.filter((tx) => {
      if (filterPerson && tx.paid_by !== filterPerson) return false
      if (filterCategory && tx.category_id !== filterCategory) return false
      if (filterAccount && tx.account_id !== filterAccount) return false
      if (s) {
        const merchantMatch = (tx.merchant ?? '').toLowerCase().includes(s)
        const noteMatch = (tx.note ?? '').toLowerCase().includes(s)
        const amountMatch = String(tx.amount).includes(s)
        if (!merchantMatch && !noteMatch && !amountMatch) return false
      }
      return true
    })
  }, [data.transactions, filterPerson, filterCategory, filterAccount, search])

  const pending = useMemo(() => filtered.filter((tx) => tx.review_status === 'pendiente'), [filtered])
  const approved = useMemo(() => filtered.filter((tx) => tx.review_status !== 'pendiente'), [filtered])

  // Historial: en Free solo se ven los últimos 90 días; lo más viejo queda
  // bloqueado con la oferta de Plus (no se borra nada, solo no se muestra).
  // En Plus/Fundadores el historial es completo.
  const hoy = todayIso()
  const recientes = useMemo(
    () => approved.filter((tx) => !esMovimientoAntiguo(data.plan, tx.date, hoy)),
    [approved, data.plan, hoy],
  )
  const antiguos = useMemo(
    () => approved.filter((tx) => esMovimientoAntiguo(data.plan, tx.date, hoy)),
    [approved, data.plan, hoy],
  )

  const hasActiveFilters = Boolean(filterPerson || filterCategory || filterAccount || search.trim())
  function clearFilters() {
    setFilterPerson('')
    setFilterCategory('')
    setFilterAccount('')
    setSearch('')
  }

  async function approve(id: string) {
    if (approvingId) return
    setApprovingId(id)
    setTxError(null)
    const { error } = await supabase.from('transactions').update({ review_status: 'aprobado' }).eq('id', id)
    setApprovingId(null)
    if (error) {
      setTxError(`No se pudo aprobar: ${error.message}`)
      return
    }
    onRefresh()
  }

  async function deleteTx(id: string, merchant: string | null, amount: number) {
    if (deletingId) return
    if (!confirm(`¿Eliminar este movimiento${merchant ? ` de "${merchant}"` : ''} por ${formatMoney(amount, currency)}?`)) return
    setDeletingId(id)
    setTxError(null)
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    setDeletingId(null)
    if (error) {
      setTxError(`No se pudo eliminar el movimiento: ${error.message}`)
      return
    }
    onRefresh()
  }

  function exportCsv() {
    // Exportar CSV es función Plus: en Free abre el paywall en vez de descargar.
    if (!puedeExportarCsv(data.plan)) {
      setPaywall(`Exportar el CSV es una función Plus. El plan ${defPlan(data.plan).nombre} no lo incluye.`)
      return
    }
    const header = 'fecha,comercio,monto,tipo,categoria,cuenta,quien_pago,nota\n'
    const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const body = data.transactions.map((tx) =>
      [
        tx.date,
        escapeCsv(tx.merchant ?? ''),
        tx.amount,
        tx.type,
        escapeCsv(categoryById.get(tx.category_id ?? '')?.name ?? ''),
        escapeCsv(accountById.get(tx.account_id)?.name ?? ''),
        escapeCsv(userById.get(tx.paid_by) ?? ''),
        escapeCsv(tx.note ?? ''),
      ].join(','),
    ).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finanzas-en-pareja-${todayIso()}.csv`
    a.click()
    // No revocar de inmediato: algunos navegadores cancelan la descarga
    // si la URL se libera antes de que arranque.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="space-y-4 p-4">
      <PibbiHeader pose={PAGE_PIBBI_POSES.movimientos} title="Movimientos">
        <button onClick={() => setShowImport((v) => !v)} className="btn-secundario-chico">Importar CSV</button>
        <button onClick={exportCsv} className="btn-secundario-chico">Exportar CSV</button>
      </PibbiHeader>

      {txError && <Alerta>{txError}</Alerta>}

      {showImport && <CsvImport data={data} onDone={onRefresh} />}

      <div className="space-y-2">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por comercio, nota o monto…"
            aria-label="Buscar movimientos"
            className="campo w-full pr-10"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-humo" aria-hidden="true">
            <Icono nombre="buscar" className="h-5 w-5" />
          </span>
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="btn-icono absolute right-9 top-1/2 h-8 w-8 -translate-y-1/2"
            >
              <Icono nombre="cerrar" className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} aria-label="Filtrar por persona" className="campo-chico min-w-[150px] shrink-0">
            <option value="">Persona: todas</option>
            {[data.me, data.partner].filter((u): u is NonNullable<typeof u> => Boolean(u)).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label="Filtrar por categoría" className="campo-chico min-w-[160px] shrink-0">
            <option value="">Categoría: todas</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} aria-label="Filtrar por cuenta" className="campo-chico min-w-[145px] shrink-0">
            <option value="">Cuenta: todas</option>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between px-1 text-xs text-humo">
            <span>Filtrando {filtered.length} de {data.transactions.length} movimientos</span>
            <button onClick={clearFilters} className="font-semibold text-doradotexto hover:underline">Limpiar filtros</button>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Por revisar ({pending.length})</h2>
          <p className="mb-2 text-sm text-humo">Movimientos importados o con nota. Tu pareja puede aprobarlos.</p>
          <div className="tarjeta divide-y divide-borde overflow-hidden">
            {pending.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                currency={currency}
                categoryById={categoryById}
                accountById={accountById}
                userById={userById}
                isDeleting={deletingId === tx.id}
                onDelete={() => deleteTx(tx.id, tx.merchant, tx.amount)}
                action={(
                  <button
                    onClick={() => approve(tx.id)}
                    disabled={approvingId === tx.id}
                    className="btn-primario-chico"
                  >
                    {approvingId === tx.id ? 'Aprobando…' : 'Aprobar'}
                  </button>
                )}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Historial</h2>
        {approved.length === 0 && pending.length === 0 && (
          hasActiveFilters ? (
            <div className="tarjeta p-6 text-center">
              <p className="font-semibold text-crema">No se encontraron movimientos con los filtros actuales.</p>
              <p className="mt-1 text-sm text-humo">Prueba ajustando los términos de búsqueda o los filtros.</p>
              <button onClick={clearFilters} className="btn-fantasma mt-3">Limpiar filtros</button>
            </div>
          ) : (
            <div className="tarjeta flex flex-col items-center p-6 text-center">
              <Mascota pose="ahorrando" alt={`${mascotName} sentado con una moneda`} className="mb-3 h-24 w-24" />
              <p className="font-bold">Aún no hay movimientos</p>
              <p className="mt-1 max-w-sm text-sm text-humo">Toca “+” para registrar el primero, o mándale a {mascotName} la foto de un ticket en el Chat.</p>
            </div>
          )
        )}
        {recientes.length > 0 && (
          <div className="tarjeta divide-y divide-borde overflow-hidden">
            {recientes.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                currency={currency}
                categoryById={categoryById}
                accountById={accountById}
                userById={userById}
                isDeleting={deletingId === tx.id}
                onDelete={() => deleteTx(tx.id, tx.merchant, tx.amount)}
              />
            ))}
          </div>
        )}
        {antiguos.length > 0 && (
          <div className="tarjeta mt-3 border border-dorado/40 bg-dorado/5 p-4">
            <p className="font-bold">{antiguos.length} movimientos de hace más de 90 días</p>
            <p className="mt-1 text-sm text-humo">
              El plan {defPlan(data.plan).nombre} muestra los últimos 90 días. Con Plus ves todo tu historial.
            </p>
            <button
              onClick={() => setPaywall(`Tienes ${antiguos.length} movimientos de hace más de 90 días. Con Plus ves todo tu historial, sin límite.`)}
              className="btn-primario mt-3 w-full"
            >
              Ver historial completo con Plus
            </button>
          </div>
        )}
      </section>

      {paywall && <Paywall motivo={paywall} onClose={() => setPaywall(null)} />}
    </main>
  )
}

function TxRow({ tx, currency, categoryById, accountById, userById, action, onDelete, isDeleting }: {
  tx: Transaction
  currency: string
  categoryById: Map<string, Category>
  accountById: Map<string, Account>
  userById: Map<string, string>
  action?: ReactNode
  onDelete?: () => void
  isDeleting?: boolean
}) {
  const cat = tx.category_id ? categoryById.get(tx.category_id) : undefined
  const sign = tx.type === 'ingreso' ? '+' : tx.type === 'gasto' ? '−' : '⇄'
  const color = tx.type === 'ingreso' ? 'text-verde' : tx.type === 'gasto' ? 'text-crema' : 'text-menta'
  return (
    <div className="flex items-center justify-between gap-2 p-3">
      <div className="flex min-w-0 items-center gap-3">
        {cat && <ChipCategoria nombre={cat.name} group={cat.group} className="h-8 w-8" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {cat ? cat.name : tx.type === 'transferencia' ? 'Transferencia' : 'Sin categoría'}
          </p>
          <p className="truncate text-xs text-humo">
            {tx.merchant ? `${tx.merchant} · ` : ''}{formatDateEs(tx.date)} · {accountById.get(tx.account_id)?.name} · pagó {userById.get(tx.paid_by) ?? '—'}
            {tx.note ? ` · ${tx.note}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`nums whitespace-nowrap text-sm font-bold ${color}`}>{sign}{formatMoney(tx.amount, currency)}</span>
        {action}
        {onDelete && (
          <button
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={`Eliminar movimiento de ${tx.merchant ?? 'comercio'} por ${formatMoney(tx.amount, currency)}`}
            title="Eliminar movimiento"
            className="btn-icono h-9 w-9 text-humo hover:text-rojosuave disabled:opacity-50"
          >
            <Icono nombre="basura" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
