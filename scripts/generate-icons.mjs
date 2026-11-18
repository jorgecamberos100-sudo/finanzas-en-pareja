// Genera los iconos binarios a partir de su base64 (archivos .b64).
// Los PNG no se pueden subir al repo con las herramientas disponibles
// (el conector de GitHub solo acepta texto UTF-8), así que se guardan
// como base64 y este script los regenera en `postinstall` (npm ci /
// npm install, también en Vercel).
//
// Además de decodificar, este script:
//   1. Recolorea el fondo azul marino #0F1530 de los PNG al esmeralda
//      oscuro de la marca (#07130C), con un flood-fill desde las orillas
//      (solo toca el fondo conectado al borde; a PIBBI no lo toca).
//   2. Genera favicon.ico (contenedor ICO con el PNG de 192 adentro).
//   3. Genera apple-touch-icon.png (copia del de 192 para iOS).
//   4. Genera icon-maskable-512.png con zona segura (PIBBI al 76%).
// Todo en Node puro (zlib), sin dependencias nuevas. Si el PNG no es
// decodificable, se escribe el original tal cual: el build nunca falla.
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirPublic = join(raiz, 'public')
const dirIconos = join(dirPublic, 'icons')

const FONDO_NUEVO = [7, 19, 12, 255] // #07130C, esmeralda casi negro (tema noche)

// ---------- CRC32 (para los chunks PNG) ----------
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---------- Decodificar PNG (8 bits, RGB/RGBA, sin entrelazado) ----------
function decodificarPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es PNG')
  const ancho = buf.readUInt32BE(16)
  const alto = buf.readUInt32BE(20)
  const profundidad = buf[24]
  const tipoColor = buf[25]
  const entrelazado = buf[28]
  if (profundidad !== 8 || (tipoColor !== 2 && tipoColor !== 6) || entrelazado !== 0) {
    throw new Error('PNG no soportado para recolorear')
  }
  const canales = tipoColor === 6 ? 4 : 3
  const paso = ancho * canales
  const trozos = []
  let pos = 8
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos)
    const tipo = buf.toString('ascii', pos + 4, pos + 8)
    if (tipo === 'IDAT') trozos.push(buf.subarray(pos + 8, pos + 8 + largo))
    pos += 12 + largo
  }
  const crudo = inflateSync(Buffer.concat(trozos))
  const salida = Buffer.alloc(alto * paso)
  let anterior = Buffer.alloc(paso)
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (paso + 1)]
    const linea = Buffer.from(crudo.subarray(y * (paso + 1) + 1, (y + 1) * (paso + 1)))
    for (let x = 0; x < paso; x++) {
      const a = x >= canales ? linea[x - canales] : 0
      const b = anterior[x]
      const c = x >= canales ? anterior[x - canales] : 0
      let v = linea[x]
      if (filtro === 1) v = (v + a) & 255
      else if (filtro === 2) v = (v + b) & 255
      else if (filtro === 3) v = (v + ((a + b) >> 1)) & 255
      else if (filtro === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        v = (v + pr) & 255
      }
      linea[x] = v
    }
    linea.copy(salida, y * paso)
    anterior = linea
  }
  // Normalizar a RGBA
  const rgba = Buffer.alloc(ancho * alto * 4)
  for (let i = 0; i < ancho * alto; i++) {
    rgba[i * 4] = salida[i * canales]
    rgba[i * 4 + 1] = salida[i * canales + 1]
    rgba[i * 4 + 2] = salida[i * canales + 2]
    rgba[i * 4 + 3] = canales === 4 ? salida[i * canales + 3] : 255
  }
  return { ancho, alto, rgba }
}

// ---------- Codificar PNG (filtro 0 en cada fila) ----------
function chunk(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}
function codificarPNG(ancho, alto, rgba) {
  const paso = ancho * 4
  const crudo = Buffer.alloc(alto * (paso + 1))
  for (let y = 0; y < alto; y++) {
    crudo[y * (paso + 1)] = 0
    rgba.copy(crudo, y * (paso + 1) + 1, y * paso, (y + 1) * paso)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- Recolorear el fondo navy conectado al borde ----------
function esFondoNavy(r, g, b) {
  return Math.abs(r - 15) <= 30 && Math.abs(g - 21) <= 30 && Math.abs(b - 48) <= 34
}
function recolorearFondo(ancho, alto, rgba) {
  const n = ancho * alto
  const visitado = new Uint8Array(n)
  const cola = new Int32Array(n)
  let cabeza = 0, fin = 0
  const empujar = (i) => {
    if (visitado[i]) return
    const o = i * 4
    if (esFondoNavy(rgba[o], rgba[o + 1], rgba[o + 2])) {
      visitado[i] = 1
      cola[fin++] = i
    }
  }
  for (let x = 0; x < ancho; x++) { empujar(x); empujar((alto - 1) * ancho + x) }
  for (let y = 0; y < alto; y++) { empujar(y * ancho); empujar(y * ancho + ancho - 1) }
  while (cabeza < fin) {
    const i = cola[cabeza++]
    const x = i % ancho, y = (i / ancho) | 0
    if (x > 0) empujar(i - 1)
    if (x < ancho - 1) empujar(i + 1)
    if (y > 0) empujar(i - ancho)
    if (y < alto - 1) empujar(i + ancho)
  }
  for (let i = 0; i < n; i++) {
    if (visitado[i]) {
      const o = i * 4
      rgba[o] = FONDO_NUEVO[0]; rgba[o + 1] = FONDO_NUEVO[1]
      rgba[o + 2] = FONDO_NUEVO[2]; rgba[o + 3] = FONDO_NUEVO[3]
    }
  }
  return rgba
}

// ---------- Maskable: contenido al 76% centrado sobre fondo esmeralda ----------
function remuestrearCaja(src, sw, sh, tw, th) {
  const out = Buffer.alloc(tw * th * 4)
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * sh) / th), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * sh) / th))
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * sw) / tw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * sw) / tw))
      let r = 0, g = 0, b = 0, a = 0, cuenta = 0
      for (let sy = sy0; sy < sy1 && sy < sh; sy++) {
        for (let sx = sx0; sx < sx1 && sx < sw; sx++) {
          const o = (sy * sw + sx) * 4
          r += src[o]; g += src[o + 1]; b += src[o + 2]; a += src[o + 3]; cuenta++
        }
      }
      const o = (y * tw + x) * 4
      out[o] = Math.round(r / cuenta); out[o + 1] = Math.round(g / cuenta)
      out[o + 2] = Math.round(b / cuenta); out[o + 3] = Math.round(a / cuenta)
    }
  }
  return out
}
function hacerMaskable(rgba512) {
  const S = 512, contenido = Math.round(S * 0.76), off = Math.floor((S - contenido) / 2)
  const pequeno = remuestrearCaja(rgba512, S, S, contenido, contenido)
  const lienzo = Buffer.alloc(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    lienzo[i * 4] = FONDO_NUEVO[0]; lienzo[i * 4 + 1] = FONDO_NUEVO[1]
    lienzo[i * 4 + 2] = FONDO_NUEVO[2]; lienzo[i * 4 + 3] = 255
  }
  for (let y = 0; y < contenido; y++) {
    pequeno.copy(lienzo, ((y + off) * S + off) * 4, y * contenido * 4, (y + 1) * contenido * 4)
  }
  return codificarPNG(S, S, lienzo)
}

// ---------- ICO con un PNG adentro (válido en navegadores modernos) ----------
function hacerICO(png, ancho, alto) {
  const cabecera = Buffer.alloc(6)
  cabecera.writeUInt16LE(0, 0); cabecera.writeUInt16LE(1, 2); cabecera.writeUInt16LE(1, 4)
  const entrada = Buffer.alloc(16)
  entrada[0] = ancho >= 256 ? 0 : ancho
  entrada[1] = alto >= 256 ? 0 : alto
  entrada[2] = 0; entrada[3] = 0
  entrada.writeUInt16LE(1, 4)      // planos
  entrada.writeUInt16LE(32, 6)     // bits por píxel
  entrada.writeUInt32LE(png.length, 8)
  entrada.writeUInt32LE(22, 12)    // offset de los datos
  return Buffer.concat([cabecera, entrada, png])
}

// ---------- Generación ----------
let png192 = null
for (const tam of [192, 512]) {
  const b64 = readFileSync(join(dirIconos, `icon-${tam}.png.b64`), 'utf8').replace(/\s/g, '')
  const original = Buffer.from(b64, 'base64')
  let final = original
  try {
    const { ancho, alto, rgba } = decodificarPNG(original)
    recolorearFondo(ancho, alto, rgba)
    final = codificarPNG(ancho, alto, rgba)
    if (tam === 512) {
      writeFileSync(join(dirIconos, 'icon-maskable-512.png'), hacerMaskable(rgba))
      console.log('icon-maskable-512.png generado (zona segura 76%)')
    }
    console.log(`icon-${tam}.png generado (fondo esmeralda)`)
  } catch (e) {
    console.log(`icon-${tam}.png generado (original, sin recolorear: ${e.message})`)
  }
  writeFileSync(join(dirIconos, `icon-${tam}.png`), final)
  if (tam === 192) png192 = final
}
if (png192) {
  writeFileSync(join(dirPublic, 'favicon.ico'), hacerICO(png192, 192, 192))
  console.log('favicon.ico generado')
  writeFileSync(join(dirPublic, 'apple-touch-icon.png'), png192)
  console.log('apple-touch-icon.png generado')
}