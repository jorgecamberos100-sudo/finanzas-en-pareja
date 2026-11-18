// Respuestas de PIBBI en el chat: lógica pura, sin React ni red.
// PIBBI contesta preguntas frecuentes con los datos REALES ya cargados
// en la app (saldos, gastos, sobres, metas, avisos, deuda mutua).
// Si no entiende la pregunta, devuelve null y el texto sigue su camino
// normal de captura (recordatorio o propuesta de movimiento): nunca se
// inventa un dato ni se guarda nada desde aquí.

import { formatMoney, monthKey, todayIso } from './format'
import { computeMutualBalance, monthTotals } from './split'
import { reminderStatus } from './reminders'
import { upcomingRecurring } from './recurring'
import type { Category, Goal, MoneyDate, Recurring, Reminder, Transaction } from '../types'

/** Lo mínimo que PIBBI necesita para contestar: los datos del hogar. */
export interface PibbiDatos {
  meId: string
  meName: string
  partnerId: string | null
  partnerName: string | null
  currency: string
  accounts: Array<{ type: string; balance: number }>
  categories: Category[]
  transactions: Transaction[]
  goals: Goal[]
  recurring: Recurring[]
  reminders: Reminder[]
  settlements: MoneyDate[]
}

/** Resumen ya calculado para contestar y saludar. */
export interface PibbiContexto {
  nombre: string
  pareja: string | null
  currency: string
  patrimonio: number
  ingresosMes: number
  gastosMes: number
  gastoHoy: number
  disponible: number
  porAsignar: number
  deuda: { deudor: string; acreedor: string; amount: number } | null
  sobres: Array<{ name: string; gastado: number; limite: number }>
  metas: Array<{ name: string; current: number; target: number; pct: number }>
  avisos: Array<{ title: string; cuando: string; amount: number | null }>
  vencimientos: Array<{ title: string; day: number; amount: number; nextMonth: boolean }>
  sinMovimientos: boolean
}

export function contextoPibbi(d: PibbiDatos): PibbiContexto {
  const mes = monthKey()
  const hoy = todayIso()
  // El nombre que se saluda es el nombre bonito, nunca el prefijo del
  // correo: "jorgecamberos200" se saluda como "Jorge".
  const nombre = nombreParaSaludo(d.meName)
  const pareja = d.partnerName ? nombreParaSaludo(d.partnerName) : null
  const patrimonio = d.accounts.reduce((acc, a) => acc + (a.type === 'deuda' || a.type === 'tarjeta' ? -a.balance : a.balance), 0)
  const { ingresos, gastos } = monthTotals(d.transactions, mes)
  const gastoHoy = d.transactions
    .filter((t) => t.type === 'gasto' && t.date === hoy)
    .reduce((s, t) => s + t.amount, 0)
  const totalBudget = d.categories.reduce((s, c) => s + c.monthly_limit, 0)
  const disponible = ingresos - gastos
  const porAsignar = Math.max(0, disponible - totalBudget)

  const mutual = d.partnerId
    ? computeMutualBalance(d.transactions, d.meId, d.partnerId, d.settlements)
    : null
  const deuda = mutual
    ? {
        deudor: mutual.debtor_id === d.meId ? 'Tú' : (pareja ?? 'Tu pareja'),
        acreedor: mutual.creditor_id === d.meId ? 'ti' : (pareja ?? 'tu pareja'),
        amount: mutual.amount,
      }
    : null

  const gastadoPorCategoria = new Map<string, number>()
  for (const t of d.transactions) {
    if (t.type === 'gasto' && t.date.startsWith(mes) && t.category_id) {
      gastadoPorCategoria.set(t.category_id, (gastadoPorCategoria.get(t.category_id) ?? 0) + t.amount)
    }
  }
  const sobres = d.categories
    .filter((c) => c.monthly_limit > 0)
    .map((c) => ({ name: c.name, gastado: gastadoPorCategoria.get(c.id) ?? 0, limite: c.monthly_limit }))
    .sort((a, b) => b.gastado - a.gastado)
    .slice(0, 3)

  const metas = d.goals.map((g) => ({
    name: g.name,
    current: g.current,
    target: g.target,
    pct: g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0,
  }))

  const avisos = d.reminders
    .filter((r) => !r.is_done && ['overdue', 'today', 'tomorrow'].includes(reminderStatus(r)))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 3)
    .map((r) => ({
      title: r.title,
      cuando: reminderStatus(r) === 'overdue' ? 'vencido' : reminderStatus(r) === 'today' ? 'hoy' : 'mañana',
      amount: r.amount,
    }))

  const vencimientos = upcomingRecurring(d.recurring).map(({ recurring: r, nextMonth }) => ({
    title: r.title,
    day: r.due_day,
    amount: r.amount,
    nextMonth,
  }))

  return {
    nombre,
    pareja,
    currency: d.currency,
    patrimonio,
    ingresosMes: ingresos,
    gastosMes: gastos,
    gastoHoy,
    disponible,
    porAsignar,
    deuda,
    sobres,
    metas,
    avisos,
    vencimientos,
    sinMovimientos: d.transactions.length === 0,
  }
}

/** Minúsculas sin acentos para comparar la pregunta sin importar cómo se escriba. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 $%?.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nombre bonito para saludar. El perfil guarda a veces el prefijo del
 * correo ("jorgecamberos200") y eso se ve horrible en el saludo.
 * Reglas: un nombre real (con espacio y sin números) se usa tal cual;
 * si no, se deriva del correo sin números ni puntos: se quitan los
 * dígitos, se parten los separadores y, si queda una sola palabra
 * pegada ("jorgecamberos"), se reconoce el nombre de pila al inicio.
 * Nunca se muestra el correo crudo ni su prefijo con números.
 */
const NOMBRES_COMUNES = [
  'Sebastián', 'Fernando', 'Alejandra', 'Francisco', 'Guillermo',
  'Valentina', 'Santiago', 'Verónica', 'Magdalena', 'Benjamín', 'Cristina',
  'Alejandro', 'Catalina', 'Montserrat', 'Guadalupe', 'Bernardo',
  'Mariana', 'Gabriela', 'Fernanda', 'Patricia', 'Virginia', 'Mauricio',
  'Leonardo', 'Federico', 'Eduardo', 'Roberto', 'Ricardo', 'Alberto',
  'Enrique', 'Gabriel', 'Martín', 'Adrián', 'César', 'Héctor', 'Iván',
  'Jesús', 'Raúl', 'Rubén', 'Tomás', 'Andrés', 'Javier', 'Miguel',
  'Daniel', 'Carlos', 'Jorge', 'José', 'Juan', 'Luis', 'Ana', 'María',
  'Pedro', 'Pablo', 'Diego', 'Manuel', 'Rafael', 'Arturo', 'Óscar',
  'Sergio', 'Víctor', 'Antonio', 'Rodrigo', 'Emilio', 'Felipe', 'Gerardo',
  'Hugo', 'Ignacio', 'Jaime', 'Joaquín', 'Julio', 'Marco', 'Nicolás',
  'Omar', 'Ramón', 'Rogelio', 'Salvador', 'Alfonso', 'Alfredo', 'Álvaro',
  'Armando', 'Cristian', 'Ernesto', 'Esteban', 'Gustavo', 'Jacobo',
  'Alicia', 'Angélica', 'Beatriz', 'Blanca', 'Carmen', 'Carolina',
  'Cecilia', 'Claudia', 'Daniela', 'Diana', 'Elena', 'Elizabeth',
  'Graciela', 'Irene', 'Isabel', 'Julieta', 'Karen', 'Laura', 'Leticia',
  'Liliana', 'Lourdes', 'Lucía', 'Marcela', 'Mercedes', 'Miriam',
  'Natalia', 'Norma', 'Olga', 'Paola', 'Pilar', 'Regina', 'Rosa',
  'Rosario', 'Sandra', 'Silvia', 'Sofía', 'Sonia', 'Susana', 'Teresa',
  'Valeria', 'Vanessa', 'Yolanda', 'Adriana',
]

function capitalizar(palabra: string): string {
  return palabra ? palabra[0].toUpperCase() + palabra.slice(1) : palabra
}

export function nombreParaSaludo(nombre: string): string {
  const limpio = (nombre ?? '').trim()
  if (!limpio) return 'pareja'
  if (limpio.toLowerCase() === 'pareja') return 'pareja'
  const local = limpio.includes('@') ? limpio.split('@')[0] : limpio
  // Nombre real: tiene espacio y ningún dígito ("Jorge Camberos").
  if (/ /.test(local) && !/\d/.test(local)) return local
  // Quitar dígitos y partir por separadores ("juan.perez99" -> Juan).
  const sinDigitos = local.replace(/\d+/g, '')
  const partes = sinDigitos.split(/[._\-+]+/).filter(Boolean)
  if (partes.length > 1) return capitalizar(partes[0].toLowerCase())
  const pegado = normalizar(partes[0] ?? '')
  if (!pegado) return 'pareja'
  // Palabra pegada ("jorgecamberos"): reconocer el nombre de pila al
  // inicio; el más largo primero para que "andrés" gane a "ana".
  const ordenados = [...NOMBRES_COMUNES].sort((a, b) => normalizar(b).length - normalizar(a).length)
  for (const n of ordenados) {
    if (pegado.startsWith(normalizar(n))) return n
  }
  return capitalizar(pegado)
}

function tiene(t: string, ...palabras: string[]): boolean {
  return palabras.some((p) => t.includes(p))
}

/**
 * Contesta una pregunta con datos reales, o null si no es una pregunta
 * que PIBBI sepa contestar (entonces el texto sigue a captura).
 * Las frases de recordatorio ("recuérdame...") devuelven null a
 * propósito: las atiende el flujo de captura, que crea el aviso.
 */
export function responderPibbi(texto: string, ctx: PibbiContexto): string | null {
  const t = normalizar(texto)
  const $ = (n: number) => formatMoney(n, ctx.currency)
  if (!t) return null

  // Saludos: contestar corto y dar el resumen en una sola línea.
  if (/^(hola|buenos dias|buenas|buenas tardes|buenas noches|hey|que tal|que onda)\b/.test(t)) {
    if (ctx.sinMovimientos) return `Hola, ${ctx.nombre}. Soy PIBBI, tu cerdito de los ahorros. ¿Qué gasto anoto hoy?`
    return `Hola, ${ctx.nombre}. Este mes llevan ${$(ctx.gastosMes)} de gastos. ¿Qué hacemos hoy?`
  }
  if (tiene(t, 'gracias')) return 'De nada. Aquí estoy para cuidar cada peso con ustedes.'
  if (tiene(t, 'que puedes hacer', 'que sabes hacer', 'ayuda', 'como funciona')) {
    return 'Puedo anotar tus gastos con texto, foto o voz, decirte cuánto tienes y cuánto gastaste, revisar tus sobres y metas, y avisarte de tus pagos. Escríbeme un gasto o pregúntame algo.'
  }

  // Saldo y patrimonio.
  if (tiene(t, 'cuanto tengo', 'cuanto hay', 'patrimonio', 'saldo total', 'cuanto tenemos', 'cuanto queda')) {
    return `En total tienen ${$(ctx.patrimonio)}. De este mes les quedan ${$(ctx.disponible)} disponibles.`
  }

  // Gasto de hoy.
  if (tiene(t, 'gaste hoy', 'gasto de hoy', 'cuanto gaste hoy', 'que gaste hoy')) {
    if (ctx.gastoHoy <= 0) return 'Hoy aún no hay gastos registrados. ¿Anoto alguno?'
    return `Hoy llevan gastados ${$(ctx.gastoHoy)}.`
  }
  // Gasto del mes.
  if (tiene(t, 'cuanto gaste', 'cuanto gastamos', 'gastos del mes', 'gasto del mes', 'cuanto llevo gastado', 'cuanto llevamos gastado')) {
    return `Este mes llevan ${$(ctx.gastosMes)} de gastos y ${$(ctx.ingresosMes)} de ingresos. Les quedan ${$(ctx.disponible)} disponibles.`
  }

  // Deuda mutua.
  if (tiene(t, 'deuda', 'quien le debe', 'quien debe', 'le debo', 'me debe', 'le deben', 'a mano', 'cuanto me debe', 'cuanto le debo')) {
    if (!ctx.pareja) return 'La deuda mutua es entre dos: cuando tu pareja se una al hogar, yo llevo la cuenta de quién le debe a quién.'
    if (!ctx.deuda) return 'Están a mano: no hay deuda mutua pendiente.'
    return `${ctx.deuda.deudor} le debe ${$(ctx.deuda.amount)} a ${ctx.deuda.acreedor}. Arriba tienes la tarjeta para liquidarla.`
  }

  // Sobres y presupuesto.
  if (tiene(t, 'sobre', 'presupuesto', 'como van los sobres', 'cuanto queda en')) {
    if (ctx.sobres.length === 0) return 'Aún no hay sobres con límite este mes. Puedes crearlos en la pestaña Presupuesto.'
    const lineas = ctx.sobres.map((s) => `${s.name}: ${$(s.gastado)} de ${$(s.limite)}`).join('. ')
    return `${lineas}. Te quedan ${$(ctx.porAsignar)} por asignar.`
  }

  // Metas.
  if (tiene(t, 'meta', 'ahorro', 'cuanto llevo ahorrado', 'como van mis metas')) {
    if (ctx.metas.length === 0) return 'Aún no hay metas. Puedes crear una en la pestaña Plan.'
    const lineas = ctx.metas.slice(0, 3).map((m) => `${m.name}: ${$(m.current)} de ${$(m.target)} (${m.pct.toFixed(0)}%)`).join('. ')
    return lineas
  }

  // Avisos y vencimientos.
  if (tiene(t, 'recordatorio', 'aviso', 'que debo pagar', 'que tengo que pagar', 'pagos pendientes', 'vencimiento', 'que vence')) {
    const partes: string[] = []
    for (const a of ctx.avisos) {
      partes.push(`${a.title} ${a.cuando}${a.amount !== null ? ` por ${$(a.amount)}` : ''}`)
    }
    for (const v of ctx.vencimientos) {
      partes.push(`día ${v.day}${v.nextMonth ? ' del próximo mes' : ''} · ${v.title} por ${$(v.amount)}`)
    }
    if (partes.length === 0) return 'No hay pagos urgentes: nada vence hoy, mañana ni vencido.'
    return `Lo próximo: ${partes.join('. ')}.`
  }

  return null
}

/**
 * Lo que PIBBI dice al abrir el chat: saludo corto y, si hay datos,
 * el resumen del mes en burbujas cortas, una idea por burbuja.
 * Máximo 3 burbujas: saludo, resumen y, solo si aplica, un aviso.
 */
export function saludoPibbi(ctx: PibbiContexto): string[] {
  const $ = (n: number) => formatMoney(n, ctx.currency)
  if (ctx.sinMovimientos) {
    return [
      `Hola, ${ctx.nombre}. Soy PIBBI, tu cerdito de los ahorros.`,
      'Aún no hay movimientos. Escríbeme un gasto, mándame la foto de un ticket o dicta una nota de voz y yo lo anoto.',
    ]
  }
  const mensajes = [
    `Hola, ${ctx.nombre}. Soy PIBBI, tu cerdito de los ahorros.`,
    `Este mes llevan ${$(ctx.gastosMes)} de gastos y ${$(ctx.ingresosMes)} de ingresos. Les quedan ${$(ctx.disponible)} disponibles.`,
  ]
  if (ctx.deuda) {
    mensajes.push(`${ctx.deuda.deudor} le debe ${$(ctx.deuda.amount)} a ${ctx.deuda.acreedor}.`)
  } else if (ctx.avisos.length > 0) {
    const a = ctx.avisos[0]
    mensajes.push(`Ojo: ${a.title} ${a.cuando}${a.amount !== null ? ` por ${$(a.amount)}` : ''}.`)
  }
  return mensajes
}
