// Pruebas del tema esmeralda día/noche (nov 2026): SOLO la paleta
// "Emerald Finance", en dos versiones: noche = esmeralda oscura (fondo
// verde casi negro) y día = esmeralda clara (fondo blanco verdoso).
// Los temas viejos (noche azul marino, día papel crema) se eliminaron.
// Sin rosa en la interfaz: el rosa es solo de PIBBI; la señal de
// dinero es la menta brillante (relleno de botones) y la esmeralda es
// marca/foco/positivo, y el foco es menta en noche y esmeralda en día.
// Estas comprobaciones son a nivel de fuente y de lógica pura: si
// alguien reintroduce el rosa, el dorado o un tema viejo en la
// interfaz, o rompe el interruptor o la migración, el test falla antes
// de publicar.
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

// 1. Lógica pura del tema (con migración del valor viejo 'esmeralda').
check('sin guardar -> noche', temaDesdeStorage(null), 'noche')
check("'dia' -> dia", temaDesdeStorage('dia'), 'dia')
check("'noche' -> noche", temaDesdeStorage('noche'), 'noche')
check("'esmeralda' (viejo) -> dia", temaDesdeStorage('esmeralda'), 'dia')
check('valor raro -> noche', temaDesdeStorage('rosa'), 'noche')
check('vacío -> noche', temaDesdeStorage(''), 'noche')
check('ciclo: noche -> día', siguienteTema('noche'), 'dia')
check('ciclo: día -> noche', siguienteTema('dia'), 'noche')
check('meta noche', META_THEME_COLOR['noche'], '#07130C')
check('meta día', META_THEME_COLOR['dia'], '#EDF5EF')
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

// 3. Variables CSS en index.css: SOLO dos temas esmeralda.
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
check('css tiene bloque noche', css.includes(":root[data-theme='noche']"))
check('css tiene bloque día', css.includes(":root[data-theme='dia']"))
check('css NO tiene bloque esmeralda', !css.includes(":root[data-theme='esmeralda']"))
check('noche: fondo verde casi negro #07130C', css.includes('--noche-rgb: 7 19 12'))
check('noche: tarjeta #122B1E', css.includes('--tarjeta-rgb: 18 43 30'))
check('noche: borde #2A4A38', css.includes('--borde-rgb: 42 74 56'))
check('noche: texto #E7F2EB', css.includes('--crema-rgb: 231 242 235'))
check('noche: foco menta #20B981', css.includes('--foco-rgb: 32 185 129'))
check('día: fondo #EDF5EF', css.includes('--noche-rgb: 237 245 239'))
check('día: tarjeta #FFFFFF', css.includes('--tarjeta-rgb: 255 255 255'))
check('día: texto #0C2B1C', css.includes('--crema-rgb: 12 43 28'))
check('día: marca #137A55', css.includes('--verde-rgb: 19 122 85'))
check('día: botón menta #20B981', css.includes('--dorado-rgb: 32 185 129'))
check('día: acento-texto #0B5C3D', css.includes('--doradotexto-rgb: 11 92 61'))
check('día: alerta coral #C2410C', css.includes('--rojosuave-rgb: 194 65 12'))
check('día: foco esmeralda', css.includes('--foco-rgb: 19 122 85'))
// Nada de las paletas viejas (noche azul marino, día papel crema, dorado).
check('sin fondo azul marino viejo', !css.includes('--noche-rgb: 10 15 30'))
check('sin tarjeta azul marino vieja', !css.includes('--tarjeta-rgb: 35 46 82'))
check('sin fondo papel crema viejo', !css.includes('--noche-rgb: 247 241 227'))
check('sin texto azul viejo', !css.includes('--crema-rgb: 27 35 64'))
check('sin dorado #F5C542 en el css', !css.includes('#F5C542') && !css.includes('245 197 66'))
check('sin fondo crema viejo', !css.includes('#F7F1E3'))

// 3b. Contrastes de AMBOS temas (WCAG AA, texto normal >= 4.5:1).
// Noche: la esmeralda #137A55 es demasiado oscura para texto sobre
// fondo oscuro (3.6:1), así que los acentos usan variantes claras
// (menta #7DDBC3, verde #4ADE80, acento #6EE7B7, coral #FF8A80).
// Día: la menta brillante #20B981 es demasiado clara para texto
// (2.5:1) y el coral #E4572E también (3.7:1); los tokens de texto
// usan sus variantes oscuras y el #20B981 queda solo como relleno.
type Rgb = [number, number, number]
function lin(c: number): number { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function lum(rgb: Rgb): number { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]) }
function ratio(a: Rgb, b: Rgb): number { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
function tokenDe(tema: 'noche' | 'dia', nombre: string): Rgb {
  const bloque = css.split(`:root[data-theme='${tema}']`)[1].split('}')[0]
  const m = bloque.match(new RegExp(`--${nombre}-rgb:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`))
  if (!m) throw new Error(`falta token ${tema} ${nombre}`)
  return [+m[1], +m[2], +m[3]]
}
function checkRatio(nombre: string, valor: number, minimo: number) {
  check(nombre, valor >= minimo, true)
}
function ratiosDe(tema: 'noche' | 'dia') {
  const t = {
    fondo: tokenDe(tema, 'noche'), tarjeta: tokenDe(tema, 'tarjeta'),
    texto: tokenDe(tema, 'crema'), humo: tokenDe(tema, 'humo'),
    menta: tokenDe(tema, 'menta'), verde: tokenDe(tema, 'verde'),
    dorado: tokenDe(tema, 'dorado'), doradotexto: tokenDe(tema, 'doradotexto'),
    rojosuave: tokenDe(tema, 'rojosuave'), tinta: tokenDe(tema, 'tinta'),
    foco: tokenDe(tema, 'foco'),
  }
  checkRatio(`${tema}: texto/fondo AA`, ratio(t.texto, t.fondo), 4.5)
  checkRatio(`${tema}: texto/tarjeta AA`, ratio(t.texto, t.tarjeta), 4.5)
  checkRatio(`${tema}: secundario/fondo AA`, ratio(t.humo, t.fondo), 4.5)
  checkRatio(`${tema}: secundario/tarjeta AA`, ratio(t.humo, t.tarjeta), 4.5)
  checkRatio(`${tema}: marca/tarjeta AA`, ratio(t.verde, t.tarjeta), 4.5)
  checkRatio(`${tema}: botón menta/tinta AA`, ratio(t.dorado, t.tinta), 4.5)
  checkRatio(`${tema}: acento-texto/tarjeta AA`, ratio(t.doradotexto, t.tarjeta), 4.5)
  checkRatio(`${tema}: alerta coral/tarjeta AA`, ratio(t.rojosuave, t.tarjeta), 4.5)
  checkRatio(`${tema}: menta/tarjeta AA`, ratio(t.menta, t.tarjeta), 4.5)
  checkRatio(`${tema}: foco/fondo AA`, ratio(t.foco, t.fondo), 4.5)
}
ratiosDe('noche')
ratiosDe('dia')
check('PIBBI: su variable rosaclaro sigue', css.includes('--rosaclaro: #F9A8B8'))
check('foco usa el token foco', css.includes('ring-foco'))
check('selección sin rosa', css.includes('bg-dorado') && !css.includes('bg-rosafuerte'))

// 3c. Sin tintes hex hardcodeados en la interfaz: los avisos usan
// tokens (bg-dorado/15, bg-rojosuave/15, bg-verde/15, bg-menta/15,
// bg-doradotenue) y siguen al tema. Solo Mascota.tsx conserva hex
// (las prendas doradas de PIBBI, parte de la mascota).
function* walkHex(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === 'mascota') continue
      yield* walkHex(p)
    } else if (/\.(tsx|ts)$/.test(e) && e !== 'Mascota.tsx' && e !== 'mascota-images.ts') yield p
  }
}
const hexRe = /bg-\[#[0-9A-Fa-f]{6}[0-9A-Fa-f]{0,2}\]/
let hexHits: string[] = []
for (const f of walkHex(join(root, 'src'))) {
  if (hexRe.test(readFileSync(f, 'utf8'))) hexHits.push(f)
}
check('ningún tinte hex hardcodeado en la interfaz', hexHits, [])

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

// 5. Interruptor: dos opciones (sol/luna), persiste y está visible.
const toggle = readFileSync(join(root, 'src/components/ThemeToggle.tsx'), 'utf8')
check('ThemeToggle existe y cambia el tema', toggle.includes('aplicarTema') && toggle.includes('leerTema'))
check('ThemeToggle alterna dos temas', toggle.includes('siguienteTema'))
check('ThemeToggle tiene las dos etiquetas', toggle.includes('Cambiar a tema día') && toggle.includes('Cambiar a tema noche'))
check('ThemeToggle ya no tiene esmeralda', !toggle.includes('Cambiar a tema esmeralda'))
check('ThemeToggle usa sol y luna (SVG, no emoji)', toggle.includes('<svg') && !toggle.includes('☀') && !toggle.includes('🌙') && !toggle.includes('🍃') && !toggle.includes('M11 20A7 7'))
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

// 7. PIBBI más pequeño y con el cuerpo entero: el marco usa
// object-contain (no recorta orejas ni patitas) y los tamaños bajaron.
const mascota = readFileSync(join(root, 'src/components/Mascota.tsx'), 'utf8')
check('Mascota usa object-contain (cuerpo entero)', mascota.includes('object-contain'))
check('Mascota: el avatar circular sigue con object-cover', mascota.includes('object-cover'))
check('Mascota: tamaño por defecto más pequeño', mascota.includes("className = 'h-24 w-24'"))
const dash = readFileSync(join(root, 'src/pages/Dashboard.tsx'), 'utf8')
check('Dashboard: PIBBI h-16', dash.includes('<Mascota className="h-16 w-16'))

console.log(`\ntest-tema: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
