// Pruebas del tema noche/día (nov 2026): dos paletas, un interruptor.
// Noche = paleta A · Marino afinado (por defecto); día = paleta C ·
// Papel crema. Sin rosa en la interfaz: el rosa es solo de PIBBI;
// el acento principal es el dorado (dinero) y el foco es dorado en
// noche y tinta en día. Estas comprobaciones son a nivel de fuente y
// de lógica pura: si alguien reintroduce el rosa en la interfaz o
// rompe el interruptor, el test falla antes de publicar.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { temaDesdeStorage, META_THEME_COLOR, TEMA_KEY } from '../src/lib/tema.ts'

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
check('valor raro -> noche', temaDesdeStorage('rosa'), 'noche')
check('vacío -> noche', temaDesdeStorage(''), 'noche')
check('meta noche', META_THEME_COLOR['noche'], '#0A0F1E')
check('meta día', META_THEME_COLOR['dia'], '#F7F1E3')
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
check('ThemeToggle tiene etiquetas accesibles', toggle.includes('Cambiar a modo día') && toggle.includes('Cambiar a modo noche'))
check('ThemeToggle usa sol y luna (SVG, no emoji)', toggle.includes('<svg') && !toggle.includes('☀') && !toggle.includes('🌙'))
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8')
check('main.tsx aplica el tema antes del render', main.includes('aplicarTema(leerTema())'))
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
check('App.tsx muestra el interruptor en la barra', app.includes('<ThemeToggle'))
const onb = readFileSync(join(root, 'src/pages/Onboarding.tsx'), 'utf8')
check('Onboarding muestra el interruptor en el encabezado', onb.includes('<ThemeToggle'))

console.log(`\ntest-tema: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
