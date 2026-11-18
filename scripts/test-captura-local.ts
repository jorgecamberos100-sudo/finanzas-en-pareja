// Pruebas de la captura local gratis en el teléfono: montos en palabras,
// parser local con dígitos y palabras, y lectura de tickets (OCR simulado).
// Lógica pura (sin Supabase ni DOM); tesseract.js queda externo.
import { montosEnPalabrasADigitos } from '../src/lib/numeros-es.ts'
import { parsearLocal, parsearTicketOcr } from '../src/lib/captura-local.ts'
import { extractAmounts } from '../src/lib/capture.ts'
import type { Category } from '../src/types.ts'

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

const cats: Category[] = [
  { id: 'c1', household_id: 'h', group: 'Despensa', name: 'Súper y mercado', icon: '🛒', monthly_limit: 6000, rollover: true },
  { id: 'c2', household_id: 'h', group: 'Vivienda', name: 'Renta / Hipoteca', icon: '🏠', monthly_limit: 8000, rollover: false },
  { id: 'c3', household_id: 'h', group: 'Restaurantes', name: 'Comer fuera', icon: '🍽️', monthly_limit: 2000, rollover: false },
]
const opts = { categories: cats, partnerName: null, sourceType: 'text' as const, timezone: 'America/Tijuana' }

// ---- Montos en palabras -> dígitos (el pipeline completo) ----
const casos: Array<[string, number[]]> = [
  ['gasté 250 en el súper', [250]],
  ['gasté doscientos cincuenta en el súper', [250]],
  ['pagué mil quinientos de renta', [1500]],
  ['gasté treinta y cinco en el café', [35]],
  ['ciento veinte en la farmacia', [120]],
  ['quinientos pesos en el súper', [500]],
  ['dos mil trescientos cuarenta y cinco', [2345]],
  ['gasté cien', [100]],
  ['gasté un café', []],
  ['doscientos cincuenta con cincuenta centavos', [250.5]],
  ['gasté $1,250.50 en Costco', [1250.5]],
  ['compré 2 cosas por 50 el 12/11/2026', [50]],
  ['un millón', [1000000]],
  ['veinticinco en elotes', [25]],
  ['gasté novecientos noventa y nueve', [999]],
  ['mil', [1000]],
  ['ciento uno', [101]],
  ['trescientos', [300]],
  ['gasté 250 en el súper y 40 en el camión', [250, 40]],
  ['gasté dos mil pesos en la renta', [2000]],
  ['pagué 1500,50 de luz', [1500.5]],
  ['gasté cien pesos con veinte centavos', [100.2]],
]
for (const [texto, esperado] of casos) {
  check(`montos: ${texto}`, extractAmounts(montosEnPalabrasADigitos(texto)), esperado)
}

// El texto fuera de los montos se conserva (acentos y mayúsculas).
check('conserva el resto del texto', montosEnPalabrasADigitos('Gasté doscientos cincuenta en el Súper'), 'Gasté 250 en el Súper')
check('artículo suelto no se convierte', montosEnPalabrasADigitos('gasté un café'), 'gasté un café')

// ---- Propuesta completa: la frase de aceptación del usuario ----
const r1 = parsearLocal('gasté doscientos cincuenta en el súper', opts)
check('frase de aceptación: 1 entrada', r1.entries.length, 1)
check('frase de aceptación: monto 25000 centavos', r1.entries[0]?.amount_minor, 25000)
check('frase de aceptación: categoría Súper y mercado', r1.entries[0]?.category, 'Súper y mercado')
check('frase de aceptación: tipo gasto', r1.entries[0]?.type, 'gasto')
check('frase de aceptación: provider local', r1.provider, 'local')

// Dos cláusulas -> dos propuestas (comportamiento del parser existente).
const r2 = parsearLocal('gasté 250 en el súper y 40 en el camión', opts)
check('dos cláusulas: 2 entradas', r2.entries.length, 2)

// ---- Ticket OCR: con línea TOTAL -> un solo movimiento con el total ----
const ticketConTotal = `WALMART SUPERCENTER
RFC XXX000000XXX
LECHE 1LT $28.50
PAN DULCE $45.00
SUBTOTAL $73.50
TOTAL $73.50
12/11/2026`
const t1 = parsearTicketOcr(ticketConTotal, opts)
check('ticket con TOTAL: 1 entrada', t1.entries.length, 1)
check('ticket con TOTAL: monto 7350 centavos', t1.entries[0]?.amount_minor, 7350)
check('ticket con TOTAL: comercio walmart', t1.entries[0]?.merchant, 'walmart')
check('ticket con TOTAL: fecha del ticket', t1.entries[0]?.occurred_at, '2026-11-12')
check('ticket con TOTAL: provider local-ocr', t1.provider, 'local-ocr')

// ---- Ticket OCR sin línea TOTAL: monto mayor + marcado para revisar ----
const ticketSinTotal = `OXXO
REFRESCO $18.00
GALLETAS $25.50
GRACIAS POR SU COMPRA`
const t2 = parsearTicketOcr(ticketSinTotal, opts)
check('ticket sin TOTAL: 1 entrada', t2.entries.length, 1)
check('ticket sin TOTAL: monto mayor 2550', t2.entries[0]?.amount_minor, 2550)
check('ticket sin TOTAL: monto marcado para revisar', t2.entries[0]?.needs_review.includes('amount'), true)

// ---- Foto ilegible: sin entradas y mensaje en español ----
const t3 = parsearTicketOcr('texto borroso sin numeros', opts)
check('foto ilegible: 0 entradas', t3.entries.length, 0)
check('foto ilegible: mensaje en español', typeof t3.message === 'string' && t3.message.includes('No pude encontrar el total'), true)

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)