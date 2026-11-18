-- 005: planes (Free / Plus / Fundadores) + contador mensual de capturas con IA.
--
-- Modelo de negocio decidido (nov 2026, aceptado por George y confirmado por
-- investigación de competencia verificada en vivo: rango realista $49-99/mes):
--   Free:       $0 — captura manual + chat de texto ilimitado;
--               10 capturas con IA al mes; 3 sobres; 1 meta; historial 90 días;
--               sin exportar CSV.
--   Plus:       $59 MXN/mes o $399 MXN/año por hogar — IA ilimitada con uso
--               justo de 300 capturas/mes; sobres y metas ilimitados;
--               historial completo + exportar CSV.
--   Fundadores: $699 MXN pago único de por vida, solo los primeros 100 hogares
--               (mismos límites que Plus).
--
-- La tabla guarda el plan del hogar y el contador del mes en curso.
-- El contador lo incrementa SOLO la función SECURITY DEFINER
-- `increment_ai_capture` (la llama el cliente tras confirmar una captura y
-- la Edge Function capture-confirm tras insertar): el cliente nunca escribe
-- el contador directo, así que no se puede reiniciar a mano desde la app.
-- La función es atómica (bloqueo de fila): dos teléfonos confirmando a la
-- vez no pueden pasar el límite por una carrera; si cambió el mes, el
-- contador se reinicia solo. El mes se calcula en hora del servidor
-- (UTC en Supabase); el cliente trata una fila con mes viejo como 0 usadas.
--
-- `set_household_plan` es la activación MANUAL del plan (para pruebas y
-- para activar Plus/Fundadores a mano hasta que Stripe esté conectado):
-- solo el admin del hogar puede llamarla, y Fundadores asigna el siguiente
-- número del 1 al 100 (si ya están los 100, rechaza). Cuando Stripe se
-- conecte, su webhook (service_role) será quien escriba el plan; esta
-- función queda como vía manual documentada.
--
-- NOTA: aplicar en Supabase (Dashboard > SQL o Management API) como la 004.
-- No se aplica sola con el deploy de Vercel. La app degrada con gracia si
-- la tabla aún no existe: sin fila de plan, el hogar se trata como Free.

create table public.household_plan (
  household_id uuid primary key references public.households (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus', 'fundadores')),
  started_at timestamptz not null default now(),
  ai_captures_month integer not null default 0 check (ai_captures_month >= 0),
  ai_captures_month_key text not null default to_char(now(), 'YYYY-MM'),
  founders_number integer null check (founders_number is null or (founders_number >= 1 and founders_number <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.household_plan enable row level security;

-- Lectura: solo miembros del hogar. Sin políticas de insert/update/delete:
-- todas las escrituras pasan por las funciones SECURITY DEFINER de abajo,
-- que verifican membresía (y rol admin para cambiar de plan).
create policy "household_plan: ver mi hogar" on public.household_plan
  for select using (public.is_member(household_id));

-- Límite de capturas con IA por plan (uso justo de Plus/Fundadores: 300/mes).
create or replace function public.ai_captures_limit(p_plan text)
returns integer
language sql immutable as $$
  select case p_plan when 'plus' then 300 when 'fundadores' then 300 else 10 end;
$$;

-- Suma 1 captura con IA al contador mensual del hogar (crea la fila si no
-- existe, con plan Free). Si cambió el mes, el contador se reinicia.
-- Devuelve si la captura cabe dentro del límite del plan, cuántas lleva
-- usadas, el límite y el plan.
create or replace function public.increment_ai_capture(p_household_id uuid)
returns table (allowed boolean, used integer, limit_captures integer, plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_used integer;
  v_key text;
  v_limit integer;
  v_now_key text := to_char(now(), 'YYYY-MM');
begin
  if not public.is_member(p_household_id) then
    raise exception 'No eres miembro de este hogar';
  end if;
  insert into public.household_plan (household_id)
  values (p_household_id)
  on conflict (household_id) do nothing;
  select hp.plan, hp.ai_captures_month, hp.ai_captures_month_key
    into v_plan, v_used, v_key
    from public.household_plan hp
   where hp.household_id = p_household_id
     for update;
  if v_key <> v_now_key then
    v_used := 0;
    v_key := v_now_key;
  end if;
  v_limit := public.ai_captures_limit(v_plan);
  if v_used >= v_limit then
    update public.household_plan
       set ai_captures_month = v_used, ai_captures_month_key = v_key, updated_at = now()
     where household_id = p_household_id;
    return query select false, v_used, v_limit, v_plan;
    return;
  end if;
  v_used := v_used + 1;
  update public.household_plan
     set ai_captures_month = v_used, ai_captures_month_key = v_key, updated_at = now()
   where household_id = p_household_id;
  return query select true, v_used, v_limit, v_plan;
end;
$$;

grant execute on function public.increment_ai_capture(uuid) to authenticated;
grant execute on function public.ai_captures_limit(text) to authenticated;

-- Activa un plan a mano (pruebas / activación manual hasta conectar Stripe).
-- Solo el admin del hogar. Fundadores asigna el siguiente número del 1 al
-- 100 y conserva el número si el hogar ya es Fundador; si ya están los 100,
-- rechaza. Al cambiar de plan el contador del mes se conserva (lo ya usado
-- este mes sigue contando).
create or replace function public.set_household_plan(p_household_id uuid, p_plan text)
returns table (plan text, founders_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_founders integer := null;
begin
  if p_plan not in ('free', 'plus', 'fundadores') then
    raise exception 'Plan inválido';
  end if;
  if not public.is_admin(p_household_id) then
    raise exception 'Solo el admin del hogar puede cambiar el plan';
  end if;
  -- Si el hogar ya es Fundador, conserva su número.
  select hp.founders_number into v_founders from public.household_plan hp
   where hp.household_id = p_household_id and hp.plan = 'fundadores';
  if p_plan = 'fundadores' and v_founders is null then
    select coalesce(max(hp.founders_number), 0) + 1 into v_founders from public.household_plan hp;
    if v_founders > 100 then
      raise exception 'Ya no quedan lugares de Fundadores (100)';
    end if;
  end if;
  insert into public.household_plan (household_id, plan, started_at, founders_number)
  values (p_household_id, p_plan, now(), v_founders)
  on conflict (household_id) do update
    set plan = excluded.plan,
        started_at = now(),
        founders_number = case when excluded.plan = 'fundadores' then v_founders else null end,
        updated_at = now();
  return query select p_plan, v_founders;
end;
$$;

grant execute on function public.set_household_plan(uuid, text) to authenticated;

-- Realtime: que el contador y el plan se actualicen en ambos teléfonos.
alter publication supabase_realtime add table public.household_plan;
