// Pruebas de PIBBI: accesorios válidos, poses de las reacciones y modo individual.
// Lógica pura (sin Supabase ni DOM): la personalización se guarda por usuario
// y el hogar de 1 persona reparte 100% (quien paga lo absorbe todo).
import { PIBBI_ACCESSORIES, isPibbiAccessory } from '../src/lib/pibbi-accessories.ts'
import { splitPctFor } from '../src/lib/split.ts'
import {
  MASCOTA, MASCOTA_AHORRANDO, MASCOTA_CELEBRANDO,
} from '../src/lib/mascota-images.ts'
import { MASCOTA_SALUDANDO } from '../src/lib/mascota/saludando.ts'
import { MASCOTA_PENSATIVO } from '../src/lib/mascota/pensativo.ts'
import { MASCOTA_CONTAR } from '../src/lib/mascota/contar.ts'
import { MASCOTA_PROGRESO } from '../src/lib/mascota/progreso.ts'

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

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
