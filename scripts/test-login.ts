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

console.log(`\n${pass} pasaron, ${fail} fallaron`)
if (fail > 0) process.exit(1)
