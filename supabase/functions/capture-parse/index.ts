// capture-parse — Supabase Edge Function (Deno).
// Convierte texto / foto / voz en PROPUESTAS JSON. NUNCA escribe en BD.
// Principal: Cloudflare Workers AI ($0 recurrente, 10,000 Neurons/día, ZDR/no entrena).
//   texto -> @cf/zai-org/glm-4.7-flash
//   foto  -> @cf/mistralai/mistral-small-3.1-24b-instruct (guided_json)
//   voz   -> @cf/openai/whisper-large-v3-turbo
// Respaldo $0: Groq (texto/voz, ZDR) y Z.AI GLM-4.6V-Flash (visión).
// NO se usa Gemini free en producción (entrena con datos).
// Llaves SOLO en secretos de Supabase: supabase secrets set CLOUDFLARE_ACCOUNT_ID=... etc.
// Jamás en el código ni en el frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  EXTRACTION_PROMPT,
  isValidTimeZone,
  jsonResponse,
  sanitizeCaptureResult,
  todayIsoForTimezone,
  type CaptureResult,
  type CaptureSourceType,
} from '../_shared/capture.ts'

const CF_TEXT_MODEL = '@cf/zai-org/glm-4.7-flash'
const CF_VISION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'
const CF_WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo'

function cfUrl(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
}

function cfHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function extractJson(text: string): unknown | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function categoriesPrompt(categories: string[]): string {
  return categories.length > 0
    ? `\nCategorías disponibles (usa exactamente uno de estos nombres o null): ${categories.join(', ')}.`
    : ''
}

/**
 * Línea de fecha que se añade al prompt. La zona es la del dispositivo
 * que captura (la envía el frontend); nunca se hardcodea una zona.
 */
function todayLine(today: string, timezoneLabel: string): string {
  return `\nHoy es ${today} (${timezoneLabel}). La zona horaria es la del dispositivo que captura; "ayer" es el día anterior a esa fecha en esa zona.`
}

async function cfText(accountId: string, token: string, text: string, categories: string[], sourceType: CaptureSourceType, today: string, timezoneLabel: string, timezone?: string): Promise<CaptureResult | null> {
  const r = await fetch(cfUrl(accountId, CF_TEXT_MODEL), {
    method: 'POST',
    headers: cfHeaders(token),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      messages: [
        { role: 'system', content: `${EXTRACTION_PROMPT}${categoriesPrompt(categories)}${todayLine(today, timezoneLabel)}` },
        { role: 'user', content: text },
      ],
      max_tokens: 1200,
    }),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { result?: { response?: string } }
  const parsed = extractJson(data.result?.response ?? '')
  const clean = sanitizeCaptureResult(parsed, sourceType, timezone)
  return clean ? { ...clean, provider: 'cloudflare' } : null
}

async function cfVision(accountId: string, token: string, imageBase64: string, categories: string[], sourceType: CaptureSourceType, today: string, timezoneLabel: string, timezone?: string): Promise<CaptureResult | null> {
  const schema = {
    type: 'object',
    properties: {
      currency: { type: 'string', enum: ['MXN'] },
      source_type: { type: 'string' },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia'] },
            amount_minor: { type: 'integer' },
            merchant: { type: 'string' },
            category: { type: 'string' },
            occurred_at: { type: 'string' },
            payer: { type: 'string', enum: ['current_user', 'partner', 'unknown'] },
            split_pct: { type: 'integer' },
            note: { type: 'string' },
            line_items: { type: 'array', items: { type: 'string' } },
            original_text: { type: 'string' },
            needs_review: { type: 'array', items: { type: 'string' } },
          },
          required: ['type', 'amount_minor', 'occurred_at', 'payer', 'split_pct', 'original_text'],
        },
      },
      requires_confirmation: { type: 'boolean' },
    },
    required: ['currency', 'entries', 'requires_confirmation'],
  }
  const r = await fetch(cfUrl(accountId, CF_VISION_MODEL), {
    method: 'POST',
    headers: cfHeaders(token),
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${EXTRACTION_PROMPT}${categoriesPrompt(categories)}${todayLine(today, timezoneLabel)} Lee esta foto (ticket o libreta escrita a mano) y extrae los movimientos.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      guided_json: schema,
      max_tokens: 1500,
    }),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { result?: { response?: string } }
  const parsed = extractJson(data.result?.response ?? '')
  const clean = sanitizeCaptureResult(parsed, sourceType, timezone)
  return clean ? { ...clean, provider: 'cloudflare' } : null
}

async function cfWhisper(accountId: string, token: string, audioBytes: Uint8Array): Promise<string | null> {
  // Workers AI Whisper acepta el audio binario en el cuerpo de la petición.
  const r = await fetch(cfUrl(accountId, CF_WHISPER_MODEL), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(90_000),
    // deno-lint-ignore no-explicit-any
    body: audioBytes as any,
  })
  if (!r.ok) return null
  const data = (await r.json()) as { result?: { text?: string } }
  const text = data.result?.text?.trim()
  return text ? text : null
}

async function groqText(apiKey: string, text: string, categories: string[], sourceType: CaptureSourceType, today: string, timezoneLabel: string, timezone?: string): Promise<CaptureResult | null> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: `${EXTRACTION_PROMPT}${categoriesPrompt(categories)}${todayLine(today, timezoneLabel)}` },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1200,
    }),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const clean = sanitizeCaptureResult(extractJson(data.choices?.[0]?.message?.content ?? ''), sourceType, timezone)
  return clean ? { ...clean, provider: 'groq' } : null
}

async function groqWhisper(apiKey: string, audioBytes: Uint8Array, mime: string): Promise<string | null> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audioBytes)], { type: mime || 'audio/webm' }), 'nota.webm')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'es')
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(90_000),
    body: form,
  })
  if (!r.ok) return null
  const data = (await r.json()) as { text?: string }
  const text = data.text?.trim()
  return text ? text : null
}

async function zaiVision(apiKey: string, imageBase64: string, categories: string[], sourceType: CaptureSourceType, today: string, timezoneLabel: string, timezone?: string): Promise<CaptureResult | null> {
  const r = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: 'glm-4.6v-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${EXTRACTION_PROMPT}${categoriesPrompt(categories)}${todayLine(today, timezoneLabel)} Lee esta foto (ticket o libreta escrita a mano) y extrae los movimientos.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1500,
    }),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const clean = sanitizeCaptureResult(extractJson(data.choices?.[0]?.message?.content ?? ''), sourceType, timezone)
  return clean ? { ...clean, provider: 'zai' } : null
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return jsonResponse({ error: 'Falta el token de sesión' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Sesión inválida' }, 401)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido' }, 400)
  }
  const inputType = body.input_type as string
  const categories = Array.isArray(body.categories) ? (body.categories as string[]).filter((c) => typeof c === 'string').slice(0, 50) : []
  // Zona horaria del dispositivo que captura (ej. "America/Tijuana").
  // Nunca se hardcodea: "hoy"/"ayer" se calculan en esa zona.
  const timezone = isValidTimeZone(body.timezone) ? (body.timezone as string) : undefined
  const today = todayIsoForTimezone(timezone)
  const timezoneLabel = timezone ?? 'UTC'
  const cfAccount = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ?? ''
  const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN') ?? ''
  const groqKey = Deno.env.get('GROQ_API_KEY') ?? ''
  const zaiKey = Deno.env.get('ZAI_API_KEY') ?? ''

  try {
    if (inputType === 'text') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : ''
      if (!text) return jsonResponse({ error: 'Falta el texto' }, 400)
      if (cfAccount && cfToken) {
        const r = await cfText(cfAccount, cfToken, text, categories, 'text', today, timezoneLabel, timezone)
        if (r) return jsonResponse(r)
      }
      if (groqKey) {
        const r = await groqText(groqKey, text, categories, 'text', today, timezoneLabel, timezone)
        if (r) return jsonResponse(r)
      }
      return jsonResponse({ error: 'No se pudo analizar el texto: configura CLOUDFLARE_API_TOKEN o GROQ_API_KEY en los secretos de Supabase.' }, 502)
    }

    if (inputType === 'image') {
      const imageBase64 = typeof body.image_base64 === 'string' ? body.image_base64 : ''
      if (!imageBase64 || imageBase64.length > 7_000_000) return jsonResponse({ error: 'Falta la foto o es demasiado grande' }, 400)
      const sourceType: CaptureSourceType = body.source_type === 'notebook' ? 'notebook' : 'ticket'
      if (cfAccount && cfToken) {
        const r = await cfVision(cfAccount, cfToken, imageBase64, categories, sourceType, today, timezoneLabel, timezone)
        if (r) return jsonResponse(r)
      }
      if (zaiKey) {
        const r = await zaiVision(zaiKey, imageBase64, categories, sourceType, today, timezoneLabel, timezone)
        if (r) return jsonResponse(r)
      }
      return jsonResponse({ error: 'No se pudo leer la foto: configura CLOUDFLARE_API_TOKEN o ZAI_API_KEY en los secretos de Supabase.' }, 502)
    }

    if (inputType === 'audio') {
      const audioBase64 = typeof body.audio_base64 === 'string' ? body.audio_base64 : ''
      const audioBytes = b64ToBytes(audioBase64)
      if (!audioBytes || audioBytes.length > 10_000_000) return jsonResponse({ error: 'Falta el audio o es demasiado grande' }, 400)
      const mime = typeof body.audio_mime === 'string' ? body.audio_mime : 'audio/webm'
      let transcript: string | null = null
      if (cfAccount && cfToken) transcript = await cfWhisper(cfAccount, cfToken, audioBytes)
      if (!transcript && groqKey) transcript = await groqWhisper(groqKey, audioBytes, mime)
      if (!transcript) return jsonResponse({ error: 'No se pudo transcribir el audio: configura CLOUDFLARE_API_TOKEN o GROQ_API_KEY.' }, 502)
      // La transcripción se vuelve a analizar como texto.
      if (cfAccount && cfToken) {
        const r = await cfText(cfAccount, cfToken, transcript, categories, 'voice', today, timezoneLabel, timezone)
        if (r) return jsonResponse({ ...r, raw_text: transcript })
      }
      if (groqKey) {
        const r = await groqText(groqKey, transcript, categories, 'voice', today, timezoneLabel, timezone)
        if (r) return jsonResponse({ ...r, raw_text: transcript })
      }
      return jsonResponse({ error: 'Audio transcrito, pero no se pudo analizar el texto.' }, 502)
    }

    return jsonResponse({ error: "input_type debe ser 'text', 'image' o 'audio'" }, 400)
  } catch (e) {
    console.error('capture-parse error', e)
    return jsonResponse({ error: 'Error interno al analizar la captura' }, 500)
  }
})
