-- Finanzas en Pareja — migración 002: recordatorios y notificaciones de pagos
-- Nueva tabla `reminders` (distinta de `recurring`): `recurring` solo guarda
-- gastos fijos mensuales (título, monto, due_day), sin fecha concreta, sin
-- hora y sin estado de hecho/pendiente. Un recordatorio es un pago futuro
-- concreto (único o recurrente) con fecha, hora opcional y aviso.
-- También `push_subscriptions`: suscripciones Web Push por usuario/dispositivo
-- para avisar aunque la app esté cerrada (Edge Function reminders-push).
-- Aplicar: `supabase db push` o pegar en el SQL Editor de Supabase.

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references public.users (id),
  title text not null,
  amount numeric(14, 2),
  due_date date not null,
  due_time time,
  recurrence text not null default 'once' check (recurrence in ('once', 'daily', 'weekly', 'monthly', 'yearly')),
  category_id uuid references public.categories (id) on delete set null,
  recurring_id uuid references public.recurring (id) on delete set null,
  note text,
  -- Zona horaria del dispositivo que creó el recordatorio (ej. "America/Tijuana").
  -- El aviso se dispara en esa zona, nunca en UTC ni en una hardcodeada.
  timezone text not null default 'America/Tijuana',
  is_done boolean not null default false,
  done_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index idx_reminders_household_due on public.reminders (household_id, due_date);
create index idx_reminders_household_done on public.reminders (household_id, is_done);
create index idx_push_subs_household on public.push_subscriptions (household_id);

alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

-- Recordatorios: ambos miembros del hogar los ven, crean, editan y marcan.
create policy "reminders: miembros" on public.reminders for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Suscripciones push: cada quien solo ve y gestiona las suyas.
create policy "push_subscriptions: ver las mías" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "push_subscriptions: crear las mías" on public.push_subscriptions for insert with check (user_id = auth.uid() and public.is_member(household_id));
create policy "push_subscriptions: borrar las mías" on public.push_subscriptions for delete using (user_id = auth.uid());

-- Realtime: que un recordatorio nuevo o marcado como hecho llegue al instante al otro teléfono.
alter publication supabase_realtime add table public.reminders;
