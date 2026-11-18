-- 006: crear el hogar con una RPC SECURITY DEFINER.
--
-- Problema (en vivo, 2026-11-17): el Onboarding creaba el hogar con un
-- INSERT directo y `.select()`. El INSERT pasa (la política de households
-- es `with check (true)`), pero el RETURNING se evalúa contra la política
-- SELECT de `households`, que exige ser miembro (`is_member(id)`), y el
-- usuario AÚN NO es miembro (la fila en `household_members` se insertaba
-- en el siguiente statement). Postgres rechaza con:
--   "new row violates row-level security policy for table households"
-- y el usuario no puede avanzar del paso 2 del Onboarding.
-- La solución NO es abrir la política SELECT (cualquier usuario autenticado
-- podría leer todos los hogares y sus códigos de invitación): una función
-- SECURITY DEFINER crea el hogar Y agrega al creador como admin en una
-- sola transacción, y devuelve solo el id y el código del hogar creado.
-- Sigue el patrón de la migración 004 (`find_household_by_code`).
--
-- NOTA: esta migración debe aplicarse en Supabase (Dashboard > SQL o Management
-- API) y NO se aplica sola con el deploy de Vercel.

create or replace function public.create_household(
  p_name text,
  p_currency text default 'MXN',
  p_default_split int default 50
)
returns table (id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_id uuid;
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre del hogar no puede estar vacío' using errcode = '23514';
  end if;
  if p_default_split < 0 or p_default_split > 100 then
    raise exception 'El reparto debe estar entre 0 y 100' using errcode = '23514';
  end if;

  -- Código de invitación de 6 caracteres (hex en mayúsculas), con reintento
  -- ante colisión de unique (máx 5 intentos).
  loop
    v_tries := v_tries + 1;
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into public.households (name, currency, default_split, invite_code)
      values (btrim(p_name), coalesce(p_currency, 'MXN'), p_default_split, v_code)
      returning households.id into v_id;
      exit;
    exception when unique_violation then
      if v_tries >= 5 then
        raise exception 'No se pudo generar un código de invitación único' using errcode = '23505';
      end if;
      -- reintenta con otro código
    end;
  end loop;

  -- Por si la fila en public.users no existe (el upsert del registro es
  -- fire-and-forget): sin ella el insert de miembro fallaría por FK.
  -- OJO: las columnas van calificadas (u.id, u.email) porque `id` también
  -- es un parámetro OUT de la función y plpgsql sustituiría el nombre
  -- sin calificar por la variable. Por el mismo motivo el conflicto se
  -- resuelve por el nombre de la restricción y NO por `on conflict (id)`:
  -- ese `id` sin calificar es ambiguo para plpgsql (error 42702) y la RPC
  -- fallaba en vivo antes de insertar nada.
  insert into public.users (id, name, email)
  select u.id, split_part(u.email, '@', 1), u.email from auth.users u where u.id = v_uid
  on conflict on constraint users_pkey do nothing;

  insert into public.household_members (household_id, user_id, role)
  values (v_id, v_uid, 'admin');

  return query select v_id, v_code;
end;
$$;

revoke execute on function public.create_household(text, text, int) from public;
grant execute on function public.create_household(text, text, int) to authenticated;
