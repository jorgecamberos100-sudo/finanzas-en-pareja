// Prueba de ida y vuelta del cifrado Web Push (RFC 8291 aes128gcm + RFC 8188).
// Importa encryptPush tal cual está en la Edge Function (quitando el import de
// esm.sh y el handler Deno.serve) y lo descifra de forma independiente con la
// clave privada del cliente, como lo haría el servicio de push (FCM/Mozilla).
// Así se comprueba que el cifrado es válido sin depender de un teléfono real.
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let pass = 0
let fail = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}\n    esperado: ${e}\n    real:     ${a}`)
  }
}

const enc = new TextEncoder()
const dec = new TextDecoder()
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s) {
  return new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}
async function hkdfExpand(prk, info, len) {
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len)
}

// --- cargar encryptPush desde la Edge Function ---
const src = readFileSync(new URL('../supabase/functions/reminders-push/index.ts', import.meta.url), 'utf8')
const noImport = src.replace(/^import \{ createClient \}.*$/m, '')
const cutAt = noImport.indexOf('Deno.serve(')
const libOnly = cutAt === -1 ? noImport : noImport.slice(0, cutAt)
const tmpFile = join(tmpdir(), `reminders-push-lib-${process.pid}.ts`)
writeFileSync(tmpFile, libOnly)
const { encryptPush } = await import(pathToFileURL(tmpFile).href)

// --- claves del cliente (suscripción push) y VAPID del servidor ---
async function genEcdh() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { pair, pubRaw, privB64: privJwk.d }
}
async function genVapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { pubRaw, privB64: privJwk.d }
}

const client = await genEcdh()
const auth = crypto.getRandomValues(new Uint8Array(16))
const vapid = await genVapid()
const plaintext = JSON.stringify({ title: 'Renta', body: 'Pagar $1,500 de renta mañana' })

const { body, headers } = await encryptPush(
  { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh: b64url(client.pubRaw), auth: b64url(auth) },
  plaintext,
  b64url(vapid.pubRaw),
  vapid.privB64,
  'mailto:jorgecamberos100@gmail.com',
)

// --- cabeceras ---
check('header Content-Encoding aes128gcm', headers['Content-Encoding'], 'aes128gcm')
check('sin header Encryption obsoleto', 'Encryption' in headers, false)
check('sin header Crypto-Key obsoleto', 'Crypto-Key' in headers, false)
check('header Authorization es VAPID', String(headers.Authorization).startsWith('vapid t='), true)
check('header TTL', headers.TTL, '86400')

// --- descifrado independiente (RFC 8291 + RFC 8188) ---
const salt = body.slice(0, 16)
const rs = (body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19]
const idlen = body[20]
const serverPub = body.slice(21, 21 + idlen)
const cipher = body.slice(21 + idlen)
check('record size 4096', rs, 4096)
check('idlen 65 (clave pública sin comprimir)', idlen, 65)
check('cuerpo = 86 bytes de cabecera + cifrado', body.length, 86 + cipher.length)

const serverKey = await crypto.subtle.importKey('raw', serverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, client.pair.privateKey, 256))
const prkKey = await hmac(auth, shared)
const ikm = await hkdfExpand(prkKey, concat(enc.encode('WebPush: info\0'), client.pubRaw, serverPub), 32)
const prk = await hmac(salt, ikm)
const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)
const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12)
const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt'])
const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, cipher))
// Quitar el relleno de ceros y el delimitador 0x02 del final.
let end = plain.length
while (end > 0 && plain[end - 1] === 0) end--
check('delimitador final 0x02', plain[end - 1], 2)
check('payload descifrado íntegro', dec.decode(plain.slice(0, end - 1)), plaintext)

console.log(`\ntest-push: ${pass} pasaron, ${fail} fallaron`)
process.exit(fail ? 1 : 0)
