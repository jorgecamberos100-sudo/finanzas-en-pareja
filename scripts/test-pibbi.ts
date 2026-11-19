// Pruebas de PIBBI: accesorios válidos, poses de las reacciones y modo individual.
// Lógica pura (sin Supabase ni DOM): la personalización se guarda por usuario
// y el hogar de 1 persona reparte 100% (quien paga lo absorbe todo).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PIBBI_ACCESSORIES, isPibbiAccessory } from '../src/lib/pibbi-accessories.ts'
import { computeMutualBalance, splitPctFor } from '../src/lib/split.ts'
import {
  MASCOTA, MASCOTA_AHORRANDO, MASCOTA_CELEBRANDO,
} from '../src/lib/mascota-images.ts'
import { MASCOTA_SALUDANDO } from '../src/lib/mascota/saludando.ts'
import { MASCOTA_PENSATIVO } from '../src/lib/mascota/pensativo.ts'
import { MASCOTA_CONTAR } from '../src/lib/mascota/contar.ts'
import { MASCOTA_PROGRESO } from '../src/lib/mascota/progreso.ts'
import { MASCOTA_PERFIL_LAPIZ } from '../src/lib/mascota/perfil-lapiz.ts'
import { MASCOTA_CALCULADORA } from '../src/lib/mascota/calculadora.ts'
import { MASCOTA_AVATAR_CIRCULAR } from '../src/lib/mascota/avatar-circular.ts'
import { PIBBI_POSES, REACTION_POSES, PAGE_PIBBI_POSES, type PibbiPage } from '../src/lib/pibbi-poses.ts'
import {
  DEFAULT_MASCOT_NAME, HEADER_SIZE_CLASS, MASCOT_NAME_SUGGESTIONS,
  celebracionPibbi, isPibbiSize, isPibbiVibe, normalizarNombreMascota,
  saludoPibbi, textoReaccion,
} from '../src/lib/pibbi-identidad.ts'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
}

// 1. Accesorios: 5 opciones, ids únicos, todos válidos, y nada raro pasa el filtro.
check('5 accesorios', PIBBI_ACCESSORIES.length, 5)
check('ids únicos', new Set(PIBBI_ACCESSORIES.map((a) => a.id)).size, 5)
check('incluye lentes', PIBBI_ACCESSORIES.some((a) => a.id === 'lentes'), true)
check('incluye gorra', PIBBI_ACCESSORIES.some((a) => a.id === 'gorra'), true)
check('incluye moño', PIBBI_ACCESSORIES.some((a) => a.id === 'mono'), true)
check('incluye corona', PIBBI_ACCESSORIES.some((a) => a.id === 'corona'), true)
check('incluye ninguno', PIBBI_ACCESSORIES.some((a) => a.id === 'ninguno'), true)
check('lentes es válido', isPibbiAccessory('lentes'), true)
check('corona es válido', isPibbiAccessory('corona'), true)
check('ninguno es válido', isPibbiAccessory('ninguno'), true)
check('"sombrero" no es válido', isPibbiAccessory('sombrero'), false)
check('null no es válido', isPibbiAccessory(null), false)
check('vacío no es válido', isPibbiAccessory(''), false)

// 2. Poses de reacción: las 7 imágenes existen y son PNG data URI.
const poses = { MASCOTA, MASCOTA_AHORRANDO, MASCOTA_CELEBRANDO, MASCOTA_CONTAR, MASCOTA_PENSATIVO, MASCOTA_PROGRESO, MASCOTA_SALUDANDO }
for (const [name, uri] of Object.entries(poses)) {
  check(`pose ${name} es data URI PNG`, uri.startsWith('data:image/png;base64,'), true)
  check(`pose ${name} no está vacía`, uri.length > 10000, true)
}

// 3. Modo individual: hogar de 1 persona reparte 100% (absorbe_todo).
//    En pareja sigue el 50/50 de siempre.
check('solo: absorbe_todo = 100', splitPctFor('absorbe_todo', 50), 100)
check('pareja: 50/50 = 50', splitPctFor('50/50', 50), 50)
check('pareja: personalizado 30 = 30', splitPctFor('personalizado', 30), 30)
check('personalizado se limita a 100', splitPctFor('personalizado', 150), 100)
check('personalizado se limita a 0', splitPctFor('personalizado', -10), 0)

// 4. Deuda mutua y liquidaciones (auditoría Qwen, C): "Liquidar ahora"
//    registra settled_amount en money_dates; el saldo debe restarlo, si no
//    la deuda reaparece al recargar. A pagó $1,000 50/50 -> B le debe $500.
const txs = [{ amount: 1000, paid_by: 'A', split_pct: 50, type: 'gasto' }] as never
check('deuda sin liquidar: B debe 500 a A', computeMutualBalance(txs, 'A', 'B'), { debtor_id: 'B', creditor_id: 'A', amount: 500 })
check('liquidación total: a mano', computeMutualBalance(txs, 'A', 'B', [{ settled_amount: 500 }]), null)
check('liquidación parcial 200: quedan 300', computeMutualBalance(txs, 'A', 'B', [{ settled_amount: 200 }]), { debtor_id: 'B', creditor_id: 'A', amount: 300 })
check('money date de revisión (0) no afecta', computeMutualBalance(txs, 'A', 'B', [{ settled_amount: 0 }]), { debtor_id: 'B', creditor_id: 'A', amount: 500 })
check('liquidación de más no invierte la deuda', computeMutualBalance(txs, 'A', 'B', [{ settled_amount: 600 }]), null)
check('dos liquidaciones se suman', computeMutualBalance(txs, 'A', 'B', [{ settled_amount: 200 }, { settled_amount: 300 }]), null)

// 5. Poses nuevas con fondo circular negro (George, 17 nov): de perfil con
//    lápiz y libreta, con calculadora y avatar circular de frente. Son JPEG
//    (las anteriores son PNG) y cada pose trae sus párpados en su sitio,
//    si no el parpadeo caería fuera de los ojos.
const nuevas = { MASCOTA_PERFIL_LAPIZ, MASCOTA_CALCULADORA, MASCOTA_AVATAR_CIRCULAR }
for (const [name, uri] of Object.entries(nuevas)) {
  check(`pose ${name} es data URI JPEG`, uri.startsWith('data:image/jpeg;base64,'), true)
  check(`pose ${name} no está vacía`, uri.length > 10000, true)
}
check('apuntando usa perfil con lápiz', REACTION_POSES.apuntando, 'perfilLapiz')
check('calculando usa calculadora', REACTION_POSES.calculando, 'calculadora')
check('pensando sigue pensativo', REACTION_POSES.pensando, 'pensativo')
check('saludando sigue saludando', REACTION_POSES.saludando, 'saludando')
check('avatar circular es circular', PIBBI_POSES.avatarCircular.circular, true)
check('solo el avatar es circular', Object.entries(PIBBI_POSES).filter(([, c]) => c.circular).map(([p]) => p), ['avatarCircular'])
check('perfil con lápiz no lleva prendas', PIBBI_POSES.perfilLapiz.accessories, false)
check('calculadora no lleva prendas', PIBBI_POSES.calculadora.accessories, false)
check('perfil con lápiz tiene un solo ojo visible', PIBBI_POSES.perfilLapiz.eyelids.length, 1)
check('avatar tiene dos ojos', PIBBI_POSES.avatarCircular.eyelids.length, 2)
for (const [pose, cfg] of Object.entries(PIBBI_POSES)) {
  for (const e of cfg.eyelids) {
    check(`párpado de ${pose} dentro del marco`, e.left >= 0 && e.left + 18 <= 100 && e.top >= 0 && e.top + 15 <= 100, true)
  }
}

// 6. PIBBI en todas las ventanas (George, 17 nov): cada vista lleva el
// encabezado común PibbiHeader con su pose. Lógica pura + fuente: si una
// ventana pierde su encabezado o usa una pose que no existe, el test falla.
const root = process.cwd()
const PAGES: Array<{ page: PibbiPage; file: string; pose: string }> = [
  { page: 'dashboard', file: 'src/pages/Dashboard.tsx', pose: 'saludando' },
  { page: 'movimientos', file: 'src/pages/Movimientos.tsx', pose: 'calculadora' },
  { page: 'presupuesto', file: 'src/pages/Presupuesto.tsx', pose: 'contar' },
  { page: 'plan', file: 'src/pages/Plan.tsx', pose: 'progreso' },
  { page: 'chat', file: 'src/pages/Chat.tsx', pose: 'avatarCircular' },
  { page: 'recordatorios', file: 'src/pages/Reminders.tsx', pose: 'perfilLapiz' },
  { page: 'onboarding', file: 'src/pages/Onboarding.tsx', pose: 'saludando' },
]
check('el mapa cubre las 7 ventanas', Object.keys(PAGE_PIBBI_POSES).sort(), PAGES.map((p) => p.page).sort())
for (const { page, pose } of PAGES) {
  check(`pose de ${page} es ${pose}`, PAGE_PIBBI_POSES[page], pose)
  check(`pose de ${page} existe en PIBBI_POSES`, pose in PIBBI_POSES, true)
}
for (const { page, file } of PAGES) {
  const src = readFileSync(join(root, file), 'utf8')
  check(`${file} importa PibbiHeader`, src.includes("from '../components/PibbiHeader'"), true)
  check(`${file} renderiza <PibbiHeader`, src.includes('<PibbiHeader'), true)
  check(`${file} usa PAGE_PIBBI_POSES.${page}`, src.includes(`PAGE_PIBBI_POSES.${page}`), true)
}
const headerSrc = readFileSync(join(root, 'src/components/PibbiHeader.tsx'), 'utf8')
check('PibbiHeader renderiza Mascota', headerSrc.includes('<Mascota'), true)
check('PibbiHeader: avatar en círculo', headerSrc.includes('circular'), true)
check('PibbiHeader muestra el nombre de la mascota', headerSrc.includes('{name}'), true)
check('PibbiHeader abre el panel al tocar (PibbiPanel)', headerSrc.includes('PibbiPanel'), true)
check('PibbiHeader: tamaño del avatar según el ajuste (HEADER_SIZE_CLASS)', headerSrc.includes('HEADER_SIZE_CLASS[size]'), true)
check('PibbiHeader no tapa botones a 360 px (flex-wrap)', headerSrc.includes('flex-wrap'), true)

// 7. Sistema de mascota igualito al de Muse (George, 17 nov): nombre,
//    vibe, tamaño, panel y baile. Lógica pura + fuente.
check('nombre por defecto es PIBBI', DEFAULT_MASCOT_NAME, 'PIBBI')
check('2 sugerencias de nombre', MASCOT_NAME_SUGGESTIONS.length, 2)
check('sugerencias incluyen PIBBI', MASCOT_NAME_SUGGESTIONS.includes('PIBBI'), true)
check('normalizar: quita espacios', normalizarNombreMascota('  Chonchito  '), 'Chonchito')
check('normalizar: vacío vuelve a PIBBI', normalizarNombreMascota(''), 'PIBBI')
check('normalizar: null vuelve a PIBBI', normalizarNombreMascota(null), 'PIBBI')
check('normalizar: solo espacios vuelve a PIBBI', normalizarNombreMascota('   '), 'PIBBI')
check('normalizar: corta a 20 caracteres', normalizarNombreMascota('a'.repeat(30)).length, 20)
check('vibe alegre válida', isPibbiVibe('alegre'), true)
check('vibe bromista válida', isPibbiVibe('bromista'), true)
check('vibe enojado no válida', isPibbiVibe('enojado'), false)
check('vibe null no válida', isPibbiVibe(null), false)
check('tamaño grande válido', isPibbiSize('grande'), true)
check('tamaño enorme no válido', isPibbiSize('enorme'), false)
check('tamaño del encabezado: compacto 32 px', HEADER_SIZE_CLASS.compacto, 'h-8 w-8')
check('tamaño del encabezado: normal 40 px', HEADER_SIZE_CLASS.normal, 'h-10 w-10')
check('tamaño del encabezado: grande 56 px', HEADER_SIZE_CLASS.grande, 'h-14 w-14')
for (const vibe of ['alegre', 'tranquilo', 'motivador', 'bromista'] as const) {
  check(`saludo ${vibe} usa el nombre`, saludoPibbi(vibe, 'Chonchito').includes('Chonchito'), true)
  check(`celebración ${vibe} no está vacía`, celebracionPibbi(vibe, 'Chonchito').length > 10, true)
}
check('saludo alegre por defecto dice PIBBI', saludoPibbi('alegre', 'PIBBI').includes('Soy PIBBI'), true)
check('celebración alegre usa el nombre', celebracionPibbi('alegre', 'Chonchito').includes('Chonchito'), true)
check('reacción celebrando usa el nombre', textoReaccion('celebrando', 'alegre', 'Chonchito').includes('Chonchito'), true)
check('reacción saludando no está vacía', textoReaccion('saludando', 'tranquilo', 'PIBBI').length > 0, true)
check('reacción apuntando sigue igual', textoReaccion('apuntando', 'alegre', 'PIBBI'), '¡Anotado!')

// Migración 007: la identidad vive en pibbi_customization.
const mig007 = readFileSync(join(root, 'supabase/migrations/007_mascota_identidad.sql'), 'utf8')
check('migración 007: extiende pibbi_customization', mig007.includes('alter table public.pibbi_customization'), true)
check('migración 007: mascot_name con default PIBBI', mig007.includes('mascot_name') && mig007.includes("default 'PIBBI'"), true)
check('migración 007: vibe con default alegre y sus 4 valores', mig007.includes("default 'alegre'") && ['alegre', 'tranquilo', 'motivador', 'bromista'].every((v) => mig007.includes(`'${v}'`)), true)
check('migración 007: size con default normal y sus 3 valores', mig007.includes("default 'normal'") && ['compacto', 'normal', 'grande'].every((s) => mig007.includes(`'${s}'`)), true)

// Fuente: el panel, el baile y el avatar del chat existen.
const panelSrc = readFileSync(join(root, 'src/components/PibbiPanel.tsx'), 'utf8')
check('PibbiPanel tiene botón ¡Baila!', panelSrc.includes('¡Baila!'), true)
check('PibbiPanel tiene editar nombre', panelSrc.includes('PibbiNameEditor'), true)
check('PibbiPanel tiene personalidad', panelSrc.includes('Personalidad') && panelSrc.includes('PIBBI_VIBES'), true)
check('PibbiPanel tiene aspecto (prendas)', panelSrc.includes('PibbiDresser'), true)
check('PibbiPanel tiene tamaño', panelSrc.includes('Tamaño') && panelSrc.includes('PIBBI_SIZES'), true)
check('PibbiPanel cierra con X y tocando fuera', panelSrc.includes('aria-label="Cerrar"') && panelSrc.includes('aria-label="Cerrar el panel"'), true)
check('PibbiPanel: avatar grande 96 px, 120 px al bailar', panelSrc.includes('h-24 w-24') && panelSrc.includes('h-[120px] w-[120px]'), true)
const mascotaSrc = readFileSync(join(root, 'src/components/Mascota.tsx'), 'utf8')
check('Mascota acepta prop dancing', mascotaSrc.includes('dancing'), true)
check('Mascota acepta prop circular', mascotaSrc.includes('circular'), true)
check('Mascota usa el nombre en su alt por defecto', mascotaSrc.includes('nuestro cerdito de los ahorros'), true)
const cssSrc = readFileSync(join(root, 'src/index.css'), 'utf8')
check('CSS tiene animación de baile (giro + salto)', cssSrc.includes('@keyframes pibbi-baile') && cssSrc.includes('rotate(360deg)') && cssSrc.includes('translateY(-12px)'), true)
check('CSS tiene clase .pibbi-baila', cssSrc.includes('.pibbi-baila'), true)
check('Baile respeta prefers-reduced-motion', cssSrc.includes('.pibbi-baila') && cssSrc.includes('prefers-reduced-motion'), true)
const chatSrc = readFileSync(join(root, 'src/components/ChatCapture.tsx'), 'utf8')
check('Chat: avatar de 32 px junto a mensajes de la mascota', chatSrc.includes('avatarCircular') && chatSrc.includes('h-8 w-8'), true)
check('Chat: tocar el avatar abre el panel', chatSrc.includes('PibbiPanel'), true)
const onboardingSrc = readFileSync(join(root, 'src/pages/Onboarding.tsx'), 'utf8')
check('Onboarding paso 4: selector de nombre junto a las prendas', onboardingSrc.includes('PibbiNameEditor'), true)
check('Onboarding usa el saludo según la vibe', onboardingSrc.includes('saludoPibbi'), true)
const pibbiSrc = readFileSync(join(root, 'src/lib/pibbi.tsx'), 'utf8')
check('Provider expone nombre/vibe/tamaño y sus setters', ['setName', 'setVibe', 'setSize'].every((s) => pibbiSrc.includes(s)), true)
check('Provider lee la identidad de la BD (migración 007)', pibbiSrc.includes('mascot_name, vibe, size'), true)
check('Provider tiene fallback localStorage sin sesión', pibbiSrc.includes('MASCOT_NAME_STORAGE_KEY'), true)
const reactionSrc = readFileSync(join(root, 'src/components/PibbiReaction.tsx'), 'utf8')
check('Reacción celebra bailando a 120 px', reactionSrc.includes('h-[120px] w-[120px]') && reactionSrc.includes('dancing'), true)
check('Reacción usa el texto según la vibe', reactionSrc.includes('textoReaccion'), true)
const goalSrc = readFileSync(join(root, 'src/components/GoalCard.tsx'), 'utf8')
check('Meta lograda: celebración según la vibe y baile', goalSrc.includes('celebracionPibbi') && goalSrc.includes('dancing'), true)

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
