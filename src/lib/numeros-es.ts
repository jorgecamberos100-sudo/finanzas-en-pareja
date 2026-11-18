/**
 * Montos en palabras -> dígitos, en español (es-MX).
 *
 * "gasté doscientos cincuenta en el súper" -> "gasté 250 en el súper"
 * "pagué mil quinientos de renta"          -> "pagué 1500 de renta"
 * "treinta y cinco"                        -> "35"
 * "doscientos cincuenta con cincuenta centavos" -> "250.50"
 *
 * Solo convierte corridas de palabras numéricas; el resto del texto se
 * conserva intacto (mayúsculas, acentos, comas). Los artículos sueltos
 * ("un café") NO se convierten: no son un monto. El resultado se pasa al
 * parser local existente (lib/capture.ts), que ya sabe filtrar fechas,
 * años y cantidades ("2 cosas"). Lógica pura, sin DOM: se prueba en Node.
 */

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9,
}
const ESPECIALES: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
}
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
  seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
}
const PALABRAS = new Set<string>([
  ...Object.keys(UNIDADES), ...Object.keys(ESPECIALES), ...Object.keys(DECENAS),
  ...Object.keys(CENTENAS), 'mil', 'millon', 'millones', 'y',
])
/** Palabras que sueltas son ambiguas (artículos) o vagas: no se convierten. */
const AMBIGUAS_SUeltas = new Set(['un', 'una', 'uno', 'cero', 'millon', 'millones'])

function sinAcentos(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Valor de una corrida de palabras numéricas, o null si no es válida. */
function valorSecuencia(tokens: string[]): number | null {
  let total = 0
  let actual = 0
  let hubo = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'y') {
      // "y" solo vale entre decena y unidad: "treinta y cinco".
      const prev = tokens[i - 1]
      const next = tokens[i + 1]
      if (!prev || !(prev in DECENAS) || !next || !(next in UNIDADES)) return null
      continue
    }
    if (t in CENTENAS) actual += CENTENAS[t]
    else if (t in ESPECIALES) actual += ESPECIALES[t]
    else if (t in DECENAS) actual += DECENAS[t]
    else if (t in UNIDADES) actual += UNIDADES[t]
    else if (t === 'mil') { total += (actual || 1) * 1000; actual = 0 }
    else if (t === 'millon' || t === 'millones') { total += (actual || 1) * 1_000_000; actual = 0 }
    else return null
    hubo = true
  }
  if (!hubo) return null
  return total + actual
}

interface Token { ini: number; fin: number; clave: string }

/** Convierte los montos en palabras a dígitos, conservando el resto del texto. */
export function montosEnPalabrasADigitos(texto: string): string {
  // 1. Localizar palabras numéricas con sus offsets en el texto original.
  const tokens: Token[] = []
  const rePalabra = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g
  let m: RegExpExecArray | null
  while ((m = rePalabra.exec(texto)) !== null) {
    const clave = sinAcentos(m[0])
    if (PALABRAS.has(clave)) tokens.push({ ini: m.index, fin: m.index + m[0].length, clave })
  }
  // 2. Agrupar palabras consecutivas separadas solo por espacios.
  const corridas: Token[][] = []
  for (const t of tokens) {
    const ultima = corridas[corridas.length - 1]
    if (ultima && /^\s+$/.test(texto.slice(ultima[ultima.length - 1].fin, t.ini))) ultima.push(t)
    else corridas.push([t])
  }
  // 3. Evaluar cada corrida y reemplazar las válidas.
  const reemplazos: Array<{ ini: number; fin: number; texto: string }> = []
  for (const corrida of corridas) {
    let seq = corrida.map((t) => t.clave)
    let fin = corrida[corrida.length - 1].fin
    while (seq.length > 0 && seq[seq.length - 1] === 'y') {
      seq = seq.slice(0, -1)
      fin = seq.length > 0 ? corrida[seq.length - 1].fin : corrida[0].fin
    }
    if (seq.length === 0) continue
    if (seq[0] === 'y') continue
    if (seq.length === 1 && AMBIGUAS_SUeltas.has(seq[0])) continue
    const v = valorSecuencia(seq)
    if (v === null || v > 9_999_999) continue
    reemplazos.push({ ini: corrida[0].ini, fin, texto: String(v) })
  }
  let resultado = texto
  for (const r of reemplazos.sort((a, b) => b.ini - a.ini)) {
    resultado = resultado.slice(0, r.ini) + r.texto + resultado.slice(r.fin)
  }
  // 4. Decimales en palabras: "250 con 50 (centavos)" / "250 punto 50" -> 250.50
  resultado = resultado.replace(
    /\b(\d+)\s*(?:pesos|mxn|varos)?\s+(?:con|punto)\s+(\d{1,2})\s*(?:centavos)?\b/gi,
    '$1.$2',
  )
  return resultado
}