import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { supabase, getHouseholdId, setHouseholdId, clearHouseholdId, findMyHouseholdId } from './lib/supabase'
import { useReminderNotifications } from './lib/reminders'
import { cargarPlan } from './lib/planes-db'
import { onUpdateAvailable, applyUpdate } from './lib/sw-update'
import { PibbiProvider } from './lib/pibbi'
import { leerNombreMascota } from './lib/pibbi-identidad'
import PibbiReaction, { type ReactionContext } from './components/PibbiReaction'
import type { Account, Category, Goal, Household, HouseholdPlan, MoneyDate, Recurring, Reminder, Transaction, UserProfile } from './types'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Movimientos from './pages/Movimientos'
import Presupuesto from './pages/Presupuesto'
import Plan from './pages/Plan'
import Chat from './pages/Chat'
import Reminders from './pages/Reminders'
import QuickAddModal from './components/QuickAddModal'
import ThemeToggle from './components/ThemeToggle'

export interface AppData {
  household: Household | null
  me: UserProfile | null
  partner: UserProfile | null
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  goals: Goal[]
  recurring: Recurring[]
  reminders: Reminder[]
  /** Liquidaciones de deuda mutua (money_dates con settled_amount > 0). */
  settlements: MoneyDate[]
  /** Plan del hogar (Free / Plus / Fundadores, migración 005). null = Free. */
  plan: HouseholdPlan | null
}

const EMPTY: AppData = {
  household: null, me: null, partner: null,
  accounts: [], categories: [], transactions: [], goals: [], recurring: [], reminders: [], settlements: [], plan: null,
}

/**
 * Aviso de versión nueva (ver src/lib/sw-update.ts): cuando el SW nuevo
 * toma el control de la pestaña, aparece arriba con un botón para recargar
 * y traer la versión nueva. Se puede cerrar con la ✕; la recarga trae la
 * versión nueva de todos modos en la próxima navegación (NetworkFirst).
 */
function UpdateBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => onUpdateAvailable(() => setShow(true)), [])
  if (!show) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-lg px-3 pt-3">
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-dorado bg-tarjeta p-3 shadow-lg">
          <span className="flex-1 text-sm text-crema">✨ Nueva versión disponible</span>
          <button
            onClick={applyUpdate}
            className="rounded-lg bg-dorado px-3 py-1.5 text-sm font-extrabold tracking-wide text-tinta"
          >
            Actualizar ahora
          </button>
          <button aria-label="Cerrar aviso" onClick={() => setShow(false)} className="px-2 text-lg text-humo">
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [reaction, setReaction] = useState<{ ctx: ReactionContext; msg: string; key: number } | null>(null)
  const reactionTimer = useRef<number | null>(null)
  const navigate = useNavigate()

  /** PIBBI reacciona cada que se registra un dato, sin bloquear nada. */
  function showReaction(ctx: ReactionContext, msg: string) {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
    setReaction({ ctx, msg, key: Date.now() })
    reactionTimer.current = window.setTimeout(() => setReaction(null), 4500)
  }

  const householdId = getHouseholdId()

  /**
   * Carga todo el hogar. El try/finally garantiza que "Cargando…" siempre
   * se apaga: si una query de Promise.all falla (red caída),
   * setLoading(false) corre y muestra el mensaje amigable de error.
   */
  async function loadAll() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) {
        setLoading(false)
        return
      }

      // Si el localStorage está vacío (otro celular, datos borrados, app
      // reinstalada) pero hay sesión, recuperar el hogar desde la BD en vez
      // de mandar al usuario a registrarse de nuevo como si fuera nuevo.
      let hid: string | null = getHouseholdId()
      if (!hid) {
        hid = await findMyHouseholdId(user.id)
        if (hid) setHouseholdId(hid)
      }
      if (!hid) {
        setLoading(false)
        return
      }

      const [hh, members, accounts, categories, txs, goals, recurring, reminders, settlements] = await Promise.all([
        supabase.from('households').select('*').eq('id', hid).single(),
        supabase.from('household_members').select('*, user:users(*)').eq('household_id', hid),
        supabase.from('accounts').select('*').eq('household_id', hid).order('name'),
        supabase.from('categories').select('*').eq('household_id', hid).order('group').order('name'),
        supabase.from('transactions').select('*').eq('household_id', hid).order('date', { ascending: false }).limit(500),
        supabase.from('goals').select('*').eq('household_id', hid).order('due_date'),
        supabase.from('recurring').select('*').eq('household_id', hid).eq('active', true),
        supabase.from('reminders').select('*').eq('household_id', hid).order('due_date'),
        // Liquidaciones de deuda mutua: sin esto "Liquidar ahora" no servía,
        // la deuda reaparecía al recargar (ver computeMutualBalance).
        supabase.from('money_dates').select('*').eq('household_id', hid).order('date', { ascending: false }),
      ])
      if (hh.error) { setSyncError(hh.error.message); return }

      // Plan del hogar (migración 005). Se carga aparte y tolera que la
      // tabla aún no exista en producción: sin fila, el hogar es Free.
      const planRow = await cargarPlan(hid)

      const memberRows = (members.data ?? []) as Array<{ user_id: string; user: UserProfile }>
      const me = memberRows.find((m) => m.user_id === user.id)?.user ?? { id: user.id, name: user.email ?? 'Yo', email: user.email ?? '' }
      const partnerMember = memberRows.find((m) => m.user_id !== user.id)
      const partner = partnerMember?.user ?? (partnerMember ? { id: partnerMember.user_id, name: 'Pareja', email: '' } : null)

      setData({
        household: hh.data as Household,
        me, partner,
        accounts: (accounts.data ?? []) as Account[],
        categories: (categories.data ?? []) as Category[],
        transactions: (txs.data ?? []) as Transaction[],
        goals: (goals.data ?? []) as Goal[],
        recurring: (recurring.data ?? []) as Recurring[],
        reminders: (reminders.data ?? []) as Reminder[],
        settlements: (settlements.data ?? []) as MoneyDate[],
        plan: planRow,
      })
      // Carga exitosa: limpiar cualquier error de sincronización anterior.
      setSyncError(null)
    } catch (e) {
      setSyncError(e instanceof Error ? `No se pudo cargar tus datos: ${e.message}` : 'No se pudo cargar tus datos. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    clearHouseholdId()
    setData(EMPTY)
    navigate('/')
  }

  // Notificaciones locales: con el permiso de notificaciones, la app revisa cada
  // 30 s si hay un recordatorio que deba sonar en este celular.
  useReminderNotifications(data.reminders)

  // Escuchar cambios de sesión de Supabase (login, logout, refresh de token)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearHouseholdId()
        setData(EMPTY)
        setLoading(false)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void loadAll()
      }
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders', filter: `household_id=eq.${householdId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'money_dates', filter: `household_id=eq.${householdId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter: `household_id=eq.${householdId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_plan', filter: `household_id=eq.${householdId}` }, () => loadAll())
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
      showReaction('calculando', `¡Guardado! ${leerNombreMascota()} ya hizo las cuentas 🧮`)
      await loadAll()
    }
  }

  if (loading) return <PibbiProvider><UpdateBanner /><div className="flex min-h-screen items-center justify-center text-humo">Cargando…</div></PibbiProvider>
  if (!householdId || !data.household) return <PibbiProvider><UpdateBanner /><Onboarding onDone={() => { setLoading(true); loadAll(); navigate('/') }} /></PibbiProvider>

  // Etiqueta corta para pantallas angostas (360 px): con 6 pestañas y
  // px-3, la última ("Avisos") se salía 46 px de la pantalla y no se podía
  // tocar. En móvil se reparte el ancho en partes iguales (flex-1) y se
  // usan las etiquetas cortas; en ≥640 px, las completas.
  const tabs = [
    { to: '/', label: 'Inicio', short: 'Inicio', icon: '🏠' },
    { to: '/movimientos', label: 'Movimientos', short: 'Movim.', icon: '🧾' },
    { to: '/presupuesto', label: 'Presupuesto', short: 'Presup.', icon: '💰' },
    { to: '/plan', label: 'Plan', short: 'Plan', icon: '🎯' },
    { to: '/chat', label: 'Chat', short: 'Chat', icon: '💬' },
    { to: '/recordatorios', label: 'Avisos', short: 'Avisos', icon: '🔔' },
  ]

  return (
    <PibbiProvider>
    <UpdateBanner />
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      {syncError && (
        <div role="alert" className="m-3 rounded-xl bg-rojosuave/10 p-3 text-sm text-rojosuave  ">
          ⚠️ {syncError}
        </div>
      )}
      {reaction && (
        <div className="px-3 pt-3">
          <PibbiReaction key={reaction.key} contexto={reaction.ctx} mensaje={reaction.msg} />
        </div>
      )}
      <Routes>
        <Route path="/" element={<Dashboard data={data} onRefresh={loadAll} onSignOut={handleSignOut} />} />
        <Route path="/movimientos" element={<Movimientos data={data} onRefresh={loadAll} />} />
        <Route path="/presupuesto" element={<Presupuesto data={data} onRefresh={loadAll} />} />
        <Route path="/plan" element={<Plan data={data} onRefresh={loadAll} />} />
        <Route path="/chat" element={<Chat data={data} onSave={addTransaction} onRefresh={loadAll} />} />
        <Route path="/recordatorios" element={<Reminders data={data} onRefresh={loadAll} />} />
        <Route path="/onboarding" element={<Onboarding onDone={() => navigate('/')} />} />
      </Routes>

      <button
        aria-label="Agregar movimiento"
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-dorado text-2xl text-tinta shadow-[0_8px_24px_rgba(245,197,66,0.45)] transition active:scale-95"
      >
        +
      </button>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg justify-around border-t border-borde bg-tarjeta py-2  ">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}
            className={({ isActive }) => `flex min-w-0 flex-1 flex-col items-center px-1 text-center text-[11px] leading-tight sm:px-3 sm:text-xs ${isActive ? 'font-semibold text-doradotexto ' : 'text-humo'}`}>
            <span className="text-xl" aria-hidden="true">{t.icon}</span>
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </NavLink>
        ))}
        <ThemeToggle className="flex min-w-0 flex-col items-center justify-center px-2 text-humo" />
      </nav>

      {quickAddOpen && (
        <QuickAddModal data={data} onClose={() => setQuickAddOpen(false)} onSave={async (tx) => { await addTransaction(tx); setQuickAddOpen(false) }} />
      )}
    </div>
    </PibbiProvider>
  )
}
