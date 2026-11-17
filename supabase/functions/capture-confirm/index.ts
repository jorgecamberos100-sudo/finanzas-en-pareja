// capture-confirm — Supabase Edge Function (Deno).
// Escribe en `transactions` SOLO tras confirmación explícita del usuario.
// La IA nunca llama a esta función por sí sola: la llama el frontend
// cuando el usuario pulsa "Confirmar y guardar" en una tarjeta propuesta.
// Resuelve payer 'current_user'/'partner' al ID real del usuario autenticado,
// calcula dedupe_hash (fecha|monto|comercio|cuenta) y respeta RLS:
// el insert se hace con el JWT del usuario, nunca con service_role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { dedupeHash, jsonResponse, todayIsoMexico } from '../_shared/capture.ts'

interface ConfirmEntry {
  type: 'gasto' | 'ingreso' | 'transferencia'
  amount_minor: number
  merchant?: string | null
  category_id?: string | null
  account_id: string
  /** 'current_user' | 'partner' | un UUID de usuario del hogar */
  paid_by: string
  date?: string
  note?: string | null
  split_pct?: number
  visibility?: 'compartida' | 'solo_saldo' | 'privada'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return jsonResponse({ error: 'Falta el token de sesión' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Sesión inválida' }, 401)

  let body: { household_id?: unknown; entries?: unknown }
  try {
    body = (await req.json()) as { household_id?: unknown; entries?: unknown }
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido' }, 400)
  }
  const householdId = typeof body.household_id === 'string' ? body.household_id : ''
  const entries = Array.isArray(body.entries) ? (body.entries as ConfirmEntry[]) : []
  if (!householdId || entries.length === 0 || entries.length > 20) {
    return jsonResponse({ error: 'household_id y entre 1 y 20 entradas son obligatorios' }, 400)
  }

  // Solo miembros del hogar pueden escribir en él.
  const { data: members, error: memberError } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
  if (memberError || !members) return jsonResponse({ error: 'No se pudo verificar el hogar' }, 500)
  const memberIds = (members as Array<{ user_id: string }>).map((m) => m.user_id)
  if (!memberIds.includes(user.id)) return jsonResponse({ error: 'No eres miembro de este hogar' }, 403)
  const partnerId = memberIds.find((id) => id !== user.id) ?? user.id

  const inserted: string[] = []
  const duplicates: number[] = []
  const errors: string[] = []

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const amountMinor = Number(e.amount_minor)
    if (!e || !Number.isFinite(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) {
      errors.push(`Entrada ${i + 1}: monto inválido`)
      continue
    }
    if (!e.account_id || typeof e.account_id !== 'string') {
      errors.push(`Entrada ${i + 1}: falta la cuenta`)
      continue
    }
    const type = e.type === 'ingreso' || e.type === 'transferencia' ? e.type : 'gasto'
    if (type !== 'transferencia' && !e.category_id) {
      errors.push(`Entrada ${i + 1}: falta la categoría`)
      continue
    }
    const date =
      typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayIsoMexico()
    const paidBy = e.paid_by === 'partner' ? partnerId : e.paid_by === 'current_user' ? user.id : e.paid_by
    if (!memberIds.includes(paidBy)) {
      errors.push(`Entrada ${i + 1}: quién pagó no es del hogar`)
      continue
    }
    const amount = Math.round(amountMinor) / 100
    const merchant = typeof e.merchant === 'string' && e.merchant.trim() ? e.merchant.trim().slice(0, 120) : ''
    const hash = await dedupeHash({ date, amount, merchant, account_id: e.account_id })
    const { data: insertedRow, error } = await supabase
      .from('transactions')
      .insert({
        household_id: householdId,
        account_id: e.account_id,
        category_id: type === 'transferencia' ? null : e.category_id,
        created_by: user.id,
        paid_by: type === 'ingreso' ? user.id : paidBy,
        type,
        amount,
        date,
        merchant: merchant || null,
        note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 300) : null,
        // Las transferencias no se dividen ni generan deuda mutua.
        split_pct: type === 'transferencia' ? 100 : Math.min(100, Math.max(0, Number(e.split_pct ?? 50) || 50)),
        visibility: e.visibility === 'solo_saldo' || e.visibility === 'privada' ? e.visibility : 'compartida',
        review_status: 'aprobado',
        dedupe_hash: hash,
      })
      .select('id')
      .single()
    if (error) {
      // unique (household_id, dedupe_hash): ya estaba guardado, no es error fatal.
      if (error.code === '23505') duplicates.push(i + 1)
      else errors.push(`Entrada ${i + 1}: ${error.message}`)
      continue
    }
    if (insertedRow) inserted.push(insertedRow.id as string)
  }

  return jsonResponse({ inserted, duplicates, errors, inserted_count: inserted.length })
})
