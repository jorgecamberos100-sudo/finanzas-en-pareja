import type { MoneyDate, Transaction } from '../types'

export type SplitMode = '50/50' | 'personalizado' | 'absorbe_todo'

/**
 * Cuánto le debe cada persona por un gasto.
 * split_pct = % que asume quien pagó (paid_by).
 * - 50/50: split_pct = 50
 * - personalizado: split_pct = % elegido (0-100)
 * - absorbe_todo: split_pct = 100 (quien pagó lo absorbe; nadie le debe nada)
 * Devuelve el monto que la OTRA persona le debe a paid_by.
 */
export function owedByOther(tx: Pick<Transaction, 'amount' | 'split_pct' | 'type'>): number {
  if (tx.type !== 'gasto') return 0
  const otherShare = (100 - tx.split_pct) / 100
  return Math.round(tx.amount * otherShare * 100) / 100
}

export function splitPctFor(mode: SplitMode, customPct: number): number {
  if (mode === '50/50') return 50
  if (mode === 'absorbe_todo') return 100
  return Math.min(100, Math.max(0, customPct))
}

/**
 * Saldo mutuo de un hogar a partir de todos sus gastos.
 * Solo importan los gastos (las transferencias entre cuentas propias
 * NO generan deuda: no cuentan aquí ni en reportes de gasto).
 * Las liquidaciones (money_dates con settled_amount > 0, lo que registra
 * "Liquidar ahora") restan del saldo: antes no se cargaban ni se
 * consideraban, así que la deuda reaparecía tras liquidar. Los money_dates
 * de revisión (settled_amount = 0) no afectan el saldo. Una liquidación
 * nunca invierte el sentido de la deuda: solo la lleva a cero.
 * Devuelve { debtor_id, creditor_id, amount } o null si están a mano.
 */
export function computeMutualBalance(
  transactions: Pick<Transaction, 'amount' | 'paid_by' | 'split_pct' | 'type'>[],
  userA: string,
  userB: string,
  settlements?: Array<Pick<MoneyDate, 'settled_amount'>>,
): { debtor_id: string; creditor_id: string; amount: number } | null {
  let aOwesB = 0 // lo que A le debe a B
  for (const tx of transactions) {
    if (tx.type !== 'gasto') continue
    const owed = owedByOther(tx)
    if (tx.paid_by === userA) aOwesB -= owed // B le debe a A
    else if (tx.paid_by === userB) aOwesB += owed // A le debe a B
  }
  const settled = (settlements ?? []).reduce((s, r) => s + (r.settled_amount ?? 0), 0)
  const amount = Math.max(0, Math.round((Math.abs(aOwesB) - settled) * 100) / 100)
  if (amount < 0.01) return null
  return aOwesB > 0
    ? { debtor_id: userA, creditor_id: userB, amount }
    : { debtor_id: userB, creditor_id: userA, amount }
}

/** Ingresos y gastos del mes, EXCLUYENDO transferencias. */
export function monthTotals(
  transactions: Pick<Transaction, 'amount' | 'date' | 'type'>[],
  month: string, // 'YYYY-MM'
): { ingresos: number; gastos: number } {
  let ingresos = 0
  let gastos = 0
  for (const tx of transactions) {
    if (!tx.date.startsWith(month)) continue
    if (tx.type === 'ingreso') ingresos += tx.amount
    else if (tx.type === 'gasto') gastos += tx.amount
    // 'transferencia' no cuenta como gasto ni como ingreso
  }
  return { ingresos: Math.round(ingresos * 100) / 100, gastos: Math.round(gastos * 100) / 100 }
}

/** Ritmo esperado de una meta a la fecha actual: (días transcurridos / días totales). */
export function expectedProgress(goal: { target: number; due_date: string | null; created_at?: string }, now = new Date()): number {
  if (!goal.due_date) return 0
  const start = goal.created_at ? new Date(goal.created_at) : new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(`${goal.due_date}T12:00:00`)
  if (end <= start) return 1
  const pct = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())
  return Math.min(1, Math.max(0, pct))
}
