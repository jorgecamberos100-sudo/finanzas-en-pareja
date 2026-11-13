export type Role = 'admin' | 'miembro'
export type AccountType = 'efectivo' | 'banco' | 'tarjeta' | 'deuda'
export type Visibility = 'compartida' | 'solo_saldo' | 'privada'
export type TxType = 'gasto' | 'ingreso' | 'transferencia'
export type ReviewStatus = 'pendiente' | 'aprobado'

export interface UserProfile {
  id: string
  name: string
  email: string
}

export interface Household {
  id: string
  name: string
  currency: string // 'MXN' por defecto
  default_split: number // % que paga el usuario 1 por defecto (50)
  invite_code: string
  created_at: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  role: Role
  user?: UserProfile
}

export interface Account {
  id: string
  household_id: string
  owner_id: string
  name: string
  type: AccountType
  visibility: Visibility
  balance: number // en centavos no; en unidades de moneda (MXN). Ver format.ts
  created_at: string
}

export interface Category {
  id: string
  household_id: string
  group: string
  name: string
  icon: string
  monthly_limit: number
  rollover: boolean
}

export interface Transaction {
  id: string
  household_id: string
  account_id: string
  category_id: string | null
  created_by: string
  paid_by: string
  type: TxType
  amount: number
  date: string // YYYY-MM-DD
  merchant: string | null
  note: string | null
  /** % del gasto que asume paid_by (50 = 50/50). 100 = lo absorbe todo. */
  split_pct: number
  visibility: Visibility
  review_status: ReviewStatus
  dedupe_hash: string | null
  created_at: string
}

export interface Rule {
  id: string
  household_id: string
  pattern: string // texto del comercio, en minúsculas
  category_id: string
}

export interface Recurring {
  id: string
  household_id: string
  title: string
  amount: number
  due_day: number // 1-31
  category_id: string | null
  account_id: string | null
  active: boolean
}

export interface Goal {
  id: string
  household_id: string
  name: string
  target: number
  current: number
  due_date: string | null
}

export interface GoalContribution {
  id: string
  goal_id: string
  user_id: string
  amount: number
  date: string
}

export interface MoneyDate {
  id: string
  household_id: string
  date: string
  notes: string | null
  settled_amount: number
}

/** Deuda mutua calculada: positive => userA le debe a userB */
export interface MutualBalance {
  debtor_id: string
  creditor_id: string
  amount: number
}
