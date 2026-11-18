import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { formatDateEs, formatMoney, todayIso } from '../lib/format'
import { supabase } from '../lib/supabase'
import CsvImport from '../components/CsvImport'
import Mascota from '../components/Mascota'

interface Props { data: AppData; onRefresh: () => void }

export default function Movimientos({ data, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

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
    const header = 'fecha,comercio,monto,tipo,categoria,cuenta,quien_pago,nota\n'
    const body = data.transactions.map((tx) =>
      [tx.date, `"${tx.merchant ?? ''}"`, tx.amount, tx.type, categoryById.get(tx.category_id ?? '')?.name ?? '', accountById.get(tx.account_id)?.name ?? '', userById.get(tx.paid_by) ?? '', `"${tx.note ?? ''}"`].join(','),
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movimientos</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowImport((v) => !v)} className="rounded-xl bg-elevado px-3 py-2 text-sm font-semibold ">Importar CSV</button>
          <button onClick={exportCsv} className="rounded-xl bg-elevado px-3 py-2 text-sm font-semibold ">Exportar CSV</button>
        </div>
      </div>

      {txError && (
        <div role="alert" className="rounded-xl bg-[#FF8A8014] p-3 text-sm text-rojosuave">
          ⚠️ {txError}
        </div>
      )}

      {showImport && <CsvImport data={data} onDone={onRefresh} />}

      <div className="space-y-2">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por comercio, nota o monto…"
            aria-label="Buscar movimientos"
            className="w-full rounded-xl border border-borde p-2.5 pl-9 text-sm"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo" aria-hidden="true">🔍</span>
          {search && (
            <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-humo hover:text-crema">✕</button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} aria-label="Filtrar por persona" className="rounded-xl border p-2 text-sm">
            <option value="">Persona: todas</option>
            {[data.me, data.partner].filter(Boolean).map((u) => <option key={u!.id} value={u!.id}>{u!.name}</option>)}
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label="Filtrar por categoría" className="rounded-xl border p-2 text-sm">
            <option value="">Categoría: todas</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} aria-label="Filtrar por cuenta" className="rounded-xl border p-2 text-sm">
            <option value="">Cuenta: todas</option>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-humo px-1">
            <span>Filtrando {filtered.length} de {data.transactions.length} movimientos</span>
            <button onClick={clearFilters} className="font-semibold text-doradotexto hover:underline">Limpiar filtros</button>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">⏳ Por revisar ({pending.length})</h2>
          <p className="mb-2 text-sm text-humo">Movimientos importados o con nota. Tu pareja puede aprobarlos.</p>
          {pending.map((tx) => (
            <TxRow key={tx.id} tx={tx} currency={currency} categoryById={categoryById} accountById={accountById} userById={userById}
              isDeleting={deletingId === tx.id}
              onDelete={() => deleteTx(tx.id, tx.merchant, tx.amount)}
              action={<button onClick={() => approve(tx.id)} disabled={approvingId === tx.id} className="rounded-lg bg-dorado px-3 py-1 text-xs font-bold text-tinta disabled:opacity-50">{approvingId === tx.id ? '…' : 'Aprobar'}</button>} />
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Historial</h2>
        {approved.length === 0 && pending.length === 0 && (
          hasActiveFilters ? (
            <div className="rounded-2xl border border-borde bg-tarjeta p-6 text-center">
              <p className="font-semibold text-crema">No se encontraron movimientos con los filtros actuales.</p>
              <p className="mt-1 text-sm text-humo">Prueba ajustando los términos de búsqueda o los filtros.</p>
              <button onClick={clearFilters} className="mt-3 rounded-xl bg-elevado px-4 py-2 text-sm font-semibold text-doradotexto">Limpiar filtros</button>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-foco/60 bg-tarjeta p-4">
              <Mascota pose="ahorrando" alt="PIBBI sentado con una moneda" className="h-20 w-20 shrink-0" />
              <div>
                <p className="font-bold">Aún no hay movimientos 🐷</p>
                <p className="text-sm text-humo">Toca “+” para registrar el primero, o mándale a PIBBI la foto de un ticket en el Chat.</p>
              </div>
            </div>
          )
        )}
        {approved.map((tx) => (
          <TxRow key={tx.id} tx={tx} currency={currency} categoryById={categoryById} accountById={accountById} userById={userById}
            isDeleting={deletingId === tx.id}
            onDelete={() => deleteTx(tx.id, tx.merchant, tx.amount)} />
        ))}
      </section>
    </main>
  )
}

function TxRow({ tx, currency, categoryById, accountById, userById, action, onDelete, isDeleting }: {
  tx: import('../types').Transaction
  currency: string
  categoryById: Map<string, import('../types').Category>
  accountById: Map<string, import('../types').Account>
  userById: Map<string, string>
  action?: React.ReactNode
  onDelete?: () => void
  isDeleting?: boolean
}) {
  const cat = tx.category_id ? categoryById.get(tx.category_id) : undefined
  const sign = tx.type === 'ingreso' ? '+' : tx.type === 'gasto' ? '−' : '⇄'
  const color = tx.type === 'ingreso' ? 'text-verde' : tx.type === 'gasto' ? 'text-rojosuave' : 'text-menta'
  return (
    <div className="mb-2 flex items-center justify-between rounded-2xl border border-borde bg-tarjeta p-3  ">
      <div className="min-w-0 pr-2">
        <p className="truncate font-semibold">{cat ? `${cat.icon} ${cat.name}` : tx.type === 'transferencia' ? '⇄ Transferencia' : 'Sin categoría'}</p>
        <p className="truncate text-xs text-humo">
          {tx.merchant ? `${tx.merchant} · ` : ''}{formatDateEs(tx.date)} · {accountById.get(tx.account_id)?.name} · pagó {userById.get(tx.paid_by) ?? '—'}
          {tx.note ? ` · ${tx.note}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`font-bold ${color}`}>{sign}{formatMoney(tx.amount, currency)}</span>
        {action}
        {onDelete && (
          <button
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={`Eliminar movimiento de ${tx.merchant ?? 'comercio'} por ${formatMoney(tx.amount, currency)}`}
            title="Eliminar movimiento"
            className="rounded-lg bg-elevado px-2 py-1 text-xs text-humo transition hover:text-rojosuave disabled:opacity-50"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  )
}
