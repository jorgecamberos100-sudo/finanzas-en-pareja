// reminders-push — Supabase Edge Function (Deno, sin dependencias externas).
// Envía las notificaciones Web Push a los celulares suscritos, aunque la app esté cerrada.
// Se llama cada 15 min desde pg_cron (ver README, sección "Recordatorios y notificaciones").
//
// Autenticación: NO usa verify_jwt; la llama pg_cron con la service_role key.
// Se valida que el header Authorization sea exactamente la service_role key
// (inyectada por Supabase como SUPABASE_SERVICE_ROLE_KEY). Sin ella -> 401.
// Secretos (solo en Supabase, nunca en el código):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (par generado con `npx web-push generate-vapid-keys`),
//   VAPID_SUBJECT (ej. "mailto:jorgecamberos100@gmail.com").
//
// Cifrado Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implementado a mano
// con WebCrypto: nada de paquetes npm, para que el deploy no dependa de nada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const encoder = new TextEncoder()

export function b64urlEncode(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // HKDF-Expand con SHA-256 (RFC 5869). length <= 32 en nuestro uso.
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])))
  return t.slice(0, length)
}

/** JWT VAPID (ES256) firmado con la clave privada. Devuelve el token compacto. */
export async function vapidJwt(audience: string, subject: string, privateKeyB64: string, publicKeyB64: string): Promise<string> {
  const pub = b64urlDecode(publicKeyB64)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida (se espera punto sin comprimir de 65 bytes)')
  const x = b64urlEncode(pub.slice(1, 33))
  const y = b64urlEncode(pub.slice(33, 65))
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x, y, d: privateKeyB64 }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64urlEncode(
    encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })),
  )
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${payload}`)))
  // VAPID quiere la firma en crudo r||s (64 bytes). Deno ya la devuelve así;
  // los navegadores la devuelven en DER y hay que convertirla.
  const r = ecdsaSigToRaw(sig)
  return `${header}.${payload}.${b64urlEncode(r)}`
}

/**
 * Firma ECDSA a r||s (64 bytes). Si ya viene en crudo (Deno, 64 bytes) se
 * usa tal cual; si viene en DER (navegadores) se convierte.
 */
function ecdsaSigToRaw(sig: Uint8Array): Uint8Array {
  if (sig.length === 64) return sig
  if (sig.length < 8 || sig[0] !== 0x30) throw new Error('Firma ECDSA inesperada')
  let off = 2 // 0x30, len (forma corta; P-256 siempre < 128 bytes)
  if (sig[1] & 0x80) {
    const nLen = sig[1] & 0x7f
    off = 2 + nLen
  }
  if (sig[off] !== 0x02) throw new Error('Firma ECDSA inesperada')
  const rLen = sig[off + 1]
  const r = sig.slice(off + 2, off + 2 + rLen)
  off += 2 + rLen
  if (sig[off] !== 0x02) throw new Error('Firma ECDSA inesperada')
  const sLen = sig[off + 1]
  const s = sig.slice(off + 2, off + 2 + sLen)
  const out = new Uint8Array(64)
  out.set(r.slice(-32), 32 - Math.min(32, r.length))
  out.set(s.slice(-32), 64 - Math.min(32, s.length))
  return out
}

/** Cifra el payload para una suscripción (RFC 8291 aes128gcm). Devuelve {body, headers}. */
export async function encryptPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  plaintext: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  const clientPub = b64urlDecode(subscription.p256dh)
  const clientAuth = b64urlDecode(subscription.auth)
  if (clientPub.length !== 65 || clientAuth.length !== 16) throw new Error('Suscripción push inválida')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey))
  const clientKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(clientPub.slice(1, 33)), y: b64urlEncode(clientPub.slice(33, 65)) },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256))
  // RFC 8291 §4.3 (igual que la librería web-push): PRK = HMAC(auth, shared);
  // luego CEK/nonce = HKDF completo (extract con el salt aleatorio + expand).
  const prk = await hmacSha256(clientAuth, shared)
  const cekInfo = concat(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0]))
  const nonceInfo = concat(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0]))
  const cek = await hkdfWithSalt(salt, prk, cekInfo, 16)
  const nonce = await hkdfWithSalt(salt, prk, nonceInfo, 12)

  const plain = encoder.encode(plaintext)
  const padded = new Uint8Array(Math.ceil((plain.length + 1) / 16) * 16)
  padded.set(plain)
  padded[plain.length] = 2 // delimitador: el texto termina aquí
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, padded as BufferSource))

  const audience = new URL(subscription.endpoint).origin
  const jwt = await vapidJwt(audience, vapidSubject, vapidPrivateKey, vapidPublicKey)
  return {
    body: cipher,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Encryption: `salt=${b64urlEncode(salt)}`,
      'Crypto-Key': `dh=${b64urlEncode(serverPubRaw)}`,
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      TTL: '86400',
    },
  }
}

/** HKDF completo (extract con salt + expand con info) con SHA-256. */
async function hkdfWithSalt(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm)
  return hkdfExpand(prk, info, length)
}

function todayInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function nowHmInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  } catch {
    return '00:00'
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
  })
}

interface ReminderRow {
  id: string
  household_id: string
  title: string
  amount: number | null
  due_date: string
  due_time: string | null
  recurrence: string
  timezone: string
  last_notified_at: string | null
}

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  household_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  if (!serviceRoleKey || auth !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'No autorizado: esta función solo la llama el cron con la service_role key' }, 401)
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:finanzas-en-pareja@example.com'
  if (!vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en los secretos de Supabase (ver README)' }, 500)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey)
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const dryRun = body.dry_run === true

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, household_id, title, amount, due_date, due_time, recurrence, timezone, last_notified_at')
    .eq('is_done', false)
  if (error || !reminders) return jsonResponse({ error: error?.message ?? 'No se pudieron leer los recordatorios' }, 500)

  // ¿Cuáles deben sonar ahora? Por zona horaria del recordatorio: vencidos, o
  // de hoy a la hora indicada (09:00 por defecto). Una vez al día por recordatorio.
  const due: ReminderRow[] = []
  for (const r of reminders as ReminderRow[]) {
    const tz = r.timezone || 'America/Tijuana'
    const today = todayInTz(tz)
    if (r.due_date > today) continue
    // No repetir el aviso en menos de 20 h para el mismo recordatorio.
    if (r.last_notified_at && Date.now() - new Date(r.last_notified_at).getTime() < 20 * 3600_000) continue
    if (r.due_date === today) {
      const at = r.due_time ?? '09:00'
      if (nowHmInTz(tz) < at) continue
    }
    due.push(r)
  }

  if (dryRun) return jsonResponse({ ok: true, dry_run: true, due: due.map((d) => ({ id: d.id, title: d.title, due_date: d.due_date })) })

  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth, household_id')
  const byHousehold = new Map<string, SubRow[]>()
  for (const s of (subs ?? []) as SubRow[]) {
    const list = byHousehold.get(s.household_id) ?? []
    list.push(s)
    byHousehold.set(s.household_id, list)
  }

  let sent = 0
  let failed = 0
  const expired: string[] = []
  for (const r of due) {
    const targets = byHousehold.get(r.household_id) ?? []
    const amount = r.amount !== null ? ` — ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(r.amount)}` : ''
    const payload = JSON.stringify({
      title: `🔔 Recordatorio: ${r.title}`,
      body: `Hoy vence: ${r.title}${amount}. Toca para ver tus recordatorios.`,
      url: '/recordatorios',
      tag: `reminder-${r.id}-${r.due_date}`,
    })
    for (const sub of targets) {
      try {
        const { body: cipher, headers } = await encryptPush(sub, payload, vapidPublic, vapidPrivate, vapidSubject)
        const res = await fetch(sub.endpoint, { method: 'POST', headers, body: cipher as unknown as BodyInit, signal: AbortSignal.timeout(15_000) })
        if (res.status === 201 || res.status === 200) sent++
        else if (res.status === 404 || res.status === 410) {
          expired.push(sub.id)
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else failed++
      } catch {
        failed++
      }
    }
    if (targets.length > 0) {
      await supabase.from('reminders').update({ last_notified_at: new Date().toISOString() }).eq('id', r.id)
    }
  }

  return jsonResponse({ ok: true, due: due.length, sent, failed, expired: expired.length })
})
