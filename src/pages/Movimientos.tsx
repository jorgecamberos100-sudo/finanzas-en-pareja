import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import { formatDateEs, formatMoney, todayIso } from '../lib/format'
import { supabase } from '../lib/supabase'
import CsvImport from '../components/CsvImport'
import Mascota from '../components/Mascota'

interface Props { data: AppData; onRefresh: () => void }

export default function Movimientos({ data, onRefresh }: Props) {
  const [filterPerson, setFilterPerson] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [showImport, setShowImport] = useState(false)

  const currency = data.household?.currency ?? 'MXN'
  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const accountById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])
  const userById = useMemo(() => {
    const m = new Map<string, string>()
    if (data.me) m.set(data.me.id, data.me.name)
    if (data.partner) m.set(data.partner.id, data.partner.name)
    return m
  }, [data.me, data.partner])

  const filtered = data.transactions.filter((tx) =>
    (!filterPerson || tx.paid_by === filterPerson) &&
    (!filterCategory || tx.category_id === filterCategory) &&
    (!filterAccount || tx.account_id === filterAccount),
  )
  const pending = filtered.filter((tx) => tx.review_status === 'pendiente')
  const approved = filtered.filter((tx) => tx.review_status !== 'pendiente')

  async function approve(id: string) {
    await supabase.from('transactions').update({ review_status: 'aprobado' }).eq('id', id)
    onRefresh()
  }

  function exportCsv() {
    const header = 'fecha,comercio,monto,tipo,categoria,cuenta,quien_pago,nota\n'
    const body = data.transactions.map((tx) =>
      [tx.date, `"${tx.merchant ?? ''}"`, tx.amount, tx.type, categoryById.get(tx.category_id ?? '')?.name ?? '', accountById.get(tx.account_id)?.name ?? '', userById.get(tx.paid_by) ?? '', `"${tx.note ?? ''}"`].join(','),
    ).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finanzas-en-pareja-${todayIso()}.csv`
    a.click()
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

      {showImport && <CsvImport data={data} onDone={onRefresh} />}

      <div className="grid grid-cols-3 gap-2">
        <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className="rounded-xl border p-2 text-sm">
          <option value="">Persona: todas</option>
          {[data.me, data.partner].filter(Boolean).map((u) => <option key={u!.id} value={u!.id}>{u!.name}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-xl border p-2 text-sm">
          <option value="">Categoría: todas</option>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="rounded-xl border p-2 text-sm">
          <option value="">Cuenta: todas</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">⏳ Por revisar ({pending.length})</h2>
          <p className="mb-2 text-sm text-humo">Movimientos importados o con nota. Tu pareja puede aprobarlos.</p>
          {pending.map((tx) => (
            <TxRow key={tx.id} tx={tx} currency={currency} categoryById={categoryById} accountById={accountById} userById={userById}
              action={<button onClick={() => approve(tx.id)} className="rounded-lg bg-rosafuerte px-3 py-1 text-xs font-bold text-noche">Aprobar</button>} />
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Historial</h2>
        {approved.length === 0 && pending.length === 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-rosafuerte/40 bg-tarjeta p-4">
            <Mascota src="/mascota-ahorrando.png" alt="El cerdito sentado con una moneda" className="h-20 w-20 shrink-0" />
            <div>
              <p className="font-bold">Aún no hay movimientos 🐷</p>
              <p className="text-sm text-humo">Toca “+” para registrar el primero, o mándame la foto de un ticket en el Chat.</p>
            </div>
          </div>
        )}
        {approved.map((tx) => (
          <TxRow key={tx.id} tx={tx} currency={currency} categoryById={categoryById} accountById={accountById} userById={userById} />
        ))}
      </section>
    </main>
  )
}

function TxRow({ tx, currency, categoryById, accountById, userById, action }: {
  tx: import('../types').Transaction
  currency: string
  categoryById: Map<string, import('../types').Category>
  accountById: Map<string, import('../types').Account>
  userById: Map<string, string>
  action?: React.ReactNode
}) {
  const cat = tx.category_id ? categoryById.get(tx.category_id) : undefined
  const sign = tx.type === 'ingreso' ? '+' : tx.type === 'gasto' ? '−' : '⇄'
  const color = tx.type === 'ingreso' ? 'text-verde' : tx.type === 'gasto' ? 'text-rojosuave' : 'text-menta'
  return (
    <div className="mb-2 flex items-center justify-between rounded-2xl border border-borde bg-tarjeta p-3  ">
      <div className="min-w-0">
        <p className="truncate font-semibold">{cat ? `${cat.icon} ${cat.name}` : tx.type === 'transferencia' ? '⇄ Transferencia' : 'Sin categoría'}</p>
        <p className="truncate text-xs text-humo">
          {tx.merchant ? `${tx.merchant} · ` : ''}{formatDateEs(tx.date)} · {accountById.get(tx.account_id)?.name} · pagó {userById.get(tx.paid_by) ?? '—'}
          {tx.note ? ` · ${tx.note}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-bold ${color}`}>{sign}{formatMoney(tx.amount, currency)}</span>
        {action}
      </div>
    </div>
  )
}
