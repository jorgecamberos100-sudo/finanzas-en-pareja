-- Finanzas en Pareja — datos semilla (ejemplo, MXN)
-- ⚠️ SOLO PARA DESARROLLO / DEMO. Los UUID de usuarios son de ejemplo:
-- crea primero los 2 usuarios reales en Supabase Auth (o con el onboarding)
-- y sustituye los IDs de abajo por los reales (auth.users → id).
-- Correr DESPUÉS de 001_init.sql. En producción, el onboarding crea
-- estas categorías automáticamente; este seed es para probar sin onboarding.

-- Usuarios de ejemplo (sustituir por los IDs reales de Auth)
-- Jorge (admin) y su pareja (miembro).
insert into public.users (id, name, email) values
  ('11111111-1111-1111-1111-111111111111', 'Jorge', 'jorge@ejemplo.mx'),
  ('22222222-2222-2222-2222-222222222222', 'Pareja de Jorge', 'pareja@ejemplo.mx')
on conflict (id) do nothing;

-- Hogar de ejemplo
insert into public.households (id, name, currency, default_split, invite_code) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nuestro hogar', 'MXN', 50, 'DEMO123')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'miembro')
on conflict do nothing;

-- Cuentas de ejemplo
insert into public.accounts (household_id, owner_id, name, type, visibility, balance) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Efectivo', 'efectivo', 'compartida', 2500.00),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Cuenta principal', 'banco', 'compartida', 18400.00),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Tarjeta de crédito', 'tarjeta', 'solo_saldo', 3200.00),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Cuenta personal', 'banco', 'privada', 5000.00),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Préstamo auto', 'deuda', 'compartida', 45000.00)
on conflict do nothing;

-- Categorías LatAm con límites mensuales de ejemplo (MXN)
insert into public.categories (household_id, "group", name, icon, monthly_limit, rollover) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vivienda', 'Renta / Hipoteca', '🏠', 8000, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Servicios', 'Luz, agua e internet', '💡', 1500, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Despensa', 'Súper y mercado', '🛒', 6000, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Transporte', 'Gasolina y transporte', '🚗', 2500, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Salud', 'Salud y farmacia', '💊', 1200, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Restaurantes', 'Comer fuera', '🍽️', 2000, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ocio', 'Ocio y entretenimiento', '🎬', 1200, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Suscripciones', 'Suscripciones', '📺', 600, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Educación', 'Educación', '📚', 1000, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ropa', 'Ropa', '👕', 800, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Imprevistos', 'Imprevistos', '🆘', 1000, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Metas', 'Ahorro para metas', '🎯', 2000, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ingresos', 'Sueldo', '💼', 0, false)
on conflict do nothing;

-- Meta de ejemplo
insert into public.goals (household_id, name, target, current, due_date) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vacaciones en la playa', 15000, 4500, '2027-06-30'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fondo de emergencia', 30000, 8000, '2027-12-31')
on conflict do nothing;

-- Recurrentes de ejemplo
insert into public.recurring (household_id, title, amount, due_day, active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Netflix', 219, 5, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Internet', 599, 10, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gimnasio', 800, 1, true)
on conflict do nothing;
