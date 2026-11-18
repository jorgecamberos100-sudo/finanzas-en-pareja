// Pruebas del parser de recordatorios (reloj congelado: mar 2026-11-17 23:30 Tijuana).
// El mock de Date se instala antes de llamar a las funciones (el módulo
// importado no usa Date en tiempo de importación, solo al parsear).
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

import {
  detectReminderIntent,
  nextDueDate,
  parseReminderDateEs,
  parseReminderText,
  parseTimeEs,
} from '../src/lib/reminders.ts'

const cats = [
  { id: 'c1', household_id: 'h', group: 'Vivienda', name: 'Renta / Hipoteca', icon: '🏠', monthly_limit: 8000, rollover: false },
  { id: 'c2', household_id: 'h', group: 'Servicios', name: 'Luz, agua e internet', icon: '💡', monthly_limit: 1500, rollover: false },
  { id: 'c3', household_id: 'h', group: 'Suscripciones', name: 'Suscripciones', icon: '📺', monthly_limit: 600, rollover: false },
] as never

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

const p1 = parseReminderText('recuérdame pagar $1,500 de renta el 1 de diciembre', { categories: cats })
check('renta 1 dic: título', p1?.title, 'Renta')
check('renta 1 dic: monto', p1?.amount_minor, 150000)
check('renta 1 dic: fecha', p1?.due_date, '2026-12-01')
check('renta 1 dic: recurrencia', p1?.recurrence, 'once')
check('renta 1 dic: categoría', p1?.category, 'Renta / Hipoteca')

const p2 = parseReminderText('recuérdame la luz el viernes', { categories: cats })
check('luz viernes: fecha (17 nov mar -> vie 20)', p2?.due_date, '2026-11-20')
check('luz viernes: monto null', p2?.amount_minor, null)
check('luz viernes: título', p2?.title, 'La luz')
check('luz viernes: needs_review monto', p2?.needs_review.includes('amount'), true)

const p3 = parseReminderText('recuérdame pagar la renta el 1ro de cada mes', { categories: cats })
check('renta 1ro cada mes: fecha', p3?.due_date, '2026-12-01')
check('renta 1ro cada mes: mensual', p3?.recurrence, 'monthly')

const p4 = parseReminderText('avísame de la luz a las 9 de la mañana el viernes', { categories: cats })
check('luz 9am viernes: hora', p4?.due_time, '09:00')
check('luz 9am viernes: fecha', p4?.due_date, '2026-11-20')

const p5 = parseReminderText('recuérdame pagar $800 de internet cada mes el 15', { categories: cats })
check('internet cada mes el 15: fecha', p5?.due_date, '2026-12-15')
check('internet cada mes el 15: mensual', p5?.recurrence, 'monthly')
check('internet cada mes el 15: monto', p5?.amount_minor, 80000)

check('gasto normal no es recordatorio', parseReminderText('Gasté $350 en Walmart en despensa, pagué yo', { categories: cats }), null)
check('intención gasto = none', detectReminderIntent('Gasté $350 en Walmart'), 'none')
check('intención recuérdame = strong', detectReminderIntent('recuérdame pagar la renta'), 'strong')
check('intención pagar el 1ro = weak', detectReminderIntent('pagar la renta el 1ro'), 'weak')

const p6 = parseReminderText('pagar la renta el 1ro', { categories: cats })
check('ambiguo pagar renta 1ro: fecha', p6?.due_date, '2026-12-01')

check('hora: $1,500 no es hora', parseTimeEs('recuérdame pagar $1,500 de renta'), null)
check('hora: a las 9:30', parseTimeEs('avísame a las 9:30'), '09:30')
check('hora: 9 de la noche', parseTimeEs('recuérdame a las 9 de la noche'), '21:00')
check('hora: 21:00', parseTimeEs('avísame 21:00'), '21:00')
// Auditoría Qwen (B): la rama HH:MM ignoraba am/pm ("5:00 pm" -> 05:00).
check('hora: 5:00 pm es 17:00', parseTimeEs('recuérdame a las 5:00 pm'), '17:00')
check('hora: 5:00 pm sin "a las"', parseTimeEs('avísame 5:00 pm'), '17:00')
check('hora: 5:00 de la tarde es 17:00', parseTimeEs('recuérdame a las 5:00 de la tarde'), '17:00')
check('hora: 9:30 am es 09:30', parseTimeEs('avísame 9:30 am'), '09:30')
check('hora: 12:00 pm es 12:00', parseTimeEs('recuérdame a las 12:00 pm'), '12:00')
check('hora: 12:00 am es 00:00', parseTimeEs('recuérdame a las 12:00 am'), '00:00')
check('hora: 5:00 p.m. con puntos', parseTimeEs('recuérdame a las 5:00 p.m.'), '17:00')
check('hora: 5:00 de la noche es 17:00', parseTimeEs('avísame a las 5:00 de la noche'), '17:00')
const p7 = parseReminderText('recuérdame pagar $1,500 de renta el 1 de diciembre a las 5:00 pm', { categories: cats })
check('renta 1 dic 5pm: hora', p7?.due_time, '17:00')
check('renta 1 dic 5pm: fecha', p7?.due_date, '2026-12-01')
check('renta 1 dic 5pm: monto', p7?.amount_minor, 150000)

check('fecha: mañana', parseReminderDateEs('recuérdame mañana', undefined).date, '2026-11-18')
check('fecha: el lunes (hoy martes -> 23)', parseReminderDateEs('el lunes', undefined).date, '2026-11-23')
check('fecha: en 3 días', parseReminderDateEs('en 3 días', undefined).date, '2026-11-20')

check('next mensual 31 ene -> 28 feb', nextDueDate('2026-01-31', 'monthly'), '2026-02-28')
check('next anual 29 feb (bisiesto) -> 28 feb', nextDueDate('2024-02-29', 'yearly'), '2025-02-28')
check('next semanal', nextDueDate('2026-11-17', 'weekly'), '2026-11-24')
check('next diario', nextDueDate('2026-11-17', 'daily'), '2026-11-18')
check('next anual', nextDueDate('2026-11-17', 'yearly'), '2027-11-17')
check('next once -> null', nextDueDate('2026-11-17', 'once'), null)

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
