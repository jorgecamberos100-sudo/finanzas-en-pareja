import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../App'
import type { ProposedReminder, ReminderRecurrence, ReviewStatus, Transaction, TxType } from '../types'
import { dedupeHash, formatMoney, parseAmount } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  amountMinorToUnits,
  deviceTimeZone,
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
import { mensajeHumano } from '../lib/errores'
import {
  crearDictado, dictadoDisponible, leerTicketEnTelefono, mensajeErrorDictado,
  parsearLocal, parsearTicketOcr, terminarOcr, type DictadoActivo,
} from '../lib/captura-local'
import Paywall from './Paywall'
import PibbiReaction, { type ReactionContext } from './PibbiReaction'
import { Boton, IconoCamara, IconoCheck, IconoEnviar, IconoMicrofono, IconoReloj, Spinner, Tarjeta } from './ui'

interface Props {
  data: AppData
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) => Promise<void>
  onRefresh: () => void
  /** Burbujas con las que PIBBI abre la conversación (home). Sin esto, el saludo de siempre. */
  saludo?: string[]
  /** Respuestas con datos reales (saldo, gasto, deuda, sobres, metas, avisos). Si contesta, el texto no va a captura. */
  responderLocal?: (texto: string) => string | null
  /** Atajos en píldora sobre la barra de entrada: preguntan o navegan. */
  sugerencias?: Array<{ etiqueta: string; enviar?: string; ir?: string }>
  onIr?: (ruta: string) => void
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
  /** De dónde vino la propuesta: 'ia' (servidor) o 'local' (teléfono, gratis). */
  origen: 'ia' | 'local'
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
 *
 * Foto y voz funcionan SIEMPRE, aunque el servidor no esté configurado:
 * la foto se lee en el teléfono (OCR spa) y la voz se dicta con el
 * reconocimiento es-MX del navegador. La IA de servidor es una mejora
 * opcional; si falla, se cae a la vía local sin errores técnicos.
 */
export default function ChatCapture({ data, onSave, onRefresh, saludo, responderLocal, sugerencias, onIr }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    saludo && saludo.length > 0
      ? saludo.map((texto, i) => ({ id: `saludo-${i}`, role: 'assistant' as const, text: texto }))
      : [
          {
            id: 'bienvenida',
            role: 'assistant',
            text: 'Escríbeme un gasto, mándame la foto de un ticket o de tu libreta, o dicta una nota de voz. Te propongo los movimientos y tú confirmas antes de guardar. Nada se guarda solo. La foto y la voz se procesan gratis en tu teléfono. Y si quieres un aviso, dime “recuérdame pagar la renta el 1ro”.',
          },
        ],
  )
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [reminderDrafts, setReminderDrafts] = useState<ReminderDraft[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Progreso del OCR local (null = no hay foto en proceso).
  const [ocr, setOcr] = useState<{ fase: string; pct: number } | null>(null)
  // PIBBI reacciona al registrar un dato (sin bloquear nada).
  const [reaction, setReaction] = useState<ReactionContext | null>(null)
  const reactionTimer = useRef<number | null>(null)

  function showReaction(ctx: ReactionContext) {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
    setReaction(ctx)
    reactionTimer.current = window.setTimeout(() => setReaction(null), 5000)
  }
  // Al salir del chat (cambio de pestaña) se limpia el temporizador de la
  // reacción de PIBBI y se detienen grabaciones, dictados u OCR activos.
  useEffect(() => () => {
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop())
        mediaRecorderRef.current.stop()
      } catch {
        // stream ya cerrado
      }
    }
    try {
      recognitionRef.current?.abortar()
    } catch {
      // reconocimiento ya cerrado
    }
    void terminarOcr()
  }, [])
  const [savingId, setSavingId] = useState<string | null>(null)
  // Motivo del paywall (null = cerrado).
  const [paywall, setPaywall] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<DictadoActivo | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Desplazamiento automático al llegar nuevos mensajes o propuestas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, drafts.length, reminderDrafts.length, busy])

  // Zona horaria del dispositivo que captura (ej. "America/Tijuana").
  // Se envía en cada llamada a capture-parse para que "hoy"/"ayer" se
  // calculen en esta zona y no en una hardcodeada.
  const deviceTimezone = deviceTimeZone()
  const currency = data.household?.currency ?? 'MXN'
  const categories = data.categories
  const accounts = data.accounts

  /** Mensaje del límite de capturas con IA del plan (Free: 10/mes). */
  function mensajeLimiteIA(): string {
    const def = defPlan(data.plan)
    return `Ya usaste tus ${def.capturasIaMes} capturas con IA de servidor de este mes (plan ${def.nombre}). La captura en tu teléfono (foto, voz y texto) sigue siendo gratis y sin límite. Con Plus, la IA de servidor es ilimitada (uso justo: 300 al mes).`
  }

  function pushMessage(role: 'user' | 'assistant', text: string, imageUrl?: string) {
    setMessages((m) => [...m, { id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, imageUrl }])
  }

  function entryToDraft(entry: ProposedEntry, index: number, origen: 'ia' | 'local'): Draft {
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
      origen,
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

  function showResult(result: CaptureResult, origen: 'ia' | 'local') {
    if (result.reminders && result.reminders.length > 0) showReminderProposals(result.reminders)
    if (result.entries.length === 0) {
      if (!result.reminders || result.reminders.length === 0) {
        pushMessage('assistant', result.message ?? 'No pude proponer ningún movimiento con eso. ¿Me das el monto?')
      }
      return
    }
    setDrafts((d) => [...d, ...result.entries.map((e, i) => entryToDraft(e, i, origen))])
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
      const clean = sanitizeCaptureResult(res, (body.source_type as CaptureResult['source_type']) ?? 'text', deviceTimezone)
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
    // PIBBI contesta primero con los datos reales (saldo, gasto, deuda,
    // sobres, metas, avisos): una pregunta no es un movimiento y no va
    // a captura. Si no sabe contestar, el texto sigue su camino normal.
    if (responderLocal) {
      const respuesta = responderLocal(trimmed)
      if (respuesta) {
        pushMessage('assistant', respuesta)
        setBusy(false)
        return
      }
    }
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
        pushMessage(
          'assistant',
          'No me quedó claro si ya lo pagaste o si quieres que te avise. Arriba te dejé el recordatorio; si ya fue un gasto, revisa también la propuesta de movimiento de abajo y confirma solo la que aplique.',
        )
      }
    }
    // 1. IA de servidor (solo si hay cuota del plan). 2. Parser local en el
    // teléfono: gratis, sin límite y sin secretos. El contador de IA del
    // plan protege la cuota de Cloudflare; la vía local no la consume.
    const conIA = puedeUsarIA(data.plan)
    if (conIA) {
      const remote = await invokeParse({
        input_type: 'text',
        text: trimmed,
        categories: categories.map((c) => c.name),
        source_type: 'text',
      })
      if (remote) {
        showResult(remote, 'ia')
        setBusy(false)
        return
      }
    }
    const local = parsearLocal(trimmed, { categories, partnerName: data.partner?.name ?? null, sourceType: 'text', timezone: deviceTimezone })
    showResult(local, 'local')
    if (!conIA) {
      if (local.entries.length > 0) {
        pushMessage('assistant', 'Lo capturé en tu teléfono: gratis y sin límite. Las capturas con IA de servidor de este mes ya se usaron.')
      } else {
        pushMessage('assistant', mensajeLimiteIA())
        setPaywall(mensajeLimiteIA())
      }
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
      setError(mensajeHumano(e, 'No se pudo procesar la imagen.'))
      setBusy(false)
      return
    }
    pushMessage('user', 'Foto enviada', compressed.dataUrl)
    // 1. IA de servidor (visión), solo si hay cuota. Si no está configurada
    // o falla, NO se muestra ningún error de secretos: se cae al OCR local.
    if (puedeUsarIA(data.plan)) {
      const remote = await invokeParse({
        input_type: 'image',
        image_base64: compressed.base64,
        image_mime: 'image/jpeg',
        categories: categories.map((c) => c.name),
        source_type: 'ticket',
      })
      if (remote) {
        showResult(remote, 'ia')
        setBusy(false)
        return
      }
    }
    // 2. OCR en el teléfono (tesseract.js, spa, carga perezosa).
    try {
      setOcr({ fase: 'Preparando el lector…', pct: 0 })
      const texto = await leerTicketEnTelefono(compressed.dataUrl, (p) => setOcr(p))
      setOcr(null)
      const resultado = parsearTicketOcr(texto, { categories, partnerName: data.partner?.name ?? null, timezone: deviceTimezone })
      showResult(resultado, 'local')
      if (resultado.entries.length === 0 && !puedeUsarIA(data.plan)) {
        setPaywall(mensajeLimiteIA())
      }
    } catch (e) {
      setOcr(null)
      pushMessage('assistant', mensajeHumano(e, 'No pude leer la foto en tu teléfono. Intenta con más luz y que el ticket se vea completo, o escríbeme el monto y el comercio.'))
      if (!puedeUsarIA(data.plan)) setPaywall(mensajeLimiteIA())
    }
    setBusy(false)
  }

  async function handleAudioBlob(blob: Blob, mime: string) {
    // Nota de voz grabada (solo se usa cuando el navegador no trae dictado
    // integrado). Se transcribe con IA de servidor si hay cuota.
    setBusy(true)
    setError(null)
    pushMessage('user', 'Nota de voz')
    // try/finally: si leer el audio falla, el chat se desbloquea igual.
    try {
      if (puedeUsarIA(data.plan)) {
        const base64 = await blobToBase64(blob)
        const remote = await invokeParse({
          input_type: 'audio',
          audio_base64: base64,
          audio_mime: mime,
          categories: categories.map((c) => c.name),
          source_type: 'voice',
        })
        if (remote) {
          showResult(remote, 'ia')
          setBusy(false)
          return
        }
      }
      pushMessage('assistant', 'Tu navegador no trae dictado integrado. Usa el micrófono del teclado para dictarme el texto, o escríbelo; también puedes mandar la foto del ticket y la leo en tu teléfono.')
      if (!puedeUsarIA(data.plan)) setPaywall(mensajeLimiteIA())
    } catch (e) {
      setError(mensajeHumano(e, 'No se pudo leer la nota de voz. Inténtalo de nuevo.'))
      pushMessage('assistant', 'No pude leer esa nota de voz. ¿Me lo escribes en texto?')
    } finally {
      setBusy(false)
    }
  }

  function startDictation() {
    // Dictado es-MX del navegador: la transcripción final se envía SOLA al
    // parser ("gasté 250 en el súper" -> propuesta directa, sin otro toque).
    const dictado = crearDictado({
      alInterim: (t) => setInput(t),
      alFinal: (t) => {
        setInput('')
        void handleText(t)
      },
      alError: (codigo) => {
        setListening(false)
        const msg = mensajeErrorDictado(codigo)
        if (msg) setError(msg)
      },
      alFin: () => setListening(false),
    })
    if (!dictado) {
      // Sin dictado integrado: grabar nota de voz para la IA de servidor.
      void startRecording()
      return
    }
    recognitionRef.current = dictado
    setListening(true)
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

  async function confirmDraft(draft: Draft, estado: ReviewStatus = 'aprobado') {
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
        review_status: estado,
        dedupe_hash: await dedupeHash({ date: draft.date, amount, merchant: draft.merchant.trim() || '', account_id: draft.accountId }),
      })
      setDrafts((ds) => ds.filter((d) => d.id !== draft.id))
      if (estado === 'pendiente') {
        pushMessage('assistant', `Lo dejé en “Por revisar” (pestaña Movimientos): ${formatMoney(amount, currency)}${draft.merchant ? ` en ${draft.merchant}` : ''}. Nada se aprueba solo: tú o tu pareja lo aprueban ahí.`)
      } else {
        pushMessage('assistant', `Guardado: ${formatMoney(amount, currency)}${draft.merchant ? ` en ${draft.merchant}` : ''} (${draft.date}). ${data.partner ? 'Ya se ve en ambos teléfonos.' : 'Ya se ve en tu app.'}`)
      }
      // Contador de capturas con IA (migración 005): solo suma las propuestas
      // que vinieron de la IA de servidor. La captura local en el teléfono es
      // gratis y sin límite: no consume la cuota. Nunca rompe el guardado.
      if (draft.origen === 'ia') {
        try {
          const inc = await registrarCapturaIA(data.household.id)
          if (inc && !inc.allowed) {
            pushMessage('assistant', `Llegaste al límite de capturas con IA de servidor de este mes (${inc.used}/${inc.limit}). La captura en tu teléfono sigue gratis y sin límite.`)
            setPaywall(mensajeLimiteIA())
          }
        } catch {
          // El contador es secundario: el movimiento ya está guardado.
        }
      }
      onRefresh()
    } catch (e) {
      setError(mensajeHumano(e, 'No se pudo guardar el movimiento.'))
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
        `Recordatorio creado: ${draft.title.trim()} para el ${draft.dueDate}${amount ? ` por ${formatMoney(amount, currency)}` : ''}. Te avisaré ese día; también lo ves en la pestaña Avisos.`,
      )
      onRefresh()
    } catch (e) {
      setError(mensajeHumano(e, 'No se pudo guardar el recordatorio.'))
    } finally {
      setSavingId(null)
    }
  }

  const speechSupported = dictadoDisponible() || Boolean(navigator.mediaDevices?.getUserMedia)

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <div className="space-y-3" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] break-words rounded-[22px] px-4 py-3 text-[15px] leading-6 shadow-tarjeta ${
                m.role === 'user' ? 'rounded-br-md bg-dorado text-tinta' : 'rounded-bl-md bg-elevado text-crema'
              }`}
            >
              {m.imageUrl && <img src={m.imageUrl} alt="Foto enviada para capturar" className="mb-2 max-h-48 rounded-xl object-cover" />}
              {m.text}
            </div>
          </div>
        ))}
        {busy && !ocr && <PibbiReaction contexto="pensando" mensaje="PIBBI está revisando tu mensaje…" />}
        {ocr && (
          <Tarjeta className="flex items-center gap-3 border-foco/60 p-3">
            <Spinner className="h-5 w-5 shrink-0 text-doradotexto" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-crema">{ocr.fase} {ocr.pct > 0 ? `${ocr.pct}%` : ''}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-borde">
                <div className="h-full w-full origin-left rounded-full bg-dorado transition-transform duration-300" style={{ transform: `scaleX(${Math.max(4, ocr.pct) / 100})` }} />
              </div>
            </div>
          </Tarjeta>
        )}
      </div>

      {reaction && <PibbiReaction contexto={reaction} />}

      {reminderDrafts.map((d) => (
        <Tarjeta key={d.id} className="border-foco/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold"><IconoReloj className="h-4 w-4 text-doradotexto" /> Recordatorio propuesto</h3>
            <span className="rounded-full bg-dorado/15 px-2 py-0.5 text-xs font-semibold text-doradotexto">Sin guardar aún · no es un gasto</span>
          </div>
          {d.proposal.needs_review.length > 0 && (
            <p className="mb-2 text-xs text-doradotexto">
              Revisar: {d.proposal.needs_review.map((r) => (r === 'date' ? 'fecha' : r === 'amount' ? 'monto' : r === 'category' ? 'categoría' : r)).join(', ')}
            </p>
          )}
          <label className="mb-1 block text-xs font-semibold text-humo">Título</label>
          <input
            value={d.title}
            onChange={(e) => updateReminderDraft(d.id, { title: e.target.value })}
            className="mb-2 w-full rounded-xl border border-borde p-2 text-sm font-bold"
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Monto ({currency}, opcional)</label>
              <input
                inputMode="decimal"
                value={d.amount}
                onChange={(e) => updateReminderDraft(d.id, { amount: e.target.value })}
                placeholder="Sin monto"
                className="w-full rounded-xl border border-borde p-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Categoría</label>
              <select
                value={d.categoryId}
                onChange={(e) => updateReminderDraft(d.id, { categoryId: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Fecha</label>
              <input
                type="date"
                value={d.dueDate}
                onChange={(e) => updateReminderDraft(d.id, { dueDate: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Hora</label>
              <input
                type="time"
                value={d.dueTime}
                onChange={(e) => updateReminderDraft(d.id, { dueTime: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Se repite</label>
              <select
                value={d.recurrence}
                onChange={(e) => updateReminderDraft(d.id, { recurrence: e.target.value as ReminderRecurrence })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              >
                {(Object.keys(RECURRENCE_LABELS) as ReminderRecurrence[]).map((k) => (
                  <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          {d.proposal.original_text && <p className="mb-2 text-xs italic text-humo">“{d.proposal.original_text}”</p>}
          <div className="flex gap-2">
            <Boton
              onClick={() => void confirmReminderDraft(d)}
              cargando={savingId === d.id}
              tamano="sm"
              className="flex-1"
            >
              Crear recordatorio
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => setReminderDrafts((ds) => ds.filter((x) => x.id !== d.id))}
            >
              Descartar
            </Boton>
          </div>
        </Tarjeta>
      ))}

      {drafts.map((d) => (
        <Tarjeta key={d.id} className="border-foco/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Propuesta para revisar</h3>
            <span className="rounded-full bg-doradotenue px-2 py-0.5 text-xs font-semibold text-doradotexto">
              {d.origen === 'ia' ? 'IA de servidor · sin guardar' : 'En tu teléfono · sin guardar'}
            </span>
          </div>
          {d.entry.needs_review.length > 0 && (
            <p className="mb-2 text-xs text-doradotexto">
              Revisar: {d.entry.needs_review.map((r) => REVIEW_LABELS[r] ?? r).join(', ')}
            </p>
          )}
          <div className="mb-2 grid grid-cols-3 gap-2">
            {(['gasto', 'ingreso', 'transferencia'] as TxType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => updateDraft(d.id, { type: t, splitPct: t === 'transferencia' ? 100 : d.splitPct })}
                className={`rounded-xl py-1.5 text-xs font-semibold capitalize transition active:scale-95 ${d.type === t ? 'bg-dorado text-tinta' : 'bg-elevado text-humo'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="mb-1 block text-xs font-semibold text-humo">Monto ({currency})</label>
          <input
            inputMode="decimal"
            value={d.amount}
            onChange={(e) => updateDraft(d.id, { amount: e.target.value })}
            className="nums mb-2 w-full rounded-xl border border-borde p-2 font-display text-lg font-bold"
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Categoría</label>
              <select
                value={d.categoryId}
                onChange={(e) => updateDraft(d.id, { categoryId: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              >
                <option value="">Elige…</option>
                {categories
                  .filter((c) => (d.type === 'ingreso' ? c.group === 'Ingresos' : c.group !== 'Ingresos'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Cuenta</label>
              <select
                value={d.accountId}
                onChange={(e) => updateDraft(d.id, { accountId: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
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
              <label className="mb-1 block text-xs font-semibold text-humo">Quién pagó</label>
              <select
                value={d.paidBy}
                onChange={(e) => updateDraft(d.id, { paidBy: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              >
                {[data.me, data.partner].filter(Boolean).map((u) => (
                  <option key={u!.id} value={u!.id}>
                    {u!.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-humo">Fecha</label>
              <input
                type="date"
                value={d.date}
                onChange={(e) => updateDraft(d.id, { date: e.target.value })}
                className="w-full rounded-xl border border-borde p-2 text-sm"
              />
            </div>
          </div>
          <input
            value={d.merchant}
            onChange={(e) => updateDraft(d.id, { merchant: e.target.value })}
            placeholder="Comercio (ej. Walmart)"
            className="mb-2 w-full rounded-xl border border-borde p-2 text-sm"
          />
          <input
            value={d.note}
            onChange={(e) => updateDraft(d.id, { note: e.target.value })}
            placeholder="Nota (opcional)"
            className="mb-2 w-full rounded-xl border border-borde p-2 text-sm"
          />
          {d.type === 'gasto' && data.partner && (
            <p className="mb-2 text-xs text-humo">
              Split: {d.splitPct}% lo asume {d.paidBy === data.me?.id ? 'quien pagó (tú)' : (data.partner.name || 'tu pareja')} · {d.paidBy === data.me?.id ? (data.partner.name || 'tu pareja') + ' te debe' : 'le debes a tu pareja'} {formatMoney((parseAmount(d.amount) * (100 - d.splitPct)) / 100, currency)}
            </p>
          )}
          {d.entry.original_text && <p className="mb-2 text-xs italic text-humo">“{d.entry.original_text}”</p>}
          <div className="flex flex-wrap gap-2">
            <Boton
              onClick={() => void confirmDraft(d, 'aprobado')}
              cargando={savingId === d.id}
              tamano="sm"
              className="flex-1"
            >
              <IconoCheck className="h-4 w-4" /> Confirmar y guardar
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              disabled={savingId === d.id}
              onClick={() => void confirmDraft(d, 'pendiente')}
              title="Guardar como pendiente en la cola Por revisar de Movimientos"
            >
              Dejar en Por revisar
            </Boton>
            <Boton
              variante="fantasma"
              tamano="sm"
              onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
            >
              Descartar
            </Boton>
          </div>
        </Tarjeta>
      ))}

      {error && (
        <p role="alert" className="rounded-xl bg-rojosuave/10 p-3 text-sm text-rojosuave">
          {error}
        </p>
      )}

      {/*
        Barra de entrada fija abajo (como en Muse): los atajos en píldora,
        la foto, la voz y el envío se quedan visibles mientras se lee la
        conversación. El fondo con blur tapa los mensajes al pasar por debajo.
      */}
      <div className="sticky bottom-[3.5rem] z-30 -mx-4 border-t border-borde/60 bg-noche/90 px-4 pb-1 pt-2 backdrop-blur-xl">
      {sugerencias && sugerencias.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Sugerencias">
          {sugerencias.map((s) => (
            <button
              key={s.etiqueta}
              type="button"
              disabled={busy}
              onClick={() => {
                if (s.ir) onIr?.(s.ir)
                else if (s.enviar) void handleText(s.enviar)
              }}
              className="shrink-0 rounded-full border border-borde bg-elevado px-3 py-1.5 text-xs font-semibold text-crema transition active:scale-95 disabled:opacity-45"
            >
              {s.etiqueta}
            </button>
          ))}
        </div>
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
          className="rounded-full bg-elevado p-2.5 text-crema transition hover:bg-borde active:scale-90 disabled:opacity-45"
        >
          <IconoCamara />
        </button>
        <button
          type="button"
          aria-label={recording ? 'Detener grabación de voz' : listening ? 'Escuchando… toca para terminar' : 'Dictar nota de voz'}
          onClick={() => {
            if (recording) stopRecording()
            else if (listening) recognitionRef.current?.detener()
            else startDictation()
          }}
          disabled={busy || !speechSupported}
          className={`rounded-full p-2.5 transition active:scale-90 disabled:opacity-45 ${recording || listening ? 'animate-latido-suave bg-rojosuave/15 text-rojosuave' : 'bg-elevado text-crema hover:bg-borde'}`}
        >
          <IconoMicrofono />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? 'Escuchando… habla ahora' : 'Ej. Gasté $350 en Walmart…'}
          aria-label="Escribe un gasto, ingreso o transferencia"
          className="min-w-0 flex-1 rounded-xl border border-borde p-3 text-sm"
        />
        <Boton type="submit" disabled={busy || !input.trim()} tamano="sm" className="px-3 py-3" aria-label="Enviar mensaje">
          <IconoEnviar className="h-4 w-4" />
        </Boton>
      </form>
      </div>
      {paywall && <Paywall motivo={paywall} onClose={() => setPaywall(null)} />}
      <div ref={messagesEndRef} />
    </div>
  )
}