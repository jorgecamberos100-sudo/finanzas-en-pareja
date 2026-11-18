/**
 * Errores de Supabase Auth traducidos a español claro, para que nadie
 * termine en el registro a fuerza por no entender el mensaje en inglés.
 *
 * Con `{ seguro: true }` (lo que usa la UI), un error desconocido NUNCA
 * se muestra tal cual: cae en un mensaje genérico en español. Sin esa
 * opción, el comportamiento histórico se conserva (devolver el mensaje
 * original), para no romper a quien ya dependía de él.
 */
export function traducirErrorAuth(message: string, opts?: { seguro?: boolean }): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.'
  }
  if (m.includes('already registered')) {
    return 'Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.'
  }
  if (m.includes('already been registered') || (m.includes('email address') && m.includes('already'))) {
    return 'Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.'
  }
  if (m.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada y confirma tu cuenta.'
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (m.includes('weak password') || m.includes('password is too weak')) {
    return 'Esa contraseña es muy fácil de adivinar. Usa al menos 6 caracteres con letras y números.'
  }
  if (m.includes('invalid email') || m.includes('unable to validate email address')) {
    return 'Ese correo no es válido. Revisa que esté bien escrito.'
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  if (m.includes('user not found')) {
    return 'No hay ninguna cuenta con ese correo. Crea tu cuenta primero.'
  }
  if (m.includes('provider') && (m.includes('not enabled') || m.includes('disabled'))) {
    return 'El inicio de sesión con Google no está activado todavía. Prueba con correo y contraseña.'
  }
  if (m.includes('redirect_uri') || m.includes('redirect url')) {
    return 'La redirección de Google no está configurada. Prueba con correo y contraseña.'
  }
  // --- Casos nuevos (nov 2026): nunca dejar pasar inglés técnico ---
  if (m.includes('anonymous sign-ins are disabled') || m.includes('anonymous provider') || m.includes('anonymous')) {
    return 'No se pudo abrir la sesión. Entra con tu correo y contraseña, o con Google.'
  }
  if (m.includes('signup is disabled') || m.includes('signups not allowed') || m.includes('signup_disabled')) {
    return 'El registro con correo está desactivado ahorita. Prueba con Google.'
  }
  if (m.includes('same password') || m.includes('different from the old password')) {
    return 'La nueva contraseña debe ser distinta a la anterior.'
  }
  if ((m.includes('otp') && m.includes('expired')) || m.includes('token has expired') || m.includes('invalid token') || m.includes('invalid grant')) {
    return 'El enlace para restablecer tu contraseña ya caducó. Pide uno nuevo.'
  }
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) {
    return 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.'
  }
  if (m.includes('session') && (m.includes('expired') || m.includes('missing'))) {
    return 'Tu sesión caducó. Vuelve a iniciar sesión.'
  }
  if (opts?.seguro) {
    return 'Algo no salió como esperábamos. Inténtalo de nuevo en un momento.'
  }
  return message
}

/** ¿El error es que el correo ya está registrado? (para ofrecer el login). */
export function esCorreoYaRegistrado(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('already registered') || m.includes('already been registered')
}