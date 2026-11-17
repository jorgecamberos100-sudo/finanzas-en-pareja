import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../App'
import type { ProposedReminder, ReminderRecurrence, Transaction, TxType } from '../types'
import { dedupeHashSync, formatMoney, parseAmount } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  amountMinorToUnits,
  deviceTimeZone,
  parseCaptureText,
  sanitizeCaptureResult,
  type CaptureResult,
  type ProposedEntry,
} from '../lib/capture'
import {
  DEFAULT_NOTIFICATION_TIME,
  RECURRENCE_LABELS,
  detectReminderIntent,
  parseReminderText,
} from '../lib/reminders'
import PibbiReaction, { type ReactionContext } from './PibbiReaction'

interface Props {
  data: AppData
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) => Promise<void>
  onRefresh: () => void
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
}

interface Draft {
  id: string
  entry: ProposedEntry
  amount: string
  merchant: string
  categoryId: string
  accountId: string
  paidBy: string
  date: string
  note: string
  type: TxType
  splitPct: number
}

/** Tarjeta editable de un recordatorio propuesto (nunca se guarda sin confirmar). */
interface ReminderDraft {
  id: string
  proposal: ProposedReminder
  title: string
  amount: string
  dueDate: string
  dueTime: string
  recurrence: ReminderRecurrence
  categoryId: string
  note: string
}

interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Comprime una foto a JPEG máx. 1024 px antes de enviarla (ahorra cuota). */
async function compressImage(file: File): Promise<{ dataUrl: string; base64: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  return { dataUrl, base64: dataUrl.split(',')[1] ?? '' }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('No se pudo leer el audio.'))
    reader.readAsDataURL(blob)
  })
}

const REVIEW_LABELS: Record<string, string> = {
  category: 'categoría',
  payer: 'quién pagó',
  date: 'fecha',
  amount: 'monto',
  merchant: 'comercio',
}

/**
 * Chat de captura: texto, foto de ticket/libreta y nota de voz.
 * La IA solo PROPONE. Nada se guarda sin que el usuario confirme
 * cada tarjeta editable. La captura manual (botón +) sigue intacta.
 */
export default function ChatCapture({ data, onSave, onRefresh }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'bienvenida',
      role: 'assistant',
      text: 'Escríbeme un gasto, mándame la foto de un ticket o de tu libreta, o graba una nota de voz. Te propongo los movimientos y tú confirmas antes de guardar. Nada se guarda solo. Y si quieres un aviso, dime “recuérdame pagar la renta el 1ro”.',
    },
  ])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [reminderDrafts, setReminderDrafts] = useState<ReminderDraft[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // PIBBI reacciona al registrar un dato (sin bloquear nada).
  const [reaction, setReaction] = useState<ReactionContext | null>(null)
  const reactionTimer = useRef<number | null>(null)

  function showReaction(ctx: ReactionContext) {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
    setReaction(ctx)
    reactionTimer.current = window.setTimeout(() => setReaction(null), 5000)
  }
  // Al salir del chat (cambio de pestaña) se limpia el temporizador de la
  // reacción de PIBBI: antes quedaba vivo tras desmontar el componente.
  useEffect(() => () => {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
  }, [])
  const [savingId, setSavingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Zona horaria del dispositivo que captura (ej. "America/Tijuana").
  // Se envía en cada llamada a capture-parse para que "hoy"/"ayer" se
  // calculen en esta zona y no en una hardcodeada.
  const deviceTimezone = deviceTimeZone()
  const currency = data.household?.currency ?? 'MXN'
  const categories = data.categories
  const accounts = data.accounts

  function pushMessage(role: 'user' | 'assistant', text: string, imageUrl?: string) {
    setMessages((m) => [...m, { id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, imageUrl }])
  }

  function entryToDraft(entry: ProposedEntry, index: number): Draft {
    const categoryId =
      (entry.category_id && categories.some((c) => c.id === entry.category_id) ? entry.category_id : null) ??
      categories.find((c) => c.name === entry.category)?.id ??
      ''
    return {
      id: `draft-${Date.now()}-${index}`,
      entry,
      amount: amountMinorToUnits(entry.amount_minor).toFixed(2),
      merchant: entry.merchant ?? '',
      categoryId,
      accountId: accounts[0]?.id ?? '',
      paidBy: entry.payer === 'partner' && data.partner ? data.partner.id : (data.me?.id ?? ''),
      date: entry.occurred_at,
      note: entry.note ?? '',
      type: entry.type,
      // Hogar de 1 persona: no hay con quién dividir, quien paga lo absorbe todo.
      splitPct: data.partner ? entry.split_pct : 100,
    }
  }

  function proposalToReminderDraft(p: ProposedReminder, index: number): ReminderDraft {
    const categoryId =
      (p.category_id && categories.some((c) => c.id === p.category_id) ? p.category_id : null) ??
      categories.find((c) => c.name === p.category)?.id ??
      ''
    return {
      id: `reminder-draft-${Date.now()}-${index}`,
      proposal: p,
      title: p.title,
      amount: p.amount_minor !== null ? amountMinorToUnits(p.amount_minor).toFixed(2) : '',
      dueDate: p.due_date,
      dueTime: p.due_time ?? DEFAULT_NOTIFICATION_TIME,
      recurrence: p.recurrence,
      categoryId,
      note: p.note ?? '',
    }
  }

  function showReminderProposals(proposals: ProposedReminder[]) {
    if (proposals.length === 0) return
    setReminderDrafts((d) => [...d, ...proposals.map((p, i) => proposalToReminderDraft(p, i))])
    pushMessage(
      'assistant',
      proposals.length === 1
        ? `Te propongo un recordatorio para el ${proposals[0].due_date}. Revísalo abajo y confirma si está bien: no es un gasto, es solo un aviso.`
        : `Te propongo ${proposals.length} recordatorios. Revisa cada tarjeta y confirma los que estén bien.`,
    )
  }

  function showResult(result: CaptureResult) {
    if (result.reminders && result.reminders.length > 0) showReminderProposals(result.reminders)
    if (result.entries.length === 0) {
      if (!result.reminders || result.reminders.length === 0) {
        pushMessage('assistant', result.message ?? 'No pude proponer ningún movimiento con eso. ¿Me das el monto?')
      }
      return
    }
    setDrafts((d) => [...d, ...result.entries.map((e, i) => entryToDraft(e, i))])
    const total = result.entries.reduce((s, e) => s + amountMinorToUnits(e.amount_minor), 0)
    pushMessage(
      'assistant',
      result.entries.length === 1
        ? `Te propongo 1 movimiento por ${formatMoney(total, currency)}. Revísalo abajo y confirma si está bien.`
        : `Te propongo ${result.entries.length} movimientos por ${formatMoney(total, currency)} en total. Revisa cada tarjeta y confirma las que estén bien.`,
    )
  }

  async function invokeParse(body: Record<string, unknown>): Promise<CaptureResult | null> {
    try {
      const { data: res, error: err } = await supabase.functions.invoke('capture-parse', { body: { ...body, timezone: deviceTimezone } })
      if (err || !res) return null
      const clean = sanitizeCaptureResult(res, (body.source_type as CaptureResult['source_type']) ?? 'text')
      if (!clean) return null
      return { ...clean, provider: typeof res.provider === 'string' ? res.provider : clean.provider }
    } catch {
      return null
    }
  }

  async function handleText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    pushMessage('user', trimmed)
    setInput('')
    // Intención de recordatorio: "recuérdame pagar..." no es un movimiento.
    // - strong (recuérdame/avísame): solo recordatorio, con el parser local.
    // - weak (habla de pagar a futuro sin el verbo): ambiguo -> propón ambas
    //   cosas y que el usuario elija; nunca se guarda nada sin confirmar.
    const intent = detectReminderIntent(trimmed)
    if (intent === 'strong') {
      const proposal = parseReminderText(trimmed, { categories, timezone: deviceTimezone })
      if (proposal) {
        showReminderProposals([proposal])
      } else {
        pushMessage('assistant', '¿De qué pago quieres que te avise y para cuándo? Por ejemplo: “recuérdame pagar $1,500 de renta el 1 de diciembre”.')
      }
      setBusy(false)
      return
    }
    if (intent === 'weak') {
      const proposal = parseReminderText(trimmed, { categories, timezone: deviceTimezone })
      if (proposal) {
        showReminderProposals([proposal])
        pushMessage('assistant', 'No me quedó claro si ya lo pagaste o si quieres que te avise. Arriba te dejé el recordatorio; si ya fue un gasto, revisa también la propuesta de movimiento de abajo y confirma solo la que aplique.')
      }
    }
    // 1. Edge Function con Cloudflare (texto -> GLM-4.7-Flash). 2. Parser local.
    const remote = await invokeParse({
      input_type: 'text',
      text: trimmed,
      categories: categories.map((c) => c.name),
      source_type: 'text',
    })
    if (remote) {
      showResult(remote)
    } else {
      showResult(parseCaptureText(trimmed, { categories, partnerName: data.partner?.name ?? null, sourceType: 'text', timezone: deviceTimezone }))
    }
    setBusy(false)
  }

  async function handleImage(file: File) {
    if (busy) return
    setBusy(true)
    setError(null)
    let compressed: { dataUrl: string; base64: string }
    try {
      compressed = await compressImage(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen.')
      setBusy(false)
      return
    }
    pushMessage('user', 'Foto enviada 📷', compressed.dataUrl)
    const remote = await invokeParse({
      input_type: 'image',
      image_base64: compressed.base64,
      image_mime: 'image/jpeg',
      categories: categories.map((c) => c.name),
      source_type: 'ticket',
    })
    if (remote) {
      showResult(remote)
    } else {
      setError('No pude leer la foto: la función capture-parse aún no está configurada (faltan los secretos de Cloudflare en Supabase). Mientras tanto, usa el botón + para capturarla manualmente.')
      pushMessage('assistant', 'No pude leer esa foto todavía. Si es un ticket, dime el monto y el comercio en texto y lo propongo.')
    }
    setBusy(false)
  }

  async function handleAudioBlob(blob: Blob, mime: string) {
    setBusy(true)
    setError(null)
    pushMessage('user', 'Nota de voz 🎙️')
    // try/finally: si leer el audio falla, el chat se desbloquea igual.
    // Antes blobToBase64() sin try/catch dejaba busy en true para siempre.
    try {
      const base64 = await blobToBase64(blob)
      const remote = await invokeParse({
        input_type: 'audio',
        audio_base64: base64,
        audio_mime: mime,
        categories: categories.map((c) => c.name),
        source_type: 'voice',
      })
      if (remote) {
        showResult(remote)
      } else {
        setError('No pude transcribir la nota de voz: falta configurar capture-parse (Cloudflare Whisper o Groq). Prueba con el dictado por voz del teclado o escríbelo en texto.')
        pushMessage('assistant', 'No pude transcribir ese audio todavía. ¿Me lo escribes en texto?')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la nota de voz. Inténtalo de nuevo.')
      pushMessage('assistant', 'No pude leer esa nota de voz. ¿Me lo escribes en texto?')
    } finally {
      setBusy(false)
    }
  }

  function startDictation() {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      void startRecording()
      return
    }
    const rec = new Ctor()
    recognitionRef.current = rec
    rec.lang = 'es-MX'
    rec.interimResults = false
    rec.continuous = false
    setListening(true)
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
        pushMessage('assistant', `Te entendí: “${transcript}”. Revisa el texto y envíalo si está bien.`)
      }
    }
    rec.onerror = (e) => {
      setListening(false)
      if (e.error === 'not-allowed') setError('El navegador no permitió usar el micrófono. Revisa el permiso de micrófono.')
    }
    rec.onend = () => setListening(false)
    try {
      rec.start()
    } catch {
      setListening(false)
      void startRecording()
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      mediaRecorderRef.current = rec
      audioChunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 0) void handleAudioBlob(blob, blob.type || 'audio/webm')
      }
      rec.start()
      setRecording(true)
    } catch {
      setError('No pude acceder al micrófono. Revisa el permiso de micrófono del navegador.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  async function confirmDraft(draft: Draft) {
    if (!data.me || !data.household) return
    const amount = parseAmount(draft.amount)
    if (!amount) {
      setError('Escribe un monto mayor a $0 en la tarjeta antes de confirmar.')
      return
    }
    if (draft.type !== 'transferencia' && !draft.categoryId) {
      setError('Elige una categoría en la tarjeta antes de confirmar.')
      return
    }
    if (!draft.accountId) {
      setError('Elige una cuenta en la tarjeta antes de confirmar.')
      return
    }
    setSavingId(draft.id)
    setError(null)
    try {
      await onSave({
        account_id: draft.accountId,
        category_id: draft.type === 'transferencia' ? null : draft.categoryId,
        created_by: data.me.id,
        paid_by: draft.type === 'ingreso' ? data.me.id : draft.paidBy,
        type: draft.type,
        amount,
        date: draft.date,
        merchant: draft.merchant.trim() || null,
        note: draft.note.trim() || null,
        split_pct: draft.type === 'transferencia' ? 100 : draft.splitPct,
        visibility: 'compartida',
        review_status: 'aprobado',
        dedupe_hash: dedupeHashSync({ date: draft.date, amount, merchant: draft.merchant.trim() || '', account_id: draft.accountId }),
      })
      setDrafts((ds) => ds.filter((d) => d.id !== draft.id))
      pushMessage('assistant', `Guardado: ${formatMoney(amount, currency)}${draft.merchant ? ` en ${draft.merchant}` : ''} (${draft.date}). ${data.partner ? 'Ya se ve en ambos teléfonos.' : 'Ya se ve en tu app.'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el movimiento.')
    } finally {
      setSavingId(null)
    }
  }

  function updateReminderDraft(id: string, patch: Partial<ReminderDraft>) {
    setReminderDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  async function confirmReminderDraft(draft: ReminderDraft) {
    if (!data.me || !data.household) return
    if (!draft.title.trim()) {
      setError('Escribe el título del recordatorio en la tarjeta antes de confirmar.')
      return
    }
    if (!draft.dueDate) {
      setError('Elige la fecha del recordatorio en la tarjeta antes de confirmar.')
      return
    }
    const amount = draft.amount.trim() ? parseAmount(draft.amount) : null
    if (draft.amount.trim() && !amount) {
      setError('El monto del recordatorio debe ser mayor a $0.')
      return
    }
    setSavingId(draft.id)
    setError(null)
    try {
      const { error } = await supabase.from('reminders').insert({
        household_id: data.household.id,
        created_by: data.me.id,
        title: draft.title.trim().slice(0, 200),
        amount,
        due_date: draft.dueDate,
        due_time: draft.dueTime || null,
        recurrence: draft.recurrence,
        category_id: draft.categoryId || null,
        note: draft.note.trim() || null,
        timezone: deviceTimezone,
      })
      if (error) throw new Error(error.message)
      setReminderDrafts((ds) => ds.filter((d) => d.id !== draft.id))
      showReaction('apuntando')
      pushMessage(
        'assistant',
        `Recordatorio creado 🔔 ${draft.title.trim()} para el ${draft.dueDate}${amount ? ` por ${formatMoney(amount, currency)}` : ''}. Te avisaré ese día; también lo ves en la pestaña Avisos.`,
      )
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el recordatorio.')
    } finally {
      setSavingId(null)
    }
  }

  const speechSupported = getSpeechRecognition() !== null || Boolean(navigator.mediaDevices?.getUserMedia)

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="space-y-2" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-rosafuerte text-noche' : 'bg-elevado text-crema  '
              }`}
            >
              {m.imageUrl && <img src={m.imageUrl} alt="Foto enviada para capturar" className="mb-2 max-h-48 rounded-xl object-cover" />}
              {m.text}
            </div>
          </div>
        ))}
        {busy && <PibbiReaction contexto="pensando" mensaje="PIBBI está revisando tu mensaje…" />}
      </div>

      {reaction && <PibbiReaction contexto={reaction} />}

      {reminderDrafts.map((d) => (
        <article key={d.id} className="rounded-2xl border border-amber-500/40 bg-tarjeta p-3 shadow-sm ">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">🔔 Recordatorio propuesto</h3>
            <span className="rounded-full bg-[#F5C54226] px-2 py-0.5 text-xs font-semibold text-dorado">Sin guardar aún · no es un gasto</span>
          </div>
          {d.proposal.needs_review.length > 0 && (
            <p className="mb-2 text-xs text-dorado ">
              Revisar: {d.proposal.needs_review.map((r) => (r === 'date' ? 'fecha' : r === 'amount' ? 'monto' : r === 'category' ? 'categoría' : r)).join(', ')}
            </p>
          )}
          <label className="mb-1 block text-xs text-humo">Título</label>
          <input
            value={d.title}
            onChange={(e) => updateReminderDraft(d.id, { title: e.target.value })}
            className="mb-2 w-full rounded-xl border border-borde p-2 text-sm font-bold "
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Monto ({currency}, opcional)</label>
              <input
                inputMode="decimal"
                value={d.amount}
                onChange={(e) => updateReminderDraft(d.id, { amount: e.target.value })}
                placeholder="Sin monto"
                className="w-full rounded-xl border border-borde p-2 text-sm "
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Categoría</label>
              <select
                value={d.categoryId}
                onChange={(e) => updateReminderDraft(d.id, { categoryId: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Fecha</label>
              <input
                type="date"
                value={d.dueDate}
                onChange={(e) => updateReminderDraft(d.id, { dueDate: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Hora</label>
              <input
                type="time"
                value={d.dueTime}
                onChange={(e) => updateReminderDraft(d.id, { dueTime: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Se repite</label>
              <select
                value={d.recurrence}
                onChange={(e) => updateReminderDraft(d.id, { recurrence: e.target.value as ReminderRecurrence })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              >
                {(Object.keys(RECURRENCE_LABELS) as ReminderRecurrence[]).map((k) => (
                  <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          {d.proposal.original_text && <p className="mb-2 text-xs italic text-humo">“{d.proposal.original_text}”</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmReminderDraft(d)}
              disabled={savingId === d.id}
              className="flex-1 rounded-xl bg-dorado py-2 text-sm font-extrabold tracking-wide text-noche disabled:opacity-50"
            >
              {savingId === d.id ? 'Guardando…' : 'Crear recordatorio 🔔'}
            </button>
            <button
              type="button"
              onClick={() => setReminderDrafts((ds) => ds.filter((x) => x.id !== d.id))}
              className="rounded-xl bg-elevado px-3 py-2 text-sm font-semibold text-humo "
            >
              Descartar
            </button>
          </div>
        </article>
      ))}

      {drafts.map((d) => (
        <article key={d.id} className="rounded-2xl border border-rosafuerte/30 bg-tarjeta p-3 shadow-sm ">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Propuesta para revisar</h3>
            <span className="rounded-full bg-[#F4728F26] px-2 py-0.5 text-xs font-semibold text-rosaclaro">Sin guardar aún</span>
          </div>
          {d.entry.needs_review.length > 0 && (
            <p className="mb-2 text-xs text-dorado ">
              Revisar: {d.entry.needs_review.map((r) => REVIEW_LABELS[r] ?? r).join(', ')}
            </p>
          )}
          <div className="mb-2 grid grid-cols-3 gap-2">
            {(['gasto', 'ingreso', 'transferencia'] as TxType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => updateDraft(d.id, { type: t, splitPct: t === 'transferencia' ? 100 : d.splitPct })}
                className={`rounded-xl py-1.5 text-xs font-semibold capitalize ${d.type === t ? 'bg-rosafuerte text-noche' : 'bg-elevado text-humo '}`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="mb-1 block text-xs text-humo">Monto ({currency})</label>
          <input
            inputMode="decimal"
            value={d.amount}
            onChange={(e) => updateDraft(d.id, { amount: e.target.value })}
            className="mb-2 w-full rounded-xl border border-borde p-2 text-lg font-bold "
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Categoría</label>
              <select
                value={d.categoryId}
                onChange={(e) => updateDraft(d.id, { categoryId: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              >
                <option value="">Elige…</option>
                {categories
                  .filter((c) => (d.type === 'ingreso' ? c.group === 'Ingresos' : c.group !== 'Ingresos'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Cuenta</label>
              <select
                value={d.accountId}
                onChange={(e) => updateDraft(d.id, { accountId: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Quién pagó</label>
              <select
                value={d.paidBy}
                onChange={(e) => updateDraft(d.id, { paidBy: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              >
                {[data.me, data.partner].filter(Boolean).map((u) => (
                  <option key={u!.id} value={u!.id}>
                    {u!.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Fecha</label>
              <input
                type="date"
                value={d.date}
                onChange={(e) => updateDraft(d.id, { date: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm "
              />
            </div>
          </div>
          <input
            value={d.merchant}
            onChange={(e) => updateDraft(d.id, { merchant: e.target.value })}
            placeholder="Comercio (ej. Walmart)"
            className="mb-2 w-full rounded-xl border border-borde p-2 text-sm "
          />
          <input
            value={d.note}
            onChange={(e) => updateDraft(d.id, { note: e.target.value })}
            placeholder="Nota (opcional)"
            className="mb-2 w-full rounded-xl border border-borde p-2 text-sm "
          />
          {d.type === 'gasto' && data.partner && (
            <p className="mb-2 text-xs text-humo">
              Split: {d.splitPct}% lo asume quien pagó · la otra persona le debe {formatMoney((parseAmount(d.amount) * (100 - d.splitPct)) / 100, currency)}
            </p>
          )}
          {d.entry.original_text && <p className="mb-2 text-xs italic text-humo">“{d.entry.original_text}”</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmDraft(d)}
              disabled={savingId === d.id}
              className="flex-1 rounded-xl bg-rosafuerte py-2 text-sm font-extrabold tracking-wide text-noche disabled:opacity-50"
            >
              {savingId === d.id ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button
              type="button"
              onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
              className="rounded-xl bg-elevado px-3 py-2 text-sm font-semibold text-humo "
            >
              Descartar
            </button>
          </div>
        </article>
      ))}

      {error && (
        <p role="alert" className="rounded-xl bg-[#FF8A8014] p-3 text-sm text-rojosuave  ">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleText(input)
        }}
        className="flex items-end gap-2"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Subir foto de ticket o libreta"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImage(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          aria-label="Subir foto de ticket o libreta"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-full bg-elevado px-3 py-2 text-lg "
        >
          📷
        </button>
        <button
          type="button"
          aria-label={recording ? 'Detener grabación de voz' : listening ? 'Escuchando…' : 'Grabar nota de voz'}
          onClick={() => {
            if (recording) stopRecording()
            else if (listening) recognitionRef.current?.stop()
            else startDictation()
          }}
          disabled={busy || !speechSupported}
          className={`rounded-full px-3 py-2 text-lg ${recording || listening ? 'bg-[#FF8A8026]' : 'bg-elevado '}`}
        >
          🎙️
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej. Gasté $350 en Walmart…"
          aria-label="Escribe un gasto, ingreso o transferencia"
          className="min-w-0 flex-1 rounded-xl border border-borde p-3 text-sm "
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-rosafuerte px-4 py-3 text-sm font-extrabold tracking-wide text-noche disabled:opacity-50">
          Enviar
        </button>
      </form>
      <p className="text-center text-xs text-humo">
        La captura manual con el botón + sigue disponible. El chat nunca guarda sin tu confirmación.
      </p>
    </div>
  )
}
