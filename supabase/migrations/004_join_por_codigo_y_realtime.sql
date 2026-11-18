-- 004: unirse al hogar con código de invitación + Realtime para liquidaciones y miembros.
--
-- Problema: la política RLS de `households` solo deja ver el hogar a quien ya es
-- miembro, así que la pareja que intentaba unirse con el código de invitación
-- recibía siempre "Código inválido" (el SELECT por invite_code devolvía 0 filas).
-- La solución NO es abrir la política (cualquier usuario autenticado podría leer
-- todos los hogares y sus códigos): se usa una función SECURITY DEFINER que solo
-- devuelve el id del hogar que coincide con el código, sin exponer el código
-- ni ningún otro dato del hogar.
-- Además se añaden `money_dates` (liquidaciones) y `household_members` a la
-- publicación de Realtime, para que ambos teléfonos se enteren en vivo.
--
-- NOTA: esta migración debe aplicarse en Supabase (Dashboard > SQL o Management
-- API) y NO se aplica sola con el deploy de Vercel.

create or replace function public.find_household_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.households
  where invite_code = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.find_household_by_code(text) to authenticated;

alter publication supabase_realtime add table public.money_dates;
alter publication supabase_realtime add table public.household_members;
