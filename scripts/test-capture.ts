// Pruebas del parser de captura (E) y de próximos vencimientos (G).
// Lógica pura (sin Supabase ni DOM).
import { extractAmounts, parseLineToEntry } from '../src/lib/capture.ts'
import { parseAmount } from '../src/lib/format.ts'
import { upcomingRecurring } from '../src/lib/recurring.ts'

let pass = 0
let fail = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}\n    esperado: ${e}\n    real:     ${a}`)
  }
}

// Montos tecleados: separadores de miles y decimales (es-MX y mixto).
check('monto "$1,500.50"', parseAmount('$1,500.50'), 1500.5)
check('monto "1.500,50"', parseAmount('1.500,50'), 1500.5)
check('monto "1500,50"', parseAmount('1500,50'), 1500.5)
check('monto "1,500"', parseAmount('1,500'), 1500)
check('monto "$89.50"', parseAmount('$89.50'), 89.5)
check('monto "89,50"', parseAmount('89,50'), 89.5)
check('monto "1.500"', parseAmount('1.500'), 1500)
check('monto "200"', parseAmount('200'), 200)
check('monto inválido "abc"', parseAmount('abc'), 0)

// E. Las fechas no son montos (auditoría Qwen: "compré 2 cosas por 50 el
// 12/11/2026" devolvía [2, 50, 12, 11, 2026] y la propuesta tomaba $2).
check('fecha 12/11/2026 no es monto', extractAmounts('compré 2 cosas por 50 el 12/11/2026'), [50])
check('fecha con $ no contamina', extractAmounts('gasté $350 en Walmart el 12/11/2026'), [350])
check('fecha ISO no es monto', extractAmounts('gasté 420 el 2026-11-12'), [420])
check('"12 de noviembre" no es monto', extractAmounts('gasté 350 el 12 de noviembre'), [350])
check('año suelto no es monto', extractAmounts('en 2026 gasté 300 en el súper'), [300])
check('año con $ sí es monto', extractAmounts('gasté $2026 en la boda'), [2026])
check('año con pesos sí es monto', extractAmounts('gasté 2026 pesos en la boda'), [2026])
check('cantidad "2 cosas" no es monto', extractAmounts('compré 2 cosas por 50'), [50])
check('cantidad "3 kilos" no es monto', extractAmounts('compré 3 kilos de tortillas por 80'), [80])

// Comportamiento previo que no debe romperse.
check('monto con $', extractAmounts('Gasté $350 en Walmart en despensa, pagué yo'), [350])
check('monto sin $', extractAmounts('Gasté 350 en Walmart'), [350])
check('dos montos', extractAmounts('$60 en el camión y $40 en un elote'), [60, 40])
check('miles con coma', extractAmounts('gasté $1,250.50 en Costco'), [1250.5])

// Propuesta completa del ejemplo de la auditoría: $50 el 12/11/2026.
const entry = parseLineToEntry('compré 2 cosas por 50 el 12/11/2026', { categories: [], sourceType: 'text' })
check('ejemplo auditoría: monto 5000 centavos', entry?.amount_minor, 5000)
check('ejemplo auditoría: fecha 2026-11-12', entry?.occurred_at, '2026-11-12')

// G. Próximos vencimientos: hoy 25 nov, la renta del día 5 es del mes
// siguiente y debe aparecer (antes quedaba oculta).
const rec = [
  { id: 'r1', household_id: 'h', title: 'Renta', amount: 8000, due_day: 5, category_id: null, account_id: null, active: true },
  { id: 'r2', household_id: 'h', title: 'Internet', amount: 500, due_day: 28, category_id: null, account_id: null, active: true },
  { id: 'r3', household_id: 'h', title: 'Gym', amount: 600, due_day: 20, category_id: null, account_id: null, active: true },
] as never
const up = upcomingRecurring(rec, new Date('2026-11-25T12:00:00-08:00'))
check('próximos: 3 en orden', up.map((u) => u.recurring.due_day), [28, 5, 20])
check('próximos: día 28 es este mes', up[0]?.nextMonth, false)
check('próximos: día 28 en 3 días', up[0]?.daysUntil, 3)
check('próximos: día 5 es próx. mes', up[1]?.nextMonth, true)
check('próximos: día 5 en 10 días', up[1]?.daysUntil, 10)
check('próximos: día 20 es próx. mes', up[2]?.nextMonth, true)
const up2 = upcomingRecurring(rec, new Date('2026-11-01T12:00:00-08:00'))
check('día 1: todo este mes', up2.map((u) => u.nextMonth), [false, false, false])
check('día 1: orden por día', up2.map((u) => u.recurring.due_day), [5, 20, 28])

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
