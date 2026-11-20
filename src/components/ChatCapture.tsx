import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../App'
import type { ProposedReminder, ReminderRecurrence, Transaction, TxType } from '../types'
import { dedupeHash, formatMoney, parseAmount } from '../lib/format'
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
import { defPlan, puedeUsarIA } from '../lib/planes'
import { registrarCapturaIA } from '../lib/planes-db'
import Paywall from './Paywall'
import PibbiReaction, { type ReactionContext } from './PibbiReaction'
import Mascota from './Mascota'
import PibbiPanel from './PibbiPanel'
import { Icono } from './ui'
import { usePibbi } from '../lib/pibbi'

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
  abort?: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
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
  const { name } = usePibbi()
  const [panelOpen, setPanelOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
  const [savingId, setSavingId] = useState<string | null>(null)
  // Motivo del paywall (null = cerrado).
  const [paywall, setPaywall] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const firstRenderRef = useRef(true)

  function showReaction(ctx: ReactionContext) {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
    setReaction(ctx)
    reactionTimer.current = window.setTimeout(() => setReaction(null), 4500)
  }

  // Al salir del chat (cambio de pestaña) se limpia el temporizador y se
  // detienen grabaciones o dictados activos.
  useEffect(() => () => {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop())
        mediaRecorderRef.current.stop()
      } catch {
        // stream ya cerrado
      }
    }
    try {
      recognitionRef.current?.abort?.()
    } catch {
      // reconocimiento ya cerrado
    }
  }, [])

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, drafts.length, reminderDrafts.length, busy])

  // Zona horaria del dispositivo que captura. Se envía en cada llamada a
  // capture-parse para calcular "hoy" y "ayer" en esta zona.
  const deviceTimezone = deviceTimeZone()
  const currency = data.household?.currency ?? 'MXN'
  const categories = data.categories
  const accounts = data.accounts

  function mensajeLimiteIA(): string {
    const def = defPlan(data.plan)
    return `Ya usaste tus ${def.capturasIaMes} capturas con IA de este mes (plan ${def.nombre}). Con Plus las capturas con IA son ilimitadas (uso justo: 300 al mes). La captura manual con el botón + sigue disponible.`
  }

  function pushMessage(role: 'user' | 'assistant', text: string, imageUrl?: string) {
    setMessages((current) => [
      ...current,
      { id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, imageUrl },
    ])
  }

  function entryToDraft(entry: ProposedEntry, index: number): Draft {
    const categoryId =
      (entry.category_id && categories.some((category) => category.id === entry.category_id) ? entry.category_id : null) ??
      categories.find((category) => category.name === entry.category)?.id ??
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

  function proposalToReminderDraft(proposal: ProposedReminder, index: number): ReminderDraft {
    const categoryId =
      (proposal.category_id && categories.some((category) => category.id === proposal.category_id)
        ? proposal.category_id
        : null) ??
      categories.find((category) => category.name === proposal.category)?.id ??
      ''

    return {
      id: `reminder-draft-${Date.now()}-${index}`,
      proposal,
      title: proposal.title,
      amount: proposal.amount_minor !== null ? amountMinorToUnits(proposal.amount_minor).toFixed(2) : '',
      dueDate: proposal.due_date,
      dueTime: proposal.due_time ?? DEFAULT_NOTIFICATION_TIME,
      recurrence: proposal.recurrence,
      categoryId,
      note: proposal.note ?? '',
    }
  }

  function showReminderProposals(proposals: ProposedReminder[]) {
    if (proposals.length === 0) return
    setReminderDrafts((current) => [
      ...current,
      ...proposals.map((proposal, index) => proposalToReminderDraft(proposal, index)),
    ])
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

    setDrafts((current) => [...current, ...result.entries.map((entry, index) => entryToDraft(entry, index))])
    const total = result.entries.reduce((sum, entry) => sum + amountMinorToUnits(entry.amount_minor), 0)
    pushMessage(
      'assistant',
      result.entries.length === 1
        ? `Te propongo 1 movimiento por ${formatMoney(total, currency)}. Revísalo abajo y confirma si está bien.`
        : `Te propongo ${result.entries.length} movimientos por ${formatMoney(total, currency)} en total. Revisa cada tarjeta y confirma las que estén bien.`,
    )
  }

  async function invokeParse(body: Record<string, unknown>): Promise<CaptureResult | null> {
    try {
      const { data: response, error: invokeError } = await supabase.functions.invoke('capture-parse', {
        body: { ...body, timezone: deviceTimezone },
      })
      if (invokeError || !response) return null
      const clean = sanitizeCaptureResult(
        response,
        (body.source_type as CaptureResult['source_type']) ?? 'text',
        deviceTimezone,
      )
      if (!clean) return null
      return {
        ...clean,
        provider: typeof response.provider === 'string' ? response.provider : clean.provider,
      }
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

    // La intención fuerte solo propone un recordatorio. La débil es ambigua:
    // propone recordatorio y movimiento para que el usuario elija.
    const intent = detectReminderIntent(trimmed)
    const iaBloqueada = !puedeUsarIA(data.plan)

    if (intent === 'strong') {
      const proposal = parseReminderText(trimmed, { categories, timezone: deviceTimezone })
      if (proposal) {
        showReminderProposals([proposal])
      } else {
        pushMessage(
          'assistant',
          '¿De qué pago quieres que te avise y para cuándo? Por ejemplo: “recuérdame pagar $1,500 de renta el 1 de diciembre”.',
        )
      }
      setBusy(false)
      return
    }

    if (intent === 'weak') {
      const proposal = parseReminderText(trimmed, { categories, timezone: deviceTimezone })
      if (proposal) {
        showReminderProposals([proposal])
        pushMessage(
          'assistant',
          iaBloqueada
            ? 'No me quedó claro si ya lo pagaste o si quieres que te avise. Arriba te dejé el recordatorio; el movimiento no lo puedo proponer porque llegaste al límite de capturas con IA de este mes.'
            : 'No me quedó claro si ya lo pagaste o si quieres que te avise. Arriba te dejé el recordatorio; si ya fue un gasto, revisa también la propuesta de movimiento de abajo y confirma solo la que aplique.',
        )
      }
    }

    // El parser local no se usa para saltarse el límite de IA. Los
    // recordatorios y la captura manual siguen disponibles.
    if (iaBloqueada) {
      pushMessage('assistant', mensajeLimiteIA())
      setPaywall(mensajeLimiteIA())
      setBusy(false)
      return
    }

    const remote = await invokeParse({
      input_type: 'text',
      text: trimmed,
      categories: categories.map((category) => category.name),
      source_type: 'text',
    })

    if (remote) {
      showResult(remote)
    } else {
      showResult(
        parseCaptureText(trimmed, {
          categories,
          partnerName: data.partner?.name ?? null,
          sourceType: 'text',
          timezone: deviceTimezone,
        }),
      )
    }
    setBusy(false)
  }

  async function handleImage(file: File) {
    if (busy) return
    if (!puedeUsarIA(data.plan)) {
      pushMessage('assistant', mensajeLimiteIA())
      setPaywall(mensajeLimiteIA())
      return
    }

    setBusy(true)
    setError(null)
    let compressed: { dataUrl: string; base64: string }

    try {
      compressed = await compressImage(file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo procesar la imagen.')
      setBusy(false)
      return
    }

    pushMessage('user', 'Foto enviada', compressed.dataUrl)
    const remote = await invokeParse({
      input_type: 'image',
      image_base64: compressed.base64,
      image_mime: 'image/jpeg',
      categories: categories.map((category) => category.name),
      source_type: 'ticket',
    })

    if (remote) {
      showResult(remote)
    } else {
      setError(
        'No pude leer la foto: la función capture-parse aún no está configurada (faltan los secretos de Cloudflare en Supabase). Mientras tanto, usa el botón + para capturarla manualmente.',
      )
      pushMessage('assistant', 'No pude leer esa foto todavía. Si es un ticket, dime el monto y el comercio en texto y lo propongo.')
    }
    setBusy(false)
  }

  async function handleAudioBlob(blob: Blob, mime: string) {
    if (!puedeUsarIA(data.plan)) {
      pushMessage('user', 'Nota de voz')
      pushMessage('assistant', mensajeLimiteIA())
      setPaywall(mensajeLimiteIA())
      return
    }

    setBusy(true)
    setError(null)
    pushMessage('user', 'Nota de voz')

    try {
      const base64 = await blobToBase64(blob)
      const remote = await invokeParse({
        input_type: 'audio',
        audio_base64: base64,
        audio_mime: mime,
        categories: categories.map((category) => category.name),
        source_type: 'voice',
      })

      if (remote) {
        showResult(remote)
      } else {
        setError(
          'No pude transcribir la nota de voz: falta configurar capture-parse (Cloudflare Whisper o Groq). Prueba con el dictado por voz del teclado o escríbelo en texto.',
        )
        pushMessage('assistant', 'No pude transcribir ese audio todavía. ¿Me lo escribes en texto?')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer la nota de voz. Inténtalo de nuevo.')
      pushMessage('assistant', 'No pude leer esa nota de voz. ¿Me lo escribes en texto?')
    } finally {
      setBusy(false)
    }
  }

  function startDictation() {
    const Constructor = getSpeechRecognition()
    if (!Constructor) {
      void startRecording()
      return
    }

    const recognition = new Constructor()
    recognitionRef.current = recognition
    recognition.lang = 'es-MX'
    recognition.interimResults = false
    recognition.continuous = false
    setListening(true)

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) {
        setInput((previous) => (previous ? `${previous} ${transcript}` : transcript))
        pushMessage('assistant', `Te entendí: “${transcript}”. Revisa el texto y envíalo si está bien.`)
      }
    }
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === 'not-allowed') {
        setError('El navegador no permitió usar el micrófono. Revisa el permiso de micrófono.')
      }
    }
    recognition.onend = () => setListening(false)

    try {
      recognition.start()
    } catch {
      setListening(false)
      void startRecording()
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) void handleAudioBlob(blob, blob.type || 'audio/webm')
      }

      recorder.start()
      setRecording(true)
    } catch {
      setError('No pude acceder al micrófono. Revisa el permiso de micrófono del navegador.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
  }

  async function confirmDraft(draft: Draft) {
    if (!data.me || !data.household) return

    const amount = parseAmount(draft.amount)
    if (!amount) {
      setError('Escribe un monto mayor a $0 en la tarjeta antes de confirmar.')
      return
    }
    if (!draft.date) {
      setError('Elige una fecha válida en la tarjeta antes de confirmar.')
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
        dedupe_hash: await dedupeHash({
          date: draft.date,
          amount,
          merchant: draft.merchant.trim() || '',
          account_id: draft.accountId,
        }),
      })

      setDrafts((current) => current.filter((item) => item.id !== draft.id))
      pushMessage(
        'assistant',
        `Guardado: ${formatMoney(amount, currency)}${draft.merchant ? ` en ${draft.merchant}` : ''} (${draft.date}). ${data.partner ? 'Ya se ve en ambos teléfonos.' : 'Ya se ve en tu app.'}`,
      )

      // Cada captura confirmada suma al contador mensual del hogar.
      try {
        const increment = await registrarCapturaIA(data.household.id)
        if (increment && !increment.allowed) {
          pushMessage(
            'assistant',
            `Llegaste al límite de capturas con IA de este mes (${increment.used}/${increment.limit}). Con Plus son ilimitadas (uso justo: 300 al mes).`,
          )
          setPaywall(mensajeLimiteIA())
        }
      } catch {
        // El contador es secundario: el movimiento ya está guardado.
      }
      onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el movimiento.')
    } finally {
      setSavingId(null)
    }
  }

  function updateReminderDraft(id: string, patch: Partial<ReminderDraft>) {
    setReminderDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
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
      const { error: insertError } = await supabase.from('reminders').insert({
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
      if (insertError) throw new Error(insertError.message)

      setReminderDrafts((current) => current.filter((item) => item.id !== draft.id))
      showReaction('apuntando')
      pushMessage(
        'assistant',
        `Recordatorio creado: ${draft.title.trim()} para el ${draft.dueDate}${amount ? ` por ${formatMoney(amount, currency)}` : ''}. Te avisaré ese día; también lo ves en la pestaña Avisos.`,
      )
      onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el recordatorio.')
    } finally {
      setSavingId(null)
    }
  }

  const speechSupported =
    getSpeechRecognition() !== null || Boolean(navigator.mediaDevices?.getUserMedia)
  const isEmpty = messages.length === 0 && drafts.length === 0 && reminderDrafts.length === 0

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto'
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 24
    textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * 5)}px`
    textarea.style.overflowY = textarea.scrollHeight > lineHeight * 5 ? 'auto' : 'hidden'
  }

  return (
    <div className="flex min-h-full flex-col gap-4 px-4 pb-40 pt-4">
      {isEmpty ? (
        <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-label={`Abrir el panel de ${name}`}
            title={name}
            className="mb-4 rounded-full transition-transform hover:scale-105 active:scale-95"
          >
            <Mascota pose="avatarCircular" circular alt={`${name}, tu cerdito`} className="h-24 w-24" />
          </button>
          <h1 className="mb-2 text-2xl font-bold text-crema">{name}</h1>
          <p className="mb-2 text-sm text-crema">Hola, ¿qué registramos hoy?</p>
          <p className="max-w-[36ch] text-[13px] leading-relaxed text-humo">
            Escríbeme un gasto, mándame la foto de un ticket o de tu libreta, o graba una nota de voz.
            Te propongo los movimientos y tú confirmas antes de guardar. Nada se guarda solo. Y si
            quieres un aviso, dime “recuérdame pagar la renta”.
          </p>
        </section>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  aria-label={`Abrir el panel de ${name}`}
                  title={name}
                  className="mt-0.5 shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
                >
                  <Mascota pose="avatarCircular" circular alt={`${name}, tu cerdito`} className="h-8 w-8" />
                </button>
              )}
              {message.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl bg-elevado px-3 py-2 text-sm text-crema">
                  {message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt="Foto enviada para capturar"
                      className="mb-2 max-h-48 rounded-xl object-cover"
                    />
                  )}
                  {message.text}
                </div>
              ) : (
                <div className="max-w-[85%] py-2 text-sm leading-relaxed text-crema">
                  {message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt="Foto enviada para capturar"
                      className="mb-2 max-h-48 rounded-xl object-cover"
                    />
                  )}
                  {message.text}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                aria-label={`Abrir el panel de ${name}`}
                className="mt-0.5 shrink-0 rounded-full"
              >
                <Mascota pose="avatarCircular" circular alt={`${name}, tu cerdito`} className="h-8 w-8" />
              </button>
              <div
                className="flex h-8 items-center gap-1.5 rounded-full bg-elevado px-3"
                role="status"
                aria-label={`${name} está escribiendo`}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-humo" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-humo [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-humo [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      )}

      {panelOpen && <PibbiPanel open={panelOpen} onClose={() => setPanelOpen(false)} />}
      {reaction && <PibbiReaction contexto={reaction} />}

      {reminderDrafts.map((draft) => (
        <article key={draft.id} className="tarjeta p-5 shadow-tarjeta">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-crema">Recordatorio propuesto</h3>
            <span className="chip">Sin guardar aún · no es un gasto</span>
          </div>

          {draft.proposal.needs_review.length > 0 && (
            <p className="mb-3 text-xs text-rojosuave">
              Revisar: {draft.proposal.needs_review
                .map((item) => (item === 'date' ? 'fecha' : item === 'amount' ? 'monto' : item === 'category' ? 'categoría' : item))
                .join(', ')}
            </p>
          )}

          <label className="mb-1 block text-xs text-humo">Título</label>
          <input
            value={draft.title}
            onChange={(event) => updateReminderDraft(draft.id, { title: event.target.value })}
            className="campo-chico mb-3 w-full font-bold"
          />

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Monto ({currency}, opcional)</label>
              <input
                inputMode="decimal"
                value={draft.amount}
                onChange={(event) => updateReminderDraft(draft.id, { amount: event.target.value })}
                placeholder="Sin monto"
                className="campo-chico w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Categoría</label>
              <select
                value={draft.categoryId}
                onChange={(event) => updateReminderDraft(draft.id, { categoryId: event.target.value })}
                className="campo-chico w-full"
              >
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Fecha</label>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => updateReminderDraft(draft.id, { dueDate: event.target.value })}
                className="campo-chico w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Hora</label>
              <input
                type="time"
                value={draft.dueTime}
                onChange={(event) => updateReminderDraft(draft.id, { dueTime: event.target.value })}
                className="campo-chico w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Se repite</label>
              <select
                value={draft.recurrence}
                onChange={(event) =>
                  updateReminderDraft(draft.id, { recurrence: event.target.value as ReminderRecurrence })
                }
                className="campo-chico w-full"
              >
                {(Object.keys(RECURRENCE_LABELS) as ReminderRecurrence[]).map((key) => (
                  <option key={key} value={key}>{RECURRENCE_LABELS[key]}</option>
                ))}
              </select>
            </div>
          </div>

          {draft.proposal.original_text && (
            <p className="mb-3 text-xs italic text-humo">“{draft.proposal.original_text}”</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmReminderDraft(draft)}
              disabled={savingId === draft.id}
              className="btn-primario-chico flex-1 disabled:opacity-50"
            >
              {savingId === draft.id ? 'Guardando…' : 'Crear recordatorio'}
            </button>
            <button
              type="button"
              onClick={() => setReminderDrafts((current) => current.filter((item) => item.id !== draft.id))}
              className="btn-fantasma"
            >
              Descartar
            </button>
          </div>
        </article>
      ))}

      {drafts.map((draft) => (
        <article key={draft.id} className="tarjeta p-5 shadow-tarjeta">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-crema">Propuesta para revisar</h3>
            <span className="chip">Sin guardar aún</span>
          </div>

          {draft.entry.needs_review.length > 0 && (
            <p className="mb-3 text-xs text-rojosuave">
              Revisar: {draft.entry.needs_review.map((item) => REVIEW_LABELS[item] ?? item).join(', ')}
            </p>
          )}

          <div className="mb-3 grid grid-cols-3 gap-2">
            {(['gasto', 'ingreso', 'transferencia'] as TxType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  updateDraft(draft.id, {
                    type,
                    splitPct: type === 'transferencia' ? 100 : draft.splitPct,
                  })
                }
                className={draft.type === type ? 'chip-activo capitalize' : 'chip capitalize'}
              >
                {type}
              </button>
            ))}
          </div>

          <label className="mb-1 block text-xs text-humo">Monto ({currency})</label>
          <input
            inputMode="decimal"
            value={draft.amount}
            onChange={(event) => updateDraft(draft.id, { amount: event.target.value })}
            className="campo-chico mb-3 w-full text-lg font-bold"
          />

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Categoría</label>
              <select
                value={draft.categoryId}
                onChange={(event) => updateDraft(draft.id, { categoryId: event.target.value })}
                className="campo-chico w-full"
              >
                <option value="">Elige…</option>
                {categories
                  .filter((category) => (draft.type === 'ingreso' ? category.group === 'Ingresos' : category.group !== 'Ingresos'))
                  .map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Cuenta</label>
              <select
                value={draft.accountId}
                onChange={(event) => updateDraft(draft.id, { accountId: event.target.value })}
                className="campo-chico w-full"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-humo">Quién pagó</label>
              <select
                value={draft.paidBy}
                onChange={(event) => updateDraft(draft.id, { paidBy: event.target.value })}
                className="campo-chico w-full"
              >
                {[data.me, data.partner].filter((user) => user !== null).map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-humo">Fecha</label>
              <input
                type="date"
                value={draft.date}
                onChange={(event) => updateDraft(draft.id, { date: event.target.value })}
                className="campo-chico w-full"
              />
            </div>
          </div>

          <input
            value={draft.merchant}
            onChange={(event) => updateDraft(draft.id, { merchant: event.target.value })}
            placeholder="Comercio (ej. Walmart)"
            className="campo-chico mb-3 w-full"
          />
          <input
            value={draft.note}
            onChange={(event) => updateDraft(draft.id, { note: event.target.value })}
            placeholder="Nota (opcional)"
            className="campo-chico mb-3 w-full"
          />

          {draft.type === 'gasto' && data.partner && (
            <p className="mb-3 text-xs text-humo">
              Split: {draft.splitPct}% lo asume{' '}
              {draft.paidBy === data.me?.id ? 'quien pagó (tú)' : (data.partner.name || 'tu pareja')} ·{' '}
              {draft.paidBy === data.me?.id
                ? `${data.partner.name || 'tu pareja'} te debe`
                : 'le debes a tu pareja'}{' '}
              {formatMoney(
                (parseAmount(draft.amount) * (100 - draft.splitPct)) / 100,
                currency,
              )}
            </p>
          )}

          {draft.entry.original_text && (
            <p className="mb-3 text-xs italic text-humo">“{draft.entry.original_text}”</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmDraft(draft)}
              disabled={savingId === draft.id}
              className="btn-primario-chico flex-1 disabled:opacity-50"
            >
              {savingId === draft.id ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button
              type="button"
              onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}
              className="btn-fantasma"
            >
              Descartar
            </button>
          </div>
        </article>
      ))}

      {error && (
        <p role="alert" className="rounded-xl bg-rojosuave/10 p-3 text-sm text-rojosuave">
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void handleText(input)
        }}
        className="fixed inset-x-4 z-40 mx-auto flex max-w-2xl items-end gap-2 rounded-full border border-borde bg-tarjeta p-2 shadow-elevada"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Subir foto de ticket o libreta"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImage(file)
            event.target.value = ''
          }}
        />

        <button
          type="button"
          aria-label="Subir foto de ticket o libreta"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-icono h-10 w-10 shrink-0 disabled:opacity-50"
        >
          <Icono nombre="camara" className="h-5 w-5" />
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
          className={`btn-icono h-10 w-10 shrink-0 disabled:opacity-50 ${
            recording || listening ? 'text-rojosuave' : ''
          }`}
        >
          <Icono nombre="microfono" className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            resizeTextarea(event.currentTarget)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleText(input)
            }
          }}
          placeholder="Ej. Gasté $350 en Walmart…"
          aria-label="Escribe un gasto, ingreso o transferencia"
          className="min-h-10 min-w-0 flex-1 resize-none self-center bg-transparent px-1 py-2 text-sm leading-6 text-crema outline-none placeholder:text-humo"
        />

        <button
          type="submit"
          aria-label="Enviar"
          disabled={busy || !input.trim()}
          className="btn-primario flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 disabled:opacity-50"
        >
          <Icono nombre="flechaArriba" className="h-5 w-5" />
        </button>
      </form>

      {paywall && <Paywall motivo={paywall} onClose={() => setPaywall(null)} />}
      <div ref={messagesEndRef} />
    </div>
  )
}