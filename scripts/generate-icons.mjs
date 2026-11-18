// Genera public/icons/icon-192.png e icon-512.png a partir de su base64
// (archivos .b64). Los PNG no se pueden subir al repo con las herramientas
// disponibles (el conector de GitHub solo acepta archivos de texto UTF-8),
// así que se guardan como texto base64 y este script los regenera en
// `postinstall` (lo corre `npm ci` / `npm install`, también en Vercel).
// Los PNG son la imagen de PIBBI sobre fondo azul marino #0F1530.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
for (const size of [192, 512]) {
  const b64 = readFileSync(join(dir, `icon-${size}.png.b64`), 'utf8').replace(/\s/g, '')
  writeFileSync(join(dir, `icon-${size}.png`), Buffer.from(b64, 'base64'))
  console.log(`icon-${size}.png generado`)
}
