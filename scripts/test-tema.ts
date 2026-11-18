// Pruebas del tema noche/día/esmeralda (nov 2026): tres paletas, un interruptor.
// Noche = paleta A · Marino afinado (por defecto); día = paleta C ·
// Papel crema; esmeralda = propuesta "Emerald Finance" (verde esmeralda
// #137A55 + menta #20B981, fondo blanco verdoso). Sin rosa en la
// interfaz: el rosa es solo de PIBBI; el acento principal es el dorado
// (dinero) en noche/día y la menta brillante en esmeralda, y el foco es
// dorado en noche, tinta en día y esmeralda en el tema esmeralda. Estas
// comprobaciones son a nivel de fuente y de lógica pura: si alguien
// reintroduce el rosa en la interfaz o rompe el interruptor, el test
// falla antes de publicar.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { temaDesdeStorage, siguienteTema, META_THEME_COLOR, TEMA_KEY } from '../src/lib/tema.ts'

// Se corre con npm desde la raíz del repo (igual que los demás test:*).
const root = process.cwd()

let pass = 0
let fail = 0
function check(name: string, got: unknown, want?: unknown) {
  const ok = want === undefined ? got === true : JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
}

// 1. Lógica pura del tema.
check('sin guardar -> noche', temaDesdeStorage(null), 'noche')
check("'dia' -> dia", temaDesdeStorage('dia'), 'dia')
check("'esmeralda' -> esmeralda", temaDesdeStorage('esmeralda'), 'esmeralda')
check('valor raro -> noche', temaDesdeStorage('rosa'), 'noche')
check('vacío -> noche', temaDesdeStorage(''), 'noche')
check('ciclo: noche -> día', siguienteTema('noche'), 'dia')
check('ciclo: día -> esmeralda', siguienteTema('dia'), 'esmeralda')
check('ciclo: esmeralda -> noche', siguienteTema('esmeralda'), 'noche')
check('meta noche', META_THEME_COLOR['noche'], '#0A0F1E')
check('meta día', META_THEME_COLOR['dia'], '#F7F1E3')
check('meta esmeralda', META_THEME_COLOR['esmeralda'], '#EDF5EF')
check('aplicarTema actualiza el meta theme-color', readFileSync(join(root, 'src/lib/tema.ts'), 'utf8').includes('meta[name="theme-color"]'))
check('clave de guardado', TEMA_KEY, 'finanzas-tema')

// 2. Tokens en tailwind.config.js: sin rosa, con los tokens nuevos.
const tw = readFileSync(join(root, 'tailwind.config.js'), 'utf8')
check('tailwind sin rosafuerte', !tw.includes('rosafuerte'))
check('tailwind sin rosaclaro', !tw.includes('rosaclaro'))
check('tailwind sin rosatenue', !tw.includes('rosatenue'))
check('tailwind tiene foco', tw.includes("foco: 'rgb(var(--foco-rgb)"))
check('tailwind tiene doradotexto', tw.includes("doradotexto: 'rgb(var(--doradotexto-rgb)"))
check('tailwind tiene doradotenue', tw.includes("doradotenue: 'rgb(var(--dorado-rgb) / 0.1)'"))
check('tailwind tiene tinta', tw.includes("tinta: 'rgb(var(--tinta-rgb)"))
check('tailwind mapea noche a variable', tw.includes("noche: 'rgb(var(--noche-rgb)"))

// 3. Variables CSS en index.css: noche (A) y día (C) exactas.
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
check('css tiene bloque día', css.includes(":root[data-theme='dia']"))
check('noche: fondo #0A0F1E', css.includes('--noche-rgb: 10 15 30'))
check('noche: tarjeta #232E52', css.includes('--tarjeta-rgb: 35 46 82'))
check('noche: borde #42548A', css.includes('--borde-rgb: 66 84 138'))
check('noche: foco dorado', css.includes('--foco-rgb: 245 197 66'))
check('día: fondo #F7F1E3', css.includes('--noche-rgb: 247 241 227'))
check('día: tarjeta #FFFFFF', css.includes('--tarjeta-rgb: 255 255 255'))
check('día: texto #1B2340', css.includes('--crema-rgb: 27 35 64'))
check('día: dorado-texto #7A5F08', css.includes('--doradotexto-rgb: 122 95 8'))
check('día: foco tinta', css.includes('--foco-rgb: 27 35 64'))
check('css tiene bloque esmeralda', css.includes(":root[data-theme='esmeralda']"))
check('esmeralda: fondo #EDF5EF', css.includes('--noche-rgb: 237 245 239'))
check('esmeralda: tarjeta #FFFFFF', css.includes('--tarjeta-rgb: 255 255 255'))
check('esmeralda: texto #0C2B1C', css.includes('--crema-rgb: 12 43 28'))
check('esmeralda: marca #137A55', css.includes('--verde-rgb: 19 122 85'))
check('esmeralda: botón menta #20B981', css.includes('--dorado-rgb: 32 185 129'))
check('esmeralda: acento-texto #0B5C3D', css.includes('--doradotexto-rgb: 11 92 61'))
check('esmeralda: alerta coral #C2410C', css.includes('--rojosuave-rgb: 194 65 12'))
check('esmeralda: foco esmeralda', css.includes('--foco-rgb: 19 122 85'))

// 3b. Contrastes del tema esmeralda (WCAG AA, texto normal >= 4.5:1).
// La menta brillante #20B981 es demasiado clara para texto (2.5:1) y
// el coral #E4572E también (3.7:1); por eso los tokens de texto usan
// sus variantes oscuras y el #20B981 queda solo como relleno de botón.
type Rgb = [number, number, number]
function lin(c: number): number { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function lum(rgb: Rgb): number { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]) }
function ratio(a: Rgb, b: Rgb): number { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
function tokenEsmeralda(nombre: string): Rgb {
  const bloque = css.split(":root[data-theme='esmeralda']")[1].split('}')[0]
  const m = bloque.match(new RegExp(`--${nombre}-rgb:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`))
  if (!m) throw new Error(`falta token esmeralda ${nombre}`)
  return [+m[1], +m[2], +m[3]]
}
function checkRatio(nombre: string, valor: number, minimo: number) {
  check(nombre, valor >= minimo, true)
}
const esm = {
  fondo: tokenEsmeralda('noche'), tarjeta: tokenEsmeralda('tarjeta'),
  texto: tokenEsmeralda('crema'), humo: tokenEsmeralda('humo'),
  menta: tokenEsmeralda('menta'), verde: tokenEsmeralda('verde'),
  dorado: tokenEsmeralda('dorado'), doradotexto: tokenEsmeralda('doradotexto'),
  rojosuave: tokenEsmeralda('rojosuave'), tinta: tokenEsmeralda('tinta'),
  foco: tokenEsmeralda('foco'),
}
checkRatio('esmeralda: texto/fondo AA', ratio(esm.texto, esm.fondo), 4.5)
checkRatio('esmeralda: secundario/fondo AA', ratio(esm.humo, esm.fondo), 4.5)
checkRatio('esmeralda: marca/tarjeta AA', ratio(esm.verde, esm.tarjeta), 4.5)
checkRatio('esmeralda: botón menta/tinta AA', ratio(esm.dorado, esm.tinta), 4.5)
checkRatio('esmeralda: acento-texto/tarjeta AA', ratio(esm.doradotexto, esm.tarjeta), 4.5)
checkRatio('esmeralda: alerta coral/tarjeta AA', ratio(esm.rojosuave, esm.tarjeta), 4.5)
checkRatio('esmeralda: menta oscura/tarjeta AA', ratio(esm.menta, esm.tarjeta), 4.5)
checkRatio('esmeralda: foco/fondo AA', ratio(esm.foco, esm.fondo), 4.5)
check('PIBBI: su variable rosaclaro sigue', css.includes('--rosaclaro: #F9A8B8'))
check('foco usa el token foco', css.includes('ring-foco'))
check('selección sin rosa', css.includes('bg-dorado') && !css.includes('bg-rosafuerte'))

// 4. Sin rosa en la interfaz: ningún archivo de la app (salvo los de
// PIBBI) usa tokens ni literales rosas.
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === 'mascota') continue
      yield* walk(p)
    } else if (/\.(tsx|ts|css)$/.test(e)) yield p
  }
}
const pibbiFiles = new Set(['Mascota.tsx', 'mascota-images.ts'])
const pinkRe = /(rosafuerte|rosaclaro|rosatenue|#F4728F|#F9A8B8|text-noche|bg-rosafuerte)/
let pinkHits: string[] = []
for (const f of walk(join(root, 'src'))) {
  const base = f.split('/').pop()!
  if (pibbiFiles.has(base)) continue
  const body = readFileSync(f, 'utf8')
  // Las variables --rosaclaro/--rosaparado/--sombra de index.css son
  // de PIBBI (párpados y sombra del cerdito), no de la interfaz.
  const lines = body.split('\n').filter((l) => !/--rosaclaro|--rosaparado|--sombra/.test(l))
  if (pinkRe.test(lines.join('\n'))) pinkHits.push(f)
}
check('ningún rosa en la interfaz', pinkHits, [])

// 5. Interruptor: existe, persiste y está visible en la app.
const toggle = readFileSync(join(root, 'src/components/ThemeToggle.tsx'), 'utf8')
check('ThemeToggle existe y cambia el tema', toggle.includes('aplicarTema') && toggle.includes('leerTema'))
check('ThemeToggle recorre los tres temas', toggle.includes('siguienteTema'))
check('ThemeToggle tiene etiquetas accesibles', toggle.includes('Cambiar a tema día') && toggle.includes('Cambiar a tema noche') && toggle.includes('Cambiar a tema esmeralda'))
check('ThemeToggle usa sol, luna y hoja (SVG, no emoji)', toggle.includes('<svg') && !toggle.includes('☀') && !toggle.includes('🌙') && !toggle.includes('🍃'))
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8')
check('main.tsx aplica el tema antes del render', main.includes('aplicarTema(leerTema())'))
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
check('App.tsx muestra el interruptor en la barra', app.includes('<ThemeToggle'))
const onb = readFileSync(join(root, 'src/pages/Onboarding.tsx'), 'utf8')
check('Onboarding muestra el interruptor en el encabezado', onb.includes('<ThemeToggle'))

// 6. Usos de PIBBI de la propuesta "Emerald Finance": gasto excesivo =
// PIBBI preocupado (pensativo), sin juzgar, en Presupuesto.
const pres = readFileSync(join(root, 'src/pages/Presupuesto.tsx'), 'utf8')
check('Presupuesto: PIBBI pensativo cuando un sobre se pasa', pres.includes('pose="pensativo"') && pres.includes('Te pasaste un poco'))
check('Presupuesto: el mensaje no juzga', pres.includes('sin drama'))

console.log(`\ntest-tema: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
