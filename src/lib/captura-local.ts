/**
 * Captura GRATIS en el teléfono, sin servidor ni secretos:
 *   - Foto de ticket -> OCR con tesseract.js (idioma spa, carga perezosa:
 *     solo se descarga cuando el usuario manda una foto).
 *   - Voz -> dictado con Web Speech API (es-MX), con transcripción final
 *     que se envía sola al parser.
 *   - Texto / OCR -> parser local en español (lib/capture.ts), con los
 *     montos en palabras convertidos a dígitos (lib/numeros-es.ts).
 *
 * Nada se guarda aquí: todo termina en propuestas editables que el
 * usuario confirma en el chat (o deja en "Por revisar"). La vía de
 * servidor (capture-parse) sigue existiendo como mejora opcional.
 */
import {
  extractAmounts,
  extractMerchant,
  parseCaptureText,
  parseDateEs,
  parseLineToEntry,
  type CaptureResult,
} from './capture'
import { montosEnPalabrasADigitos } from './numeros-es'

type OptsLocal = Parameters<typeof parseCaptureText>[1]

/** Parser local con montos en palabras: "gasté doscientos cincuenta..." también vale. */
export function parsearLocal(texto: string, opts: OptsLocal): CaptureResult {
  return parseCaptureText(montosEnPalabrasADigitos(texto), opts)
}

/**
 * Texto OCR de un ticket -> UNA propuesta con el total.
 * Busca la última línea con "total / a pagar / importe / suma / neto";
 * si no la encuentra, toma el monto mayor de toda la foto y lo marca
 * para revisar. Nunca propone cada línea del ticket como un gasto.
 */
export function parsearTicketOcr(texto: string, opts: OptsLocal): CaptureResult {
  const convertido = montosEnPalabrasADigitos(texto)
  const lineas = convertido.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const conTotal = lineas.filter(
    (l) => /(total|a\s*pagar|importe|suma|neto)/i.test(l) && extractAmounts(l).length > 0,
  )
  const base = conTotal.length > 0
    ? conTotal[conTotal.length - 1]
    : convertido.replace(/\s*\n\s*/g, ' ')
  const entrada = parseLineToEntry(base, { ...opts, sourceType: 'ticket' })
  if (!entrada) {
    return {
      currency: 'MXN',
      source_type: 'ticket',
      entries: [],
      requires_confirmation: true,
      provider: 'local-ocr',
      raw_text: texto.slice(0, 1000),
      message: 'No pude encontrar el total en la foto. Acércate más, con buena luz y que el ticket se vea completo, o escríbeme el monto y el comercio.',
    }
  }
  if (conTotal.length === 0 && !entrada.needs_review.includes('amount')) {
    entrada.needs_review.push('amount')
  }
  // La entrada se armó solo con la línea del total, así que el comercio
  // (primera línea del ticket) y la fecha (otra línea) no se vieron:
  // se buscan en todo el texto del ticket con los mismos helpers.
  if (!entrada.merchant) {
    const comercio = extractMerchant(convertido)
    if (comercio) {
      entrada.merchant = comercio
      entrada.needs_review = entrada.needs_review.filter((r) => r !== 'merchant')
    }
  }
  const fechaTicket = parseDateEs(convertido, opts.timezone)
  if (fechaTicket.found) {
    entrada.occurred_at = fechaTicket.date
    entrada.needs_review = entrada.needs_review.filter((r) => r !== 'date')
  }
  return {
    currency: 'MXN',
    source_type: 'ticket',
    entries: [entrada],
    requires_confirmation: true,
    provider: 'local-ocr',
    raw_text: texto.slice(0, 1000),
  }
}

// ---------- OCR perezoso (tesseract.js) ----------
let workerOcr: import('tesseract.js').Worker | null = null

/** Cierra el worker de OCR (al salir del chat o si falla). */
export async function terminarOcr(): Promise<void> {
  const w = workerOcr
  workerOcr = null
  if (w) {
    try { await w.terminate() } catch { /* ya estaba cerrado */ }
  }
}

/**
 * Lee el texto de una foto de ticket EN el teléfono. La primera vez
 * descarga el motor y el idioma español (por eso la carga es perezosa y
 * se muestra el progreso). Lanza un Error en español si no se pudo leer.
 */
export async function leerTicketEnTelefono(
  imagen: string,
  alProgreso?: (p: { fase: string; pct: number }) => void,
): Promise<string> {
  try {
    const { createWorker, OEM } = await import('tesseract.js')
    alProgreso?.({ fase: 'Preparando el lector…', pct: 0 })
    const worker = await createWorker('spa', OEM.LSTM_ONLY, {
      logger: (m) => {
        const leyendo = m.status === 'recognizing text'
        alProgreso?.({
          fase: leyendo ? 'Leyendo tu ticket…' : 'Preparando el lector…',
          pct: Math.round((m.progress ?? 0) * 100),
        })
      },
    })
    workerOcr = worker
    const { data } = await worker.recognize(imagen)
    await worker.terminate()
    workerOcr = null
    return data.text || ''
  } catch {
    await terminarOcr()
    throw new Error('No pude leer la foto en tu teléfono. Intenta con más luz y que el ticket se vea completo.')
  }
}

// ---------- Dictado por voz (Web Speech API, es-MX) ----------
interface AlternativaDictado { transcript: string }
interface ResultadoDictado extends ArrayLike<AlternativaDictado> { isFinal: boolean }
interface EventoDictado { resultIndex: number; results: ArrayLike<ResultadoDictado> }
interface ReconocimientoVoz {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: EventoDictado) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type CtorDictado = new () => ReconocimientoVoz

function obtenerCtor(): CtorDictado | null {
  const w = window as unknown as { SpeechRecognition?: CtorDictado; webkitSpeechRecognition?: CtorDictado }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** ¿Este navegador trae dictado integrado? (Chrome/Edge/Android sí; iOS Safari no siempre). */
export function dictadoDisponible(): boolean {
  return obtenerCtor() !== null
}

export interface DictadoActivo { detener: () => void; abortar: () => void }

/**
 * Dictado en es-MX. Muestra el texto provisional mientras hablas y llama
 * `alFinal` con la transcripción completa (para enviarla sola al parser).
 * Devuelve null si no se pudo iniciar (sin soporte o sin permiso).
 */
export function crearDictado(opciones: {
  alInterim?: (texto: string) => void
  alFinal: (texto: string) => void
  alError?: (codigo: string) => void
  alFin?: () => void
}): DictadoActivo | null {
  const Ctor = obtenerCtor()
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = 'es-MX'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  let final = ''
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const t = r[0]?.transcript ?? ''
      if (r.isFinal) final += t
      else interim += t
    }
    if (interim) opciones.alInterim?.(interim)
    const completo = final.trim()
    if (completo) {
      final = ''
      opciones.alFinal(completo)
    }
  }
  rec.onerror = (e) => opciones.alError?.(e.error)
  rec.onend = () => opciones.alFin?.()
  try {
    rec.start()
  } catch {
    return null
  }
  return {
    detener: () => { try { rec.stop() } catch { /* ya cerrado */ } },
    abortar: () => { try { rec.abort() } catch { /* ya cerrado */ } },
  }
}

/** Mensaje en español para los errores del dictado. */
export function mensajeErrorDictado(codigo: string): string | null {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'El navegador no permitió usar el micrófono. Revisa el permiso de micrófono.'
    case 'no-speech':
      return 'No escuché nada. Toca el micrófono e intenta de nuevo.'
    case 'audio-capture':
      return 'No encontré un micrófono. Revisa que esté conectado.'
    case 'network':
      return 'El dictado necesita internet. Revisa tu conexión e inténtalo de nuevo.'
    case 'aborted':
      return null
    default:
      return 'El dictado se detuvo. Inténtalo de nuevo.'
  }
}