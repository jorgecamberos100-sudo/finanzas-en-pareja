/**
 * Crear el hogar del Onboarding vía la RPC SECURITY DEFINER
 * `create_household` (migración 006).
 *
 * El INSERT directo con `.select()` NO funciona: la política INSERT de
 * `households` es `with check (true)` pero el RETURNING se evalúa contra
 * la política SELECT (`is_member(id)`) y el usuario aún no es miembro
 * (la fila en `household_members` se insertaba después) — Postgres
 * rechaza con "new row violates row-level security policy". La RPC crea
 * el hogar y agrega al creador como admin en una sola transacción y
 * devuelve el id y el código de invitación.
 *
 * El cliente se inyecta (interfaz mínima) para poder probar este camino
 * en Node con un mock de `rpc`.
 */

export interface HogarCreado {
  id: string
  invite_code: string
}

export interface ClienteRpc {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type ResultadoCrearHogar =
  | { ok: true; hogar: HogarCreado }
  | { ok: false; error: string }

/**
 * Crea el hogar (solo: reparto 100; en pareja: 50). Nunca lanza: el
 * error llega como `{ ok: false, error }` en español cuando es posible.
 */
export async function crearHogar(
  cliente: ClienteRpc,
  opts: { name: string; currency?: string; defaultSplit?: number },
): Promise<ResultadoCrearHogar> {
  try {
    const { data, error } = await cliente.rpc('create_household', {
      p_name: opts.name,
      p_currency: opts.currency ?? 'MXN',
      p_default_split: opts.defaultSplit ?? 50,
    })
    if (error) return { ok: false, error: error.message }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { id?: unknown; invite_code?: unknown }
      | undefined
    if (typeof row?.id !== 'string' || typeof row?.invite_code !== 'string') {
      return { ok: false, error: 'No se pudo crear el hogar.' }
    }
    return { ok: true, hogar: { id: row.id, invite_code: row.invite_code } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear el hogar.' }
  }
}
