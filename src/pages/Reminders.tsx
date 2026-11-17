import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../App'
import type { Reminder, ReminderRecurrence } from '../types'
import { formatDateEs, formatMoney, todayIso } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_ALARM_TIME,
  RECURRENCE_LABELS,
  daysUntil,
  isPushSubscribed,
  nextDueDate,
  notificationPermission,
  notificationsSupported,
  pushSupported,
  reminderStatus,
  requestNotificationPermission,
  subscribePush,
  unsubscribePush,
} from '../lib/reminders'

interface Props {
  data: AppData
  onRefresh: () => void
}

function nextRecurringDate(dueDay: number, today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const lastThis = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (dueDay >= d) return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dueDay, lastThis)).padStart(2, '0')}`
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  const lastNext = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dueDay, lastNext)).padStart(2, '0')}`
}

export default function Reminders({ data, onRefresh }: Props) {
  const currency = data.household?.currency ?? 'MXN'
  const reminders = data.reminders ?? []
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(todayIso())
  const [dueTime, setDueTime] = useState(DEFAULT_ALARM_TIME)
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>('once')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(notificationPermission())
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    void isPushSubscribed().then(setPushOn)
  }, [])

  const sorted = useMemo(
    () => [...reminders].sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.due_time ?? '').localeCompare(b.due_time ?? '')),
    [reminders],
  )
  const pending = sorted.filter((r) => !r.is_done)
  const urgent = pending.filter((r) => reminderStatus(r) === 'overdue' || reminderStatus(r) === 'today' || reminderStatus(r) === 'tomorrow')
  const upcoming = pending.filter((r) => reminderStatus(r) === 'upcoming')
  const done = sorted.filter((r) => r.is_done).slice(0, 10)

  function resetForm() {
    setTitle('')
    setAmount('')
    setDueDate(todayIso())
    setDueTime(DEFAULT_ALARM_TIME)
    setRecurrence('once')
    setCategoryId('')
    setNote('')
    setEditingId(null)
  }

  function startEdit(r: Reminder) {
    setTitle(r.title)
    setAmount(r.amount !== null ? String(r.amount) : '')
    setDueDate(r.due_date)
    setDueTime(r.due_time ?? DEFAULT_ALARM_TIME)
    setRecurrence(r.recurrence)
    setCategoryId(r.category_id ?? '')
    setNote(r.note ?? '')
    setEditingId(r.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveReminder() {
    if (!data.household || !data.me) return
    if (!title.trim()) { setMessage('Escribe el título del recordatorio (ej. Renta).'); return }
    if (!dueDate) { setMessage('Elige la fecha en que vence.'); return }
    const amountNum = amount.trim() ? Number(amount.replace(',', '.')) : null
    if (amount.trim() && (!amountNum || amountNum <= 0)) { setMessage('El monto debe ser mayor a $0.'); return }
    setBusy(true)
    setMessage(null)
    const payload = {
      household_id: data.household.id,
      created_by: data.me.id,
      title: title.trim().slice(0, 200),
      amount: amountNum,
      due_date: dueDate,
      due_time: dueTime || null,
      recurrence,
      category_id: categoryId || null,
      note: note.trim() || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    const { error } = editingId
      ? await supabase.from('reminders').update(payload).eq('id', editingId)
      : await supabase.from('reminders').insert(payload)
    setBusy(false)
    if (error) { setMessage(error.message); return }
    setMessage(editingId ? 'Recordatorio actualizado 🔔' : 'Recordatorio creado 🔔 Te avisaré ese día.')
    resetForm()
    onRefresh()
  }

  async function markDone(r: Reminder) {
    // Recurrente: no se "termina", avanza a la siguiente fecha.
    const next = r.recurrence !== 'once' ? nextDueDate(r.due_date, r.recurrence) : null
    const { error } = await supabase
      .from('reminders')
      .update(next ? { due_date: next, done_at: new Date().toISOString() } : { is_done: true, done_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) { setMessage(error.message); return }
    setMessage(next ? `Pagado. El siguiente quedó para el ${formatDateEs(next)}.` : 'Marcado como pagado ✅')
    onRefresh()
  }

  async function reactivate(r: Reminder) {
    const { error } = await supabase.from('reminders').update({ is_done: false, done_at: null }).eq('id', r.id)
    if (error) { setMessage(error.message); return }
    onRefresh()
  }

  async function deleteReminder(r: Reminder) {
    if (!confirm(`¿Eliminar el recordatorio “${r.title}”?`)) return
    const { error } = await supabase.from('reminders').delete().eq('id', r.id)
    if (error) { setMessage(error.message); return }
    onRefresh()
  }

  async function createFromRecurring(recurringId: string) {
    const rec = data.recurring.find((x) => x.id === recurringId)
    if (!rec || !data.household || !data.me) return
    const { error } = await supabase.from('reminders').insert({
      household_id: data.household.id,
      created_by: data.me.id,
      title: rec.title,
      amount: rec.amount,
      due_date: nextRecurringDate(rec.due_day, todayIso()),
      due_time: DEFAULT_ALARM_TIME,
      recurrence: 'monthly',
      category_id: rec.category_id,
      recurring_id: rec.id,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    if (error) { setMessage(error.message); return }
    setMessage(`Recordatorio mensual de “${rec.title}” creado 🔔`)
    onRefresh()
  }

  async function enableAlarms() {
    const p = await requestNotificationPermission()
    setPerm(p)
    if (p !== 'granted') { setMessage('Activa el permiso de notificaciones para este sitio en los ajustes del navegador.'); return }
    if (!data.household || !data.me) return
    setPushBusy(true)
    const res = await subscribePush(supabase, data.household.id, data.me.id)
    setPushBusy(false)
    if (!res.ok) {
      // Sin push, las alarmas locales (app abierta) ya funcionan con el permiso.
      setMessage(`Alarma local activada ✅. Push en este celular: ${res.error}`)
      return
    }
    setPushOn(true)
    setMessage('Alarmas activadas en este celular 🔔 También te avisaré aunque la app esté cerrada.')
  }

  async function disablePush() {
    if (!data.me) return
    setPushBusy(true)
    await unsubscribePush(supabase, data.me.id)
    setPushBusy(false)
    setPushOn(false)
    setMessage('Push desactivado en este celular. Las alarmas locales (app abierta) siguen con el permiso de notificaciones.')
  }

  function card(r: Reminder) {
    const status = reminderStatus(r)
    const d = daysUntil(r.due_date)
    const badge =
      status === 'overdue' ? `⚠️ Vencido hace ${-d} día${-d === 1 ? '' : 's'}` :
      status === 'today' ? '📅 Vence hoy' :
      status === 'tomorrow' ? '📅 Vence mañana' :
      `📅 En ${d} días`
    return (
      <div key={r.id} className="mb-2 rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold">🔔 {r.title}</p>
            <p className="text-sm text-stone-500">
              {formatDateEs(r.due_date)}{r.due_time ? ` · ${r.due_time} h` : ''} · {RECURRENCE_LABELS[r.recurrence]}
            </p>
            {r.amount !== null && <p className="text-sm font-semibold">{formatMoney(r.amount, currency)}</p>}
            {r.note && <p className="text-sm text-stone-500">{r.note}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${status === 'overdue' ? 'bg-red-100 text-red-700' : status === 'today' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600 dark:bg-stone-800'}`}>
            {badge}
          </span>
        </div>
        {!r.is_done && (
          <div className="mt-2 flex gap-2">
            <button onClick={() => void markDone(r)} className="flex-1 rounded-xl bg-teal-700 py-2 text-sm font-bold text-white">
              {r.recurrence === 'once' ? 'Marcar pagado ✅' : 'Pagado · siguiente ➡️'}
            </button>
            <button onClick={() => startEdit(r)} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold dark:bg-stone-800">Editar</button>
            <button onClick={() => void deleteReminder(r)} aria-label={`Eliminar ${r.title}`} className="rounded-xl bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">🗑️</button>
          </div>
        )}
        {r.is_done && (
          <button onClick={() => void reactivate(r)} className="mt-2 w-full rounded-xl bg-stone-100 py-2 text-sm font-semibold dark:bg-stone-800">Volver a activar</button>
        )}
      </div>
    )
  }

  return (
    <main className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">Recordatorios 🔔</h1>
        <p className="text-sm text-stone-500">
          Avisos de pagos futuros para los dos. También puedes escribir en el Chat “recuérdame pagar la renta el 1ro” y se crea aquí.
        </p>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-bold">📱 Alarmas en este celular</h2>
        <p className="mb-2 text-sm text-stone-500">
          Con la app abierta o instalada te aviso a la hora del recordatorio. Para avisar aunque la app esté cerrada, activa también el push (gratis, con claves VAPID).
        </p>
        <p className="mb-2 text-sm">
          Notificaciones: <strong>{perm === 'granted' ? 'activadas ✅' : perm === 'denied' ? 'bloqueadas en el navegador' : perm === 'unsupported' ? 'no soportadas aquí' : 'sin activar'}</strong>
          {pushSupported() && <> · Push: <strong>{pushOn ? 'activado ✅' : 'apagado'}</strong></>}
        </p>
        {notificationsSupported() && perm !== 'granted' && (
          <button onClick={() => void enableAlarms()} disabled={pushBusy} className="w-full rounded-xl bg-teal-700 py-2 font-bold text-white disabled:opacity-50">
            Activar alarmas en este celular
          </button>
        )}
        {perm === 'granted' && pushSupported() && !pushOn && (
          <button onClick={() => void enableAlarms()} disabled={pushBusy} className="w-full rounded-xl bg-teal-700 py-2 font-bold text-white disabled:opacity-50">
            {pushBusy ? 'Activando…' : 'Activar también cuando la app esté cerrada (push)'}
          </button>
        )}
        {perm === 'granted' && pushOn && (
          <button onClick={() => void disablePush()} disabled={pushBusy} className="w-full rounded-xl bg-stone-100 py-2 font-bold dark:bg-stone-800">
            Desactivar push en este celular
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-2 font-bold">{editingId ? 'Editar recordatorio' : 'Nuevo recordatorio'}</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej. Renta, Luz, Netflix)" className="mb-2 w-full rounded-xl border p-2" />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Monto (opcional)" className="rounded-xl border p-2" />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl border p-2 text-sm">
            <option value="">Sin categoría</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-stone-500">Fecha de vencimiento</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border p-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-500">Hora de la alarma</label>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-full rounded-xl border p-2" />
          </div>
        </div>
        <label className="mb-1 block text-xs text-stone-500">Se repite</label>
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)} className="mb-2 w-full rounded-xl border p-2 text-sm">
          {(Object.keys(RECURRENCE_LABELS) as ReminderRecurrence[]).map((k) => (
            <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="mb-2 w-full rounded-xl border p-2" />
        <div className="flex gap-2">
          <button onClick={() => void saveReminder()} disabled={busy} className="flex-1 rounded-xl bg-teal-700 py-2 font-bold text-white disabled:opacity-50">
            {editingId ? 'Guardar cambios' : 'Crear recordatorio 🔔'}
          </button>
          {editingId && <button onClick={resetForm} className="rounded-xl bg-stone-100 px-3 py-2 font-semibold dark:bg-stone-800">Cancelar</button>}
        </div>
        {message && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      </section>

      {data.recurring.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Desde tus gastos fijos</h2>
          <p className="mb-2 text-sm text-stone-500">Tus recurrentes (renta, luz, suscripciones) también pueden tener su alarma mensual:</p>
          {data.recurring.map((rec) => {
            const has = reminders.some((r) => r.recurring_id === rec.id && !r.is_done)
            return (
              <div key={rec.id} className="mb-2 flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-900">
                <span>📅 Día {rec.due_day} · {rec.title} · <strong>{formatMoney(rec.amount, currency)}</strong></span>
                {has
                  ? <span className="text-xs font-semibold text-emerald-700">🔔 Ya tiene alarma</span>
                  : <button onClick={() => void createFromRecurring(rec.id)} className="rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-bold text-white">+ Alarma mensual</button>}
              </div>
            )
          })}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Próximos y vencidos</h2>
        {urgent.length === 0 && upcoming.length === 0 && <p className="text-sm text-stone-500">Sin recordatorios pendientes. Crea el primero arriba o desde el Chat.</p>}
        {urgent.map(card)}
        {upcoming.map(card)}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Ya pagados</h2>
          {done.map((r) => (
            <div key={r.id} className="mb-2 flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-3 text-sm opacity-70 dark:border-stone-800 dark:bg-stone-900">
              <span>✅ {r.title} · {formatDateEs(r.due_date)}{r.amount !== null ? ` · ${formatMoney(r.amount, currency)}` : ''}</span>
              <button onClick={() => void reactivate(r)} className="rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-semibold dark:bg-stone-800">Reactivar</button>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
