// Pruebas de la traducción de errores de login/registro a español claro
// (src/lib/auth.ts). La lógica de "¿ya tiene cuenta?" depende de Supabase
// y se prueba en vivo; aquí se verifica que ningún error en inglés llegue
// tal cual a la pantalla del usuario.
import { traducirErrorAuth, esCorreoYaRegistrado } from '../src/lib/auth.ts'

let pass = 0
let fail = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}\n    esperado: ${e}\n    real:     ${a}`)
  }
}

check(
  'credenciales inválidas en español',
  traducirErrorAuth('Invalid login credentials'),
  'Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.',
)
check(
  'correo ya registrado en español',
  traducirErrorAuth('User already registered'),
  'Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.',
)
check(
  'correo no confirmado en español',
  traducirErrorAuth('Email not confirmed'),
  'Tu correo aún no está confirmado. Revisa tu bandeja de entrada y confirma tu cuenta.',
)
check(
  'contraseña corta en español',
  traducirErrorAuth('Password should be at least 6 characters'),
  'La contraseña debe tener al menos 6 caracteres.',
)
check(
  'correo inválido en español',
  traducirErrorAuth('Unable to validate email address: invalid format'),
  'Ese correo no es válido. Revisa que esté bien escrito.',
)
check(
  'demasiados intentos en español',
  traducirErrorAuth('Too many requests'),
  'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
)
check(
  'usuario no existe en español',
  traducirErrorAuth('User not found'),
  'No hay ninguna cuenta con ese correo. Crea tu cuenta primero.',
)
check(
  'error desconocido se devuelve tal cual',
  traducirErrorAuth('Something odd happened'),
  'Something odd happened',
)
check('detecta correo ya registrado', esCorreoYaRegistrado('User already registered'), true)
check('no confunde otros errores', esCorreoYaRegistrado('Invalid login credentials'), false)
check(
  'ninguna traducción queda en inglés ni vacía',
  [
    'Invalid login credentials',
    'User already registered',
    'Email not confirmed',
    'Password should be at least 6 characters',
    'Unable to validate email address: invalid format',
  ].every((m) => {
    const t = traducirErrorAuth(m)
    return t.length > 0 && t !== m && !/Invalid|already registered|not confirmed|at least|Unable to validate/i.test(t)
  }),
  true,
)

// ---- Crear hogar vía RPC (migración 006) ----
// Causa raíz del bug en vivo: el Onboarding hacía
// `from('households').insert({...}).select().single()`; el INSERT pasa
// (with check (true)) pero el RETURNING se evalúa contra la política
// SELECT (`is_member(id)`) y el usuario aún no es miembro → Postgres
// rechaza con "new row violates row-level security policy". La RPC
// SECURITY DEFINER crea hogar + miembro admin en una transacción.
import { crearHogar } from '../src/lib/household.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const onboarding = readFileSync(join(root, 'src/pages/Onboarding.tsx'), 'utf8')
const mig006 = readFileSync(join(root, 'supabase/migrations/006_crear_hogar_rpc.sql'), 'utf8')

type RpcMock = (fn: string, args: Record<string, unknown>) => Promise<{
  data: unknown
  error: { message: string } | null
}>

function mockRpc(data: unknown, error: { message: string } | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const rpc: RpcMock = async (fn, args) => {
    calls.push({ fn, args })
    return { data, error }
  }
  return { rpc, calls }
}

const hogarFila = [{ id: 'hh-1', invite_code: 'ABC123' }]

{
  const { rpc, calls } = mockRpc(hogarFila)
  const res = await crearHogar({ rpc }, { name: 'Mi hogar', defaultSplit: 100 })
  check('crearHogar solo: ok con id y código', res, { ok: true, hogar: { id: 'hh-1', invite_code: 'ABC123' } })
  check(
    'crearHogar solo: llama a la RPC con reparto 100',
    calls,
    [{ fn: 'create_household', args: { p_name: 'Mi hogar', p_currency: 'MXN', p_default_split: 100 } }],
  )
}

{
  const { rpc, calls } = mockRpc({ id: 'hh-2', invite_code: 'XYZ789' })
  const res = await crearHogar({ rpc }, { name: 'Nuestro hogar', defaultSplit: 50 })
  check('crearHogar pareja: acepta fila suelta (no arreglo)', res, { ok: true, hogar: { id: 'hh-2', invite_code: 'XYZ789' } })
  check(
    'crearHogar pareja: llama a la RPC con reparto 50',
    calls[0]?.args,
    { p_name: 'Nuestro hogar', p_currency: 'MXN', p_default_split: 50 },
  )
}

{
  const { rpc } = mockRpc(null, { message: 'new row violates row-level security policy for table "households"' })
  const res = await crearHogar({ rpc }, { name: 'Mi hogar', defaultSplit: 100 })
  check('crearHogar: error de la RPC llega como ok:false', res.ok, false)
  check(
    'crearHogar: el mensaje de error se conserva',
    (res as { error: string }).error,
    'new row violates row-level security policy for table "households"',
  )
}

{
  const { rpc } = mockRpc([{ id: 'hh-3' }])
  const res = await crearHogar({ rpc }, { name: 'Mi hogar', defaultSplit: 100 })
  check('crearHogar: fila sin código es error en español', res, { ok: false, error: 'No se pudo crear el hogar.' })
}

{
  const rpc: RpcMock = async () => {
    throw new Error('red caída')
  }
  const res = await crearHogar({ rpc }, { name: 'Mi hogar', defaultSplit: 100 })
  check('crearHogar: si la RPC lanza, no explota', res, { ok: false, error: 'red caída' })
}

check('Onboarding: crear hogar usa el helper crearHogar', onboarding.includes('crearHogar(supabase'), true)
check('household.ts: el helper llama a la RPC create_household', readFileSync(join(root, 'src/lib/household.ts'), 'utf8').includes("rpc('create_household'"), true)
check('Onboarding: ya no inserta directo en households', !onboarding.includes("from('households').insert"), true)
check('Onboarding: ya no inserta directo en household_members al crear', !onboarding.includes("from('household_members').insert({ household_id: hh.id"), true)
check('Onboarding: unirse con código sigue con su RPC (sin tocar)', onboarding.includes("rpc('find_household_by_code'"), true)
check('migración 006: función SECURITY DEFINER', mig006.includes('security definer'), true)
check('migración 006: search_path fijado a public', mig006.includes('set search_path = public'), true)
check('migración 006: exige usuario autenticado', mig006.includes('auth.uid()'), true)
check('migración 006: reintenta ante colisión de código único', mig006.includes('unique_violation') && mig006.includes('v_tries >= 5'), true)
check('migración 006: inserta hogar y miembro admin', mig006.includes("insert into public.households") && mig006.includes("insert into public.household_members") && mig006.includes("'admin'"), true)
check('migración 006: asegura la fila en users si falta (FK del miembro)', mig006.includes('insert into public.users') && mig006.includes('on conflict (id) do nothing'), true)
check('migración 006: devuelve id y código', mig006.includes('returns table (id uuid, invite_code text)'), true)
check('migración 006: solo authenticated ejecuta', mig006.includes('grant execute on function public.create_household(text, text, int) to authenticated'), true)
check('migración 006: no toca las políticas existentes', !mig006.includes('create policy') && !mig006.includes('drop policy'), true)

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)