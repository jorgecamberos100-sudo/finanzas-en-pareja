-- Finanzas en Pareja — migración inicial
-- PostgreSQL + RLS. Cada usuario solo accede a los datos de su hogar;
-- lo privado solo lo ve su dueño. Sin conexión bancaria: todo es manual + CSV.
-- Aplicar en Supabase: SQL Editor, o `supabase db push` con la CLI.

create extension if not exists "pgcrypto";

-- ============ Tablas ============

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'MXN',
  default_split int not null default 50 check (default_split between 0 and 100),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'miembro' check (role in ('admin', 'miembro')),
  primary key (household_id, user_id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('efectivo', 'banco', 'tarjeta', 'deuda')),
  visibility text not null default 'compartida' check (visibility in ('compartida', 'solo_saldo', 'privada')),
  balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  "group" text not null,
  name text not null,
  icon text not null default '💰',
  monthly_limit numeric(14, 2) not null default 0,
  rollover boolean not null default false
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  created_by uuid not null references public.users (id),
  paid_by uuid not null references public.users (id),
  type text not null check (type in ('gasto', 'ingreso', 'transferencia')),
  amount numeric(14, 2) not null check (amount > 0),
  date date not null,
  merchant text,
  note text,
  split_pct int not null default 50 check (split_pct between 0 and 100),
  visibility text not null default 'compartida' check (visibility in ('compartida', 'solo_saldo', 'privada')),
  review_status text not null default 'pendiente' check (review_status in ('pendiente', 'aprobado')),
  dedupe_hash text,
  created_at timestamptz not null default now(),
  unique (household_id, dedupe_hash)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  pattern text not null,
  category_id uuid not null references public.categories (id) on delete cascade,
  unique (household_id, pattern)
);

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  amount numeric(14, 2) not null check (amount > 0),
  due_day int not null check (due_day between 1 and 31),
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  active boolean not null default true
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  target numeric(14, 2) not null check (target > 0),
  current numeric(14, 2) not null default 0,
  due_date date,
  created_at timestamptz not null default now()
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.users (id),
  amount numeric(14, 2) not null check (amount > 0),
  date date not null
);

create table public.money_dates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date date not null,
  notes text,
  settled_amount numeric(14, 2) not null default 0
);

-- Índices para las consultas habituales (historial, presupuesto del mes, dedupe)
create index idx_tx_household_date on public.transactions (household_id, date desc);
create index idx_tx_category on public.transactions (category_id);
create index idx_tx_dedupe on public.transactions (household_id, dedupe_hash);
create index idx_accounts_household on public.accounts (household_id);
create index idx_categories_household on public.categories (household_id);
create index idx_goals_household on public.goals (household_id);

-- ============ RLS ============
-- Helper: ¿el usuario actual es miembro de este hogar?
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from public.household_members m where m.household_id = h and m.user_id = auth.uid());
$$;

create or replace function public.is_admin(h uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from public.household_members m where m.household_id = h and m.user_id = auth.uid() and m.role = 'admin');
$$;

alter table public.users enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.rules enable row level security;
alter table public.recurring enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.money_dates enable row level security;

-- users: cada quien ve su propio perfil y el de su compañero de hogar
create policy "users: ver perfil propio y de mi hogar" on public.users for select using (
  id = auth.uid() or exists (
    select 1 from public.household_members m1
    join public.household_members m2 on m1.household_id = m2.household_id
    where m1.user_id = auth.uid() and m2.user_id = users.id
  )
);
create policy "users: crear/actualizar perfil propio" on public.users for all using (id = auth.uid()) with check (id = auth.uid());

-- households: solo miembros; crear es libre (el onboarding crea el hogar y luego agrega al miembro)
create policy "households: ver si soy miembro" on public.households for select using (public.is_member(id));
create policy "households: crear hogar" on public.households for insert with check (true);
create policy "households: actualizar solo admin" on public.households for update using (public.is_admin(id)) with check (public.is_admin(id));
create policy "households: eliminar solo admin" on public.households for delete using (public.is_admin(id));

-- household_members: ver miembros de mi hogar; agregar solo admin (o uno mismo al unirse con código)
create policy "members: ver mi hogar" on public.household_members for select using (public.is_member(household_id));
create policy "members: unirse o invitar" on public.household_members for insert with check (
  user_id = auth.uid() or public.is_admin(household_id)
);
create policy "members: quitar solo admin" on public.household_members for delete using (public.is_admin(household_id));

-- accounts: miembro ve cuentas compartidas y solo_saldo; las privadas SOLO su dueño.
-- (solo_saldo: la fila es visible, pero el saldo detallado se oculta en la UI; el RLS garantiza que lo privado ni siquiera se lee.)
create policy "accounts: ver según visibilidad" on public.accounts for select using (
  public.is_member(household_id) and (visibility in ('compartida', 'solo_saldo') or owner_id = auth.uid())
);
create policy "accounts: crear si soy miembro" on public.accounts for insert with check (public.is_member(household_id) and owner_id = auth.uid());
create policy "accounts: editar dueño o admin" on public.accounts for update using (
  public.is_member(household_id) and (owner_id = auth.uid() or public.is_admin(household_id))
) with check (public.is_member(household_id) and (owner_id = auth.uid() or public.is_admin(household_id)));
create policy "accounts: eliminar dueño o admin" on public.accounts for delete using (
  public.is_member(household_id) and (owner_id = auth.uid() or public.is_admin(household_id))
);

-- categories, rules, recurring, goals, money_dates: solo miembros del hogar
create policy "categories: miembros" on public.categories for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "rules: miembros" on public.rules for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "recurring: miembros" on public.recurring for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "goals: miembros" on public.goals for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "money_dates: miembros" on public.money_dates for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- transactions: miembro ve las compartidas; las privadas SOLO quien las creó / pagó.
create policy "transactions: ver según visibilidad" on public.transactions for select using (
  public.is_member(household_id) and (visibility in ('compartida', 'solo_saldo') or created_by = auth.uid() or paid_by = auth.uid())
);
create policy "transactions: crear si soy miembro" on public.transactions for insert with check (
  public.is_member(household_id) and created_by = auth.uid()
);
create policy "transactions: editar creador o admin" on public.transactions for update using (
  public.is_member(household_id) and (created_by = auth.uid() or public.is_admin(household_id))
) with check (public.is_member(household_id) and (created_by = auth.uid() or public.is_admin(household_id)));
create policy "transactions: eliminar creador o admin" on public.transactions for delete using (
  public.is_member(household_id) and (created_by = auth.uid() or public.is_admin(household_id))
);

-- goal_contributions: solo si la meta es de mi hogar
create policy "goal_contributions: ver mi hogar" on public.goal_contributions for select using (
  exists (select 1 from public.goals g where g.id = goal_id and public.is_member(g.household_id))
);
create policy "goal_contributions: aportar yo" on public.goal_contributions for insert with check (
  user_id = auth.uid() and exists (select 1 from public.goals g where g.id = goal_id and public.is_member(g.household_id))
);

-- Realtime: que los cambios lleguen al instante a ambos teléfonos
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.accounts;
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.goal_contributions;
