-- PIBBI personalizable: cada persona viste a su propio PIBBI con una
-- prenda (lentes, gorra, moño, corona o sin accesorios). La elección vive
-- por usuario, no por hogar: cada miembro ve su propio PIBBI vestido.
create table public.pibbi_customization (
  user_id uuid primary key references public.users (id) on delete cascade,
  accessory text not null default 'ninguno'
    check (accessory in ('ninguno', 'lentes', 'gorra', 'mono', 'corona')),
  updated_at timestamptz not null default now()
);

alter table public.pibbi_customization enable row level security;

create policy "pibbi: ver el mío" on public.pibbi_customization
  for select using (auth.uid() = user_id);
create policy "pibbi: guardar el mío" on public.pibbi_customization
  for insert with check (auth.uid() = user_id);
create policy "pibbi: actualizar el mío" on public.pibbi_customization
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
