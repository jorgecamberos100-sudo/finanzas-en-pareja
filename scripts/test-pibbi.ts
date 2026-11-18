// Pruebas de PIBBI: accesorios válidos, poses de las reacciones y modo individual.
// Lógica pura (sin Supabase ni DOM): la personalización se guarda por usuario
// y el hogar de 1 persona reparte 100% (quien paga lo absorbe todo).
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
import { PIBBI_POSES, REACTION_POSES } from '../src/lib/pibbi-poses.ts'

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

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
