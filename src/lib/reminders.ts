import { useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Category, ProposedReminder, Reminder, ReminderRecurrence } from '../types'
import {
  addDaysToIso,
  extractAmounts,
  findCategory,
  parseMoneyToken,
  todayIsoForTimezone,
} from './capture'
import { deviceTimeZone as deviceTzFormat } from './format'

export type { ReminderRecurrence }

export const RECURRENCE_LABELS: Record<ReminderRecurrence, string> = {
  once: 'Una vez',
  daily: 'Todos los días',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
}

/** Hora por defecto del aviso cuando no se dice una: 9 de la mañana. */
export const DEFAULT_NOTIFICATION_TIME = '09:00'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const MONTHS_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

const WEEKDAYS_ES: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
}

/** Día de la semana (0=domingo) de una fecha YYYY-MM-DD en la zona dada. */
export function weekdayOfIso(iso: string, timezone?: string | null): number {
  const tz = timezone ?? deviceTzFormat()
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(`${iso}T12:00:00Z`))
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0
}

/** Último día del mes (YYYY-MM) — para que "cada mes el 31" no se pierda en febrero. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Avanza una fecha según la recurrencia (una vez -> null, ya no se repite). */
export function nextDueDate(dueDate: string, recurrence: ReminderRecurrence): string | null {
  const [y, m, d] = dueDate.split('-').map(Number)
  if (recurrence === 'daily') return addDaysToIso(dueDate, 1)
  if (recurrence === 'weekly') return addDaysToIso(dueDate, 7)
  if (recurrence === 'yearly') {
    const ny = y + 1
    return `${ny}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(ny, m))).padStart(2, '0')}`
  }
  if (recurrence === 'monthly') {
    const nm = m === 12 ? 1 : m + 1
    const ny = m === 12 ? y + 1 : y
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(ny, nm))).padStart(2, '0')}`
  }
  return null
}

/** Días que faltan desde hoy (zona del dispositivo) hasta la fecha. Negativo = vencido. */
export function daysUntil(dueDate: string, timezone?: string | null): number {
  const today = todayIsoForTimezone(timezone)
  const a = Date.parse(`${today}T12:00:00Z`)
  const b = Date.parse(`${dueDate}T12:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function reminderStatus(r: Reminder, timezone?: string | null): 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'done' {
  if (r.is_done) return 'done'
  const d = daysUntil(r.due_date, timezone)
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return 'upcoming'
}

function detectRecurrence(text: string): ReminderRecurrence {
  const t = normalize(text)
  if (/\b(cada mes|mensual|todos los meses|al mes)\b/.test(t)) return 'monthly'
  if (/\b(cada semana|semanal|todas las semanas)\b/.test(t)) return 'weekly'
  if (/\b(cada dia|todos los dias|diario|a diario)\b/.test(t)) return 'daily'
  if (/\b(cada ano|anual|todos los anos)\b/.test(t)) return 'yearly'
  return 'once'
}

/** Aplica am/pm (o "de la mañana/tarde/noche") a una hora 1-12. */
function applyAmPm(h: number, suffix: string): number {
  const s = suffix.replace(/\./g, '')
  if (s === 'pm' || s === 'de la tarde' || s === 'de la noche') return h < 12 ? h + 12 : h
  if (s === 'am' || s === 'de la manana') return h === 12 ? 0 : h
  return h
}

/** "a las 9", "a las 9:30", "9 de la mañana", "21:00" -> "HH:MM" o null.
 *  OJO: un monto ($1,500) no es una hora: solo se acepta con "a las",
 *  con sufijo (am/pm, de la mañana/tarde/noche) o con formato HH:MM. */
export function parseTimeEs(text: string): string | null {
  const t = normalize(text)
  const hhmm = t.match(/\b(\d{1,2}):(\d{2})\b/)
  if (hhmm) {
    let h = Number(hhmm[1])
    const min = Number(hhmm[2])
    if (h <= 23 && min <= 59) {
      // "5:00 pm" / "5:00 de la tarde": el sufijo SÍ importa. Antes la rama
      // HH:MM devolvía "05:00" sin mirar lo que seguía (bug de la auditoría).
      const after = t.slice((hhmm.index ?? 0) + hhmm[0].length)
      const suf = after.match(/^\s*(de la manana|de la tarde|de la noche|p\.?m\.?|a\.?m\.?)\b/)
      if (suf) h = applyAmPm(h, suf[1])
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    }
  }
  const m =
    t.match(/\b(?:a las?|a la)\s+(\d{1,2})(?::(\d{2}))?\s*(de la manana|de la tarde|de la noche|am|pm)?\b/) ??
    t.match(/\b(\d{1,2})(?::(\d{2}))?\s+(de la manana|de la tarde|de la noche|am|pm)\b/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  h = applyAmPm(h, m[3] ?? '')
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * Fecha en español -> YYYY-MM-DD en la zona del dispositivo.
 * Soporta: hoy, mañana, pasado mañana, "el viernes", "el 1 de diciembre",
 * "1ro de diciembre", "el 15", "en 3 días", "en una semana", "1/12/2026".
 */
export function parseReminderDateEs(text: string, timezone?: string | null): { date: string; found: boolean } {
  const t = normalize(text)
  const today = todayIsoForTimezone(timezone)
  if (/\bpasado manana\b/.test(t)) return { date: addDaysToIso(today, 2), found: true }
  // "mañana" como día relativo, pero no "de la mañana" (eso es la hora).
  if (/(?<!de la )(?<!en la )manana\b/.test(t)) return { date: addDaysToIso(today, 1), found: true }
  if (/\bhoy\b/.test(t)) return { date: today, found: true }
  if (/\ben una semana\b/.test(t)) return { date: addDaysToIso(today, 7), found: true }
  if (/\ben un mes\b/.test(t)) {
    const n = nextDueDate(today, 'monthly')
    return { date: n ?? today, found: true }
  }
  const inDays = t.match(/\ben (\d{1,2}) d[ií]as?\b/)
  if (inDays) return { date: addDaysToIso(today, Number(inDays[1])), found: true }

  // "el 1 de diciembre" / "1ro de diciembre" / "el primero de diciembre"
  const monthName = t.match(/\b(?:el\s+)?(?:(\d{1,2})(?:ro|o|er)?|primero)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s+de\s+(\d{4}))?/)
  if (monthName) {
    const day = monthName[1] ? Number(monthName[1]) : 1
    const month = MONTHS_ES[monthName[2]]
    let year = monthName[3] ? Number(monthName[3]) : Number(today.slice(0, 4))
    let iso = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDayOfMonth(year, month))).padStart(2, '0')}`
    // Sin año y fecha ya pasada este año -> el año que viene.
    if (!monthName[3] && iso < today) iso = `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDayOfMonth(year + 1, month))).padStart(2, '0')}`
    return { date: iso, found: true }
  }

  // "el 15" / "el día 15": día del mes en curso, o del siguiente si ya pasó.
  // Antes de buscarlo se quitan la hora ("a las 9 de la mañana" no es un día)
  // y el monto ("$800" no es un día), para que no confundan el número.
  const tDate = t
    .replace(/\ba las?\s+\d{1,2}(?::\d{2})?\s*(de la (manana|tarde|noche)|am|pm)?/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\$\s?[\d,]+(?:\.\d+)?/g, ' ')
  const dayOnly = tDate.match(/\b(?:el\s+)?(?:dia\s+)?(\d{1,2})(?:ro|o)?\b/)
  if (dayOnly) {
    const day = Number(dayOnly[1])
    if (day >= 1 && day <= 31) {
      const [y, m] = today.split('-').map(Number)
      let iso = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, lastDayOfMonth(y, m))).padStart(2, '0')}`
      if (iso < today) {
        const nm = m === 12 ? 1 : m + 1
        const ny = m === 12 ? y + 1 : y
        iso = `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(day, lastDayOfMonth(ny, nm))).padStart(2, '0')}`
      }
      return { date: iso, found: true }
    }
  }

  // "el viernes" / "este lunes": próximo día con ese nombre (hoy si es hoy).
  const wd = t.match(/\b(?:el|este|la|el proximo|la proxima)\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/)
  if (wd) {
    const target = WEEKDAYS_ES[wd[1]]
    const current = weekdayOfIso(today, timezone)
    let delta = (target - current + 7) % 7
    if (/proximo|proxima/.test(t) && delta === 0) delta = 7
    return { date: addDaysToIso(today, delta), found: true }
  }

  // Fecha numérica: 1/12/2026 o 2026-12-01.
  const isoM = text.match(/(\d{4})-(\d{2})-(\d{2})/) ?? text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (isoM) {
    const iso = isoM[0].includes('/')
      ? `${isoM[3]}-${isoM[2].padStart(2, '0')}-${isoM[1].padStart(2, '0')}`
      : isoM[0]
    if (!Number.isNaN(Date.parse(`${iso}T12:00:00`))) return { date: iso, found: true }
  }
  return { date: today, found: false }
}

export type ReminderIntent = 'strong' | 'weak' | 'none'

/**
 * Intención de recordatorio en un mensaje de chat.
 * - strong: "recuérdame / avísame / ponme una alarma / recordatorio" (claro).
 *   Si el usuario dice "alarma", se interpreta como un recordatorio
 *   (notificación): no existe alarma sonora en la app.
 * - weak: habla de pagar algo a futuro ("pagar la renta el 1ro", "la luz vence
 *   el viernes") sin el verbo de recordar: es ambiguo, puede ser gasto o aviso.
 * - none: ni rastro de recordatorio.
 */
export function detectReminderIntent(text: string): ReminderIntent {
  const t = normalize(text)
  if (/\b(recuerdame|recuerda|avisa|avisame|alerta|recordatorio|alarma|ponme un aviso|acuerdate)\b/.test(t)) return 'strong'
  if (/\b(pagar|pago|vence|vencimiento|hay que pagar|se cobra|me cobran|toca pagar)\b/.test(t)) return 'weak'
  return 'none'
}

/** Limpia el título del recordatorio: quita el verbo, el monto y la fecha.
 * Orden: primero las fechas y la hora (para que el monto no se coma el día
 * del mes, ej. el "1" de "el 1 de diciembre"), el monto al final. */
function cleanReminderTitle(text: string, amount: number | null, dateFound: boolean): string {
  let s = text.trim()
  s = s.replace(/^(recuerdame|recuérdame|avísame|avisame|ponme una alarma|alerta|recordatorio)\s*(que|de)?\s*/i, '')
  s = s.replace(/\b(recuerdame|recuérdame|avísame|avisame)\b/gi, '')
  s = s
    .replace(/\b(el\s+)?\d{1,2}(ro|o|er)?\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(\s+de\s+\d{4})?\b/gi, '')
    .replace(/\b(el\s+)?(domingo|lunes|martes|miércoles|jueves|viernes|sábado)\b/gi, '')
    .replace(/\ba las?\s+\d{1,2}(:\d{2})?\s*(de la (manana|mañana|tarde|noche)|am|pm)?\b/gi, '')
    .replace(/(?<!de la )(?<!en la )\b(manana|mañana|pasado manana|hoy|en \d+ d[ií]as?|en una semana|en un mes)\b/gi, '')
    .replace(/\b(cada mes|mensual|cada semana|semanal|cada dia|todos los dias|diario|cada ano|anual)\b/gi, '')
  if (amount !== null) {
    s = s.replace(/\$?\s*\d[\d.,]*\s*(pesos|mxn|varos)?/gi, '')
  }
  s = s.replace(/\s+/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '').trim()
  // "pagar $1,500 de renta" -> "pagar la renta" queda raro; deja "renta".
  s = s.replace(/^pagar\s+(de\s+|la\s+|el\s+)?/i, '')
  s = s.replace(/^de\s+/i, '')
  if (!s) return dateFound ? 'Pago' : 'Recordatorio'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface ReminderParseOptions {
  categories: Category[]
  timezone?: string | null
}

/** Texto del chat -> propuesta de recordatorio (o null si no hay intención clara). */
export function parseReminderText(text: string, opts: ReminderParseOptions): ProposedReminder | null {
  const intent = detectReminderIntent(text)
  if (intent === 'none') return null
  const amounts = extractAmounts(text)
  const amount = amounts.length > 0 ? amounts[0] : null
  const { date, found: dateFound } = parseReminderDateEs(text, opts.timezone)
  const time = parseTimeEs(text)
  const recurrence = detectRecurrence(text)
  const category = findCategory(text, opts.categories)
  const needsReview: string[] = []
  if (!dateFound) needsReview.push('date')
  if (amount === null) needsReview.push('amount')
  if (!category) needsReview.push('category')
  return {
    title: cleanReminderTitle(text, amount, dateFound),
    amount_minor: amount !== null ? Math.round(amount * 100) : null,
    due_date: date,
    due_time: time,
    recurrence,
    category: category?.name ?? null,
    category_id: category?.id ?? null,
    note: null,
    original_text: text.trim().slice(0, 500),
    needs_review: needsReview,
  }
}

// ================= Notificaciones locales (navegador / PWA) =================

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

function notifiedKey(reminderId: string, dueDate: string): string {
  return `fp-reminder-fired-${reminderId}-${dueDate}`
}

/** ¿Este recordatorio ya avisó hoy (en este dispositivo)? Evita repetir el aviso. */
export function alreadyNotifiedToday(reminder: Reminder): boolean {
  try {
    return localStorage.getItem(notifiedKey(reminder.id, reminder.due_date)) === '1'
  } catch {
    return false
  }
}

function markNotified(reminder: Reminder): void {
  try {
    localStorage.setItem(notifiedKey(reminder.id, reminder.due_date), '1')
  } catch {
    /* almacenamiento no disponible: el aviso se mostrará de nuevo al revisar */
  }
}

/** Muestra la notificación de un recordatorio (vía service worker si hay, si no directa). */
export async function showReminderNotification(reminder: Reminder, currency = 'MXN'): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  const amount = reminder.amount !== null && reminder.amount !== undefined
    ? ` — ${new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(reminder.amount)}`
    : ''
  const body = `Hoy vence: ${reminder.title}${amount}. Toca para ver tus recordatorios.`
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(`🔔 Recordatorio: ${reminder.title}`, {
        body,
        tag: `reminder-${reminder.id}-${reminder.due_date}`,
        icon: '/icons/icon-192.png',
        data: { url: '/recordatorios' },
      })
      return true
    }
  } catch {
    /* cae al Notification directo */
  }
  try {
    new Notification(`🔔 Recordatorio: ${reminder.title}`, { body, tag: `reminder-${reminder.id}-${reminder.due_date}` })
    return true
  } catch {
    return false
  }
}

/** Recordatorios que ya deben sonar: vencidos o de hoy a la hora indicada (o 09:00 por defecto). */
export function dueRemindersToNotify(reminders: Reminder[], timezone?: string | null, now = new Date()): Reminder[] {
  const tz = timezone ?? deviceTzFormat()
  const today = todayIsoForTimezone(tz)
  const nowHm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  return reminders.filter((r) => {
    if (r.is_done) return false
    if (r.due_date > today) return false
    if (alreadyNotifiedToday(r)) return false
    const at = r.due_time ?? DEFAULT_NOTIFICATION_TIME
    if (r.due_date === today) return nowHm >= at
    return true // vencido: avisar en cuanto se abra la app
  })
}

/** Revisa cada 30 s (y al volver a la app) si hay recordatorios que avisar. Solo notificaciones, sin alarma sonora. */
export function useReminderNotifications(reminders: Reminder[], timezone?: string | null): void {
  useEffect(() => {
    if (!notificationsSupported() || notificationPermission() !== 'granted') return
    let stopped = false
    async function check() {
      if (stopped) return
      for (const r of dueRemindersToNotify(reminders, timezone)) {
        if (await showReminderNotification(r)) markNotified(r)
      }
    }
    void check()
    const id = window.setInterval(() => void check(), 30_000)
    const onVisibilityChange = () => {
      if (!document.hidden) void check()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders.map((r) => `${r.id}:${r.due_date}:${r.due_time}:${r.is_done}`).join('|')])
}

// ================= Push real (app cerrada, Web Push + VAPID) =================

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Suscribe este celular al push y guarda la suscripción en Supabase. */
export async function subscribePush(
  client: SupabaseClient,
  householdId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Este navegador no soporta notificaciones push.' }
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidPublicKey) return { ok: false, error: 'Falta configurar VITE_VAPID_PUBLIC_KEY en el despliegue (ver README).' }
  const perm = await requestNotificationPermission()
  if (perm !== 'granted') return { ok: false, error: 'Activa el permiso de notificaciones para este sitio.' }
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }
    const json = sub.toJSON()
    const { error } = await client.from('push_subscriptions').upsert(
      {
        user_id: userId,
        household_id: householdId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'user_id,endpoint' },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo suscribir al push.' }
  }
}

/** Quita la suscripción push de este celular. */
export async function unsubscribePush(client: SupabaseClient, userId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await client.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch {
    /* si falla, la suscripción queda; se puede borrar desde la BD */
  }
}

/** ¿Este celular ya está suscrito al push? */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) !== null
  } catch {
    return false
  }
}

/** Para tests / depuración: formatea un monto tecleado como en el resto de la app. */
export { parseMoneyToken }
