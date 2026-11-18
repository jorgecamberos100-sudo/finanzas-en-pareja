// Pruebas de las respuestas de PIBBI en el chat (reloj congelado:
// mar 2026-11-17 23:30 Tijuana, como los demás tests de fecha).
// PIBBI contesta con datos reales; si no entiende, devuelve null y el
// texto sigue a captura (nunca se inventa un dato).
const _RealDate = Date
const _FIXED = new _RealDate('2026-11-17T23:30:00-08:00')
globalThis.Date = class extends _RealDate {
  constructor(...args: unknown[]) {
    super(...(args as []))
    if (args.length === 0) return _FIXED as never
  }
  static now() {
    return _FIXED.getTime()
  }
} as DateConstructor

import { contextoPibbi, responderPibbi, saludoPibbi, type PibbiDatos } from '../src/lib/pibbi-respuestas.ts'

let pass = 0
let fail = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else {
    fail++
    console.error(`FALLO: ${name}\n  esperado: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  }
}
function contiene(name: string, actual: string | null, esperado: string) {
  const ok = actual !== null && actual.includes(esperado)
  if (ok) pass++
  else {
    fail++
    console.error(`FALLO: ${name}\n  esperado que contenga: ${JSON.stringify(esperado)}\n  actual: ${JSON.stringify(actual)}`)
  }
}

const datos: PibbiDatos = {
  meId: 'yo',
  meName: 'Jorge',
  partnerId: 'pareja',
  partnerName: 'Ana',
  currency: 'MXN',
  accounts: [
    { type: 'banco', balance: 20000 },
    { type: 'efectivo', balance: 5000 },
  ],
  categories: [
    { id: 'c1', household_id: 'h', group: 'Despensa', name: 'Súper', icon: 'x', monthly_limit: 6000, rollover: false },
    { id: 'c2', household_id: 'h', group: 'Vivienda', name: 'Renta', icon: 'x', monthly_limit: 8000, rollover: false },
  ] as never,
  transactions: [
    { id: 't1', household_id: 'h', account_id: 'a1', category_id: 'c1', created_by: 'yo', paid_by: 'yo', type: 'ingreso', amount: 30000, date: '2026-11-01', merchant: null, note: null, split_pct: 100, visibility: 'compartida', review_status: 'aprobado', dedupe_hash: null, created_at: '2026-11-01' },
    { id: 't2', household_id: 'h', account_id: 'a1', category_id: 'c1', created_by: 'yo', paid_by: 'yo', type: 'gasto', amount: 2500, date: '2026-11-17', merchant: 'Walmart', note: null, split_pct: 50, visibility: 'compartida', review_status: 'aprobado', dedupe_hash: null, created_at: '2026-11-17' },
    { id: 't3', household_id: 'h', account_id: 'a1', category_id: 'c2', created_by: 'pareja', paid_by: 'pareja', type: 'gasto', amount: 8000, date: '2026-11-05', merchant: null, note: null, split_pct: 50, visibility: 'compartida', review_status: 'aprobado', dedupe_hash: null, created_at: '2026-11-05' },
  ] as never,
  goals: [
    { id: 'g1', household_id: 'h', name: 'Vacaciones', target: 20000, current: 5000, due_date: '2027-06-01', created_at: '2026-11-01' },
  ] as never,
  recurring: [
    { id: 'r1', household_id: 'h', title: 'Netflix', amount: 219, due_day: 20, active: true },
  ] as never,
  reminders: [
    { id: 'rem1', household_id: 'h', created_by: 'yo', title: 'Pagar la renta', amount: 8000, due_date: '2026-11-18', due_time: '09:00', recurrence: 'monthly', category_id: 'c2', note: null, timezone: 'America/Tijuana', is_done: false },
  ] as never,
  settlements: [],
}

const ctx = contextoPibbi(datos)

// Contexto calculado con datos reales.
check('patrimonio = cuentas', ctx.patrimonio, 25000)
check('ingresos del mes', ctx.ingresosMes, 30000)
check('gastos del mes', ctx.gastosMes, 10500)
check('gasto de hoy (17 nov)', ctx.gastoHoy, 2500)
check('disponible', ctx.disponible, 19500)
check('por asignar', ctx.porAsignar, 5500)
check('deuda mutua: Ana pagó 8000 al 50%, Jorge debe 4000; Jorge pagó 2500 al 50%, Ana debe 1250; neto Jorge debe 2750', ctx.deuda?.amount, 2750)
check('deuda mutua: deudor Jorge', ctx.deuda?.deudor, 'Tú')
check('sobres ordenados por gastado', ctx.sobres.map((s) => s.name), ['Renta', 'Súper'])
check('avisos: renta mañana', ctx.avisos.length, 1)

// Saludo: 3 burbujas con datos (saludo, resumen, deuda).
const saludo = saludoPibbi(ctx)
check('saludo con datos: 3 burbujas', saludo.length, 3)
contiene('saludo: nombra a Jorge', saludo[0], 'Jorge')
contiene('saludo: resumen del mes', saludo[1], '10,500')
contiene('saludo: deuda', saludo[2], '2,750')

// Saludo sin movimientos: 2 burbujas, invita a registrar.
const vacio = contextoPibbi({ ...datos, transactions: [] })
check('saludo sin movimientos: 2 burbujas', saludoPibbi(vacio).length, 2)
contiene('saludo sin movimientos: invita a anotar', saludoPibbi(vacio)[1], 'Escríbeme un gasto')

// Preguntas con datos reales.
contiene('saldo total', responderPibbi('¿Cuánto tengo?', ctx), '25,000')
contiene('gasto de hoy', responderPibbi('¿Cuánto gasté hoy?', ctx), '2,500')
contiene('gasto del mes', responderPibbi('¿Cuánto gastamos este mes?', ctx), '10,500')
contiene('deuda mutua', responderPibbi('¿Quién le debe a quién?', ctx), '2,750')
contiene('sobres', responderPibbi('¿Cómo van los sobres?', ctx), 'Renta')
contiene('metas', responderPibbi('¿Cómo van mis metas?', ctx), 'Vacaciones')
contiene('avisos', responderPibbi('¿Qué debo pagar?', ctx), 'Pagar la renta')
contiene('ayuda', responderPibbi('¿Qué puedes hacer?', ctx), 'foto o voz')
contiene('saludo hola', responderPibbi('Hola', ctx), 'Hola, Jorge')

// Sin pareja: la deuda mutua no aplica.
const solo = contextoPibbi({ ...datos, partnerId: null, partnerName: null })
contiene('deuda sin pareja', responderPibbi('¿Quién le debe a quién?', solo), 'cuando tu pareja se una')

// Lo que NO contesta: null y el texto sigue a captura.
check('gasto nuevo: null (va a captura)', responderPibbi('Gasté $350 en Walmart', ctx), null)
check('recordatorio: null (lo atiende captura)', responderPibbi('recuérdame pagar la renta el 1ro', ctx), null)
check('texto raro: null', responderPibbi('asdf qwer', ctx), null)

console.log(`\ntest-pibbi-respuestas: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
