// Pruebas de los planes Free / Plus / Fundadores (monetización, nov 2026).
// Lógica pura (sin Supabase ni DOM) + comprobaciones a nivel de fuente de
// que los gates y el contador están cableados donde deben estar.
// Modelo: Free $0 (10 capturas IA/mes, 3 sobres, 1 meta, historial 90 días,
// sin CSV); Plus $59/mes o $399/año (IA uso justo 300/mes, sobres y metas
// ilimitados, historial completo + CSV); Fundadores $699 pago único
// (lo mismo que Plus, solo 100 hogares).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PLANES,
  capturasRestantes,
  capturasUsadas,
  corteHistorialIso,
  defPlan,
  esMovimientoAntiguo,
  etiquetaPrecio,
  iniciarCheckout,
  planActual,
  puedeCrearMeta,
  puedeCrearSobre,
  puedeExportarCsv,
  puedeUsarIA,
  type PlanId,
} from '../src/lib/planes.ts'
import type { HouseholdPlan } from '../src/types.ts'

// Se corre con npm desde la raíz del repo (igual que los demás test:*).
const root = process.cwd()

let pass = 0
let fail = 0
function check(name: string, actual: unknown, expected?: unknown) {
  const ok = expected === undefined ? actual === true : JSON.stringify(actual) === JSON.stringify(expected)
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}\n    esperado: ${e}\n    real:     ${a}`)
  }
}

function planRow(plan: PlanId, used: number, key = '2026-11'): HouseholdPlan {
  return {
    household_id: 'h1',
    plan,
    started_at: '2026-11-01T00:00:00Z',
    ai_captures_month: used,
    ai_captures_month_key: key,
    founders_number: plan === 'fundadores' ? 7 : null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-17T00:00:00Z',
  }
}

// Definición de los planes.
check('Free: 10 capturas IA/mes', PLANES.free.capturasIaMes, 10)
check('Free: 3 sobres', PLANES.free.sobresMax, 3)
check('Free: 1 meta', PLANES.free.metasMax, 1)
check('Free: historial 90 días', PLANES.free.historialDias, 90)
check('Free: sin CSV', PLANES.free.exportaCsv, false)
check('Free: $0', PLANES.free.precioMensualMxn, 0)
check('Plus: $59/mes', PLANES.plus.precioMensualMxn, 59)
check('Plus: $399/año', PLANES.plus.precioAnualMxn, 399)
check('Plus: 300 capturas IA/mes (uso justo)', PLANES.plus.capturasIaMes, 300)
check('Plus: sobres ilimitados', PLANES.plus.sobresMax, Infinity)
check('Plus: metas ilimitadas', PLANES.plus.metasMax, Infinity)
check('Plus: historial completo', PLANES.plus.historialDias, Infinity)
check('Plus: con CSV', PLANES.plus.exportaCsv, true)
check('Fundadores: $699 pago único', PLANES.fundadores.pagoUnicoMxn, 699)
check('Fundadores: sin mensualidad', PLANES.fundadores.precioMensualMxn, null)
check('Fundadores: 300 capturas IA/mes', PLANES.fundadores.capturasIaMes, 300)
check('Fundadores: con CSV', PLANES.fundadores.exportaCsv, true)

// Sin fila de plan, el hogar es Free.
check('sin fila: plan Free', planActual(null), 'free')
check('sin fila: def Free', defPlan(null).id, 'free')
check('sin fila: 0 usadas', capturasUsadas(null), 0)
check('sin fila: 10 restantes', capturasRestantes(null), 10)
check('sin fila: puede usar IA', puedeUsarIA(null), true)

// Contador Free: límite 10.
check('Free 9/10: puede usar IA', puedeUsarIA(planRow('free', 9)), true)
check('Free 9/10: 1 restante', capturasRestantes(planRow('free', 9)), 1)
check('Free 10/10: bloqueado', puedeUsarIA(planRow('free', 10)), false)
check('Free 10/10: 0 restantes', capturasRestantes(planRow('free', 10)), 0)
check('Free 12/10: bloqueado (sin negativos)', capturasRestantes(planRow('free', 12)), 0)

// Contador Plus/Fundadores: uso justo 300.
check('Plus 299/300: puede usar IA', puedeUsarIA(planRow('plus', 299)), true)
check('Plus 300/300: bloqueado', puedeUsarIA(planRow('plus', 300)), false)
check('Fundadores 300/300: bloqueado', puedeUsarIA(planRow('fundadores', 300)), false)
check('Fundadores 150/300: 150 restantes', capturasRestantes(planRow('fundadores', 150)), 150)

// Mes nuevo: el contador caducado se lee como 0 (el servidor lo reinicia).
check('mes viejo: 10 usadas en oct se leen como 0 en nov', capturasUsadas(planRow('free', 10, '2026-10'), '2026-11'), 0)
check('mes viejo: puede usar IA en mes nuevo', puedeUsarIA(planRow('free', 10, '2026-10'), '2026-11'), true)

// Gates de sobres y metas.
check('Free con 2 sobres: puede crear el 3.º', puedeCrearSobre(planRow('free', 0), 2), true)
check('Free con 3 sobres: no puede crear el 4.º', puedeCrearSobre(planRow('free', 0), 3), false)
check('Plus con 100 sobres: puede crear otro', puedeCrearSobre(planRow('plus', 0), 100), true)
check('Free sin metas: puede crear 1', puedeCrearMeta(planRow('free', 0), 0), true)
check('Free con 1 meta: no puede crear la 2.ª', puedeCrearMeta(planRow('free', 0), 1), false)
check('Plus con 50 metas: puede crear otra', puedeCrearMeta(planRow('plus', 0), 50), true)
check('Fundadores con 50 metas: puede crear otra', puedeCrearMeta(planRow('fundadores', 0), 50), true)

// CSV solo en Plus/Fundadores.
check('Free: no exporta CSV', puedeExportarCsv(planRow('free', 0)), false)
check('Plus: exporta CSV', puedeExportarCsv(planRow('plus', 0)), true)
check('Fundadores: exporta CSV', puedeExportarCsv(planRow('fundadores', 0)), true)

// Historial: hoy 2026-11-17, corte Free = 2026-08-19 (90 días).
check('Free: corte 90 días', corteHistorialIso(planRow('free', 0), '2026-11-17'), '2026-08-19')
check('Plus: sin corte', corteHistorialIso(planRow('plus', 0), '2026-11-17'), null)
check('Free: tx de hace 90 días se ve', esMovimientoAntiguo(planRow('free', 0), '2026-08-19', '2026-11-17'), false)
check('Free: tx de hace 91 días bloqueada', esMovimientoAntiguo(planRow('free', 0), '2026-08-18', '2026-11-17'), true)
check('Free: tx de hoy se ve', esMovimientoAntiguo(planRow('free', 0), '2026-11-17', '2026-11-17'), false)
check('Plus: tx de hace 2 años se ve', esMovimientoAntiguo(planRow('plus', 0), '2024-01-01', '2026-11-17'), false)

// Etiquetas de precio y checkout (sin Stripe: aviso, no cobro).
check('etiqueta Free', etiquetaPrecio(PLANES.free), 'Gratis')
check('etiqueta Plus', etiquetaPrecio(PLANES.plus), '$59/mes o $399/año')
check('etiqueta Fundadores', etiquetaPrecio(PLANES.fundadores), '$699 pago único')
const co = iniciarCheckout('plus')
check('checkout Plus: no cobra (ok false)', co.ok, false)
check('checkout Plus: avisa que el pago se activará pronto', co.mensaje.includes('se activará pronto'), true)
const coF = iniciarCheckout('fundadores')
check('checkout Fundadores: no cobra (ok false)', coF.ok, false)
check('checkout Fundadores: menciona $699', coF.mensaje.includes('$699'), true)

// Cableado a nivel de fuente: los gates y el contador existen donde deben.
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
check('App.tsx carga el plan en loadAll', app.includes('cargarPlan('))
check('App.tsx guarda el plan en AppData', app.includes('plan: planRow'))
check('App.tsx escucha Realtime de household_plan', app.includes("table: 'household_plan'"))
const planesDb = readFileSync(join(root, 'src/lib/planes-db.ts'), 'utf8')
check('planes-db: cargarPlan lee household_plan', planesDb.includes("from('household_plan')"))
check('planes-db: registrarCapturaIA llama a la RPC', planesDb.includes("rpc('increment_ai_capture'"))
check('planes-db: activarPlanManual llama a la RPC', planesDb.includes("rpc('set_household_plan'"))
const planesLib = readFileSync(join(root, 'src/lib/planes.ts'), 'utf8')
check('planes.ts es lógica pura (no importa el cliente Supabase)', !planesLib.includes("from './supabase'"))

const chat = readFileSync(join(root, 'src/components/ChatCapture.tsx'), 'utf8')
check('ChatCapture bloquea la IA al llegar al límite', chat.includes('puedeUsarIA(data.plan)'))
check('ChatCapture incrementa el contador al confirmar', chat.includes('registrarCapturaIA('))
check('ChatCapture muestra el paywall al bloquear', chat.includes('<Paywall'))

const pres = readFileSync(join(root, 'src/pages/Presupuesto.tsx'), 'utf8')
check('Presupuesto: gate del 4.º sobre', pres.includes('puedeCrearSobre(data.plan, budgeted.length)'))
const plan = readFileSync(join(root, 'src/pages/Plan.tsx'), 'utf8')
check('Plan: gate de la 2.ª meta', plan.includes('puedeCrearMeta(data.plan, data.goals.length)'))
const mov = readFileSync(join(root, 'src/pages/Movimientos.tsx'), 'utf8')
check('Movimientos: gate de exportar CSV', mov.includes('puedeExportarCsv(data.plan)'))
check('Movimientos: historial antiguo bloqueado', mov.includes('esMovimientoAntiguo(data.plan, tx.date, hoy)'))
const paywall = readFileSync(join(root, 'src/components/Paywall.tsx'), 'utf8')
check('Paywall: muestra $59/mes', paywall.includes('$59/mes'))
check('Paywall: muestra $399/año', paywall.includes('$399/año'))
check('Paywall: muestra Fundadores $699', paywall.includes('$699'))
check('Paywall: la captura manual sigue gratis', paywall.includes('botón + siempre es gratis'))
const confirm = readFileSync(join(root, 'supabase/functions/capture-confirm/index.ts'), 'utf8')
check('capture-confirm: incrementa el contador tras insertar', confirm.includes("rpc('increment_ai_capture'"))

const mig = readFileSync(join(root, 'supabase/migrations/005_planes_y_contador_ia.sql'), 'utf8')
check('migración 005: tabla household_plan', mig.includes('create table public.household_plan'))
check('migración 005: planes free/plus/fundadores', mig.includes("check (plan in ('free', 'plus', 'fundadores'))"))
check('migración 005: función increment_ai_capture', mig.includes('create or replace function public.increment_ai_capture'))
check('migración 005: función set_household_plan', mig.includes('create or replace function public.set_household_plan'))
check('migración 005: tope Fundadores 100', mig.includes('founders_number >= 1 and founders_number <= 100'))
check('migración 005: Realtime de household_plan', mig.includes('alter publication supabase_realtime add table public.household_plan'))
check('migración 005: sin drop table', !mig.includes('drop table'))
check('migración 005: no altera otras tablas', !mig.includes('alter table public.households') && !mig.includes('alter table public.transactions') && !mig.includes('alter table public.goals'))

console.log(`\ntest-planes: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
