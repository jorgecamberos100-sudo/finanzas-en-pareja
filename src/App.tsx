import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { supabase, getHouseholdId } from './lib/supabase'
import type { Account, Category, Goal, Household, Recurring, Transaction, UserProfile } from './types'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Movimientos from './pages/Movimientos'
import Presupuesto from './pages/Presupuesto'
import Plan from './pages/Plan'
import QuickAddModal from './components/QuickAddModal'

export interface AppData {
  household: Household | null
  me: UserProfile | null
  partner: UserProfile | null
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  goals: Goal[]
  recurring: Recurring[]
}

const EMPTY: AppData = {
  household: null, me: null, partner: null,
  accounts: [], categories: [], transactions: [], goals: [], recurring: [],
}

export default function App() {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const navigate = useNavigate()

  const householdId = getHouseholdId()

  async function loadAll() {
    if (!householdId) { setLoading(false); return }
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    if (!user) { setLoading(false); return }

    const [hh, members, accounts, categories, txs, goals, recurring] = await Promise.all([
      supabase.from('households').select('*').eq('id', householdId).single(),
      supabase.from('household_members').select('*, user:users(*)').eq('household_id', householdId),
      supabase.from('accounts').select('*').eq('household_id', householdId).order('name'),
      supabase.from('categories').select('*').eq('household_id', householdId).order('group').order('name'),
      supabase.from('transactions').select('*').eq('household_id', householdId).order('date', { ascending: false }).limit(500),
      supabase.from('goals').select('*').eq('household_id', householdId).order('due_date'),
      supabase.from('recurring').select('*').eq('household_id', householdId).eq('active', true),
    ])
    if (hh.error) { setSyncError(hh.error.message); setLoading(false); return }

    const memberRows = (members.data ?? []) as Array<{ user_id: string; user: UserProfile }>
    const me = memberRows.find((m) => m.user_id === user.id)?.user ?? { id: user.id, name: user.email ?? 'Yo', email: user.email ?? '' }
    const partner = memberRows.find((m) => m.user_id !== user.id)?.user ?? null

    setData({
      household: hh.data as Household,
      me, partner,
      accounts: (accounts.data ?? []) as Account[],
      categories: (categories.data ?? []) as Category[],
      transactions: (txs.data ?? []) as Transaction[],
      goals: (goals.data ?? []) as Goal[],
      recurring: (recurring.data ?? []) as Recurring[],
    })
    setLoading(false)
  }

  // Carga inicial + Realtime: todo cambio se refleja al instante en ambos teléfonos.
  useEffect(() => {
    loadAll()
    if (!householdId) return
    const channel = supabase
      .channel(`household-${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `household_id=eq.${householdId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `household_id=eq.${householdId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `household_id=eq.${householdId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goal_contributions' }, () => loadAll())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  async function addTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) {
    if (!data.household || !data.me) return
    // Estado optimista: se ve al instante, aunque la red falle se muestra el error.
    const optimistic: Transaction = {
      ...tx, id: `tmp-${Date.now()}`, household_id: data.household.id,
      dedupe_hash: tx.dedupe_hash ?? null, created_at: new Date().toISOString(),
    }
    setData((d) => ({ ...d, transactions: [optimistic, ...d.transactions] }))
    const { error } = await supabase.from('transactions').insert({
      household_id: data.household.id, account_id: tx.account_id, category_id: tx.category_id,
      created_by: data.me.id, paid_by: tx.paid_by, type: tx.type, amount: tx.amount,
      date: tx.date, merchant: tx.merchant, note: tx.note, split_pct: tx.split_pct,
      visibility: tx.visibility, review_status: tx.review_status, dedupe_hash: tx.dedupe_hash ?? null,
    })
    if (error) {
      setSyncError(`No se pudo guardar el movimiento: ${error.message}`)
      setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== optimistic.id) }))
    } else {
      setSyncError(null)
      await loadAll()
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-stone-500">Cargando…</div>
  if (!householdId || !data.household) return <Onboarding onDone={() => { setLoading(true); loadAll(); navigate('/') }} />

  const tabs = [
    { to: '/', label: 'Inicio', icon: '🏠' },
    { to: '/movimientos', label: 'Movimientos', icon: '🧾' },
    { to: '/presupuesto', label: 'Presupuesto', icon: '💰' },
    { to: '/plan', label: 'Plan', icon: '🎯' },
  ]

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      {syncError && (
        <div role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          ⚠️ {syncError}
        </div>
      )}
      <Routes>
        <Route path="/" element={<Dashboard data={data} onRefresh={loadAll} />} />
        <Route path="/movimientos" element={<Movimientos data={data} onRefresh={loadAll} />} />
        <Route path="/presupuesto" element={<Presupuesto data={data} onRefresh={loadAll} />} />
        <Route path="/plan" element={<Plan data={data} onRefresh={loadAll} />} />
        <Route path="/onboarding" element={<Onboarding onDone={() => navigate('/')} />} />
      </Routes>

      <button
        aria-label="Agregar movimiento"
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-2xl text-white shadow-lg transition active:scale-95"
      >
        +
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg justify-around border-t border-stone-200 bg-white py-2 dark:border-stone-800 dark:bg-stone-900">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}
            className={({ isActive }) => `flex flex-col items-center px-3 text-xs ${isActive ? 'font-semibold text-teal-700 dark:text-teal-400' : 'text-stone-500'}`}>
            <span className="text-xl">{t.icon}</span>{t.label}
          </NavLink>
        ))}
      </nav>

      {quickAddOpen && (
        <QuickAddModal data={data} onClose={() => setQuickAddOpen(false)} onSave={async (tx) => { await addTransaction(tx); setQuickAddOpen(false) }} />
      )}
    </div>
  )
}
