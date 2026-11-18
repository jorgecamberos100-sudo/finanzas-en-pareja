/**
 * Errores de Supabase Auth traducidos a español claro, para que nadie
 * termine en el registro a fuerza por no entender el mensaje en inglés.
 */
export function traducirErrorAuth(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.'
  }
  if (m.includes('already registered')) {
    return 'Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.'
  }
  if (m.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada y confirma tu cuenta.'
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
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
  return message
}

/** ¿El error es que el correo ya está registrado? (para ofrecer el login). */
export function esCorreoYaRegistrado(message: string): boolean {
  return message.toLowerCase().includes('already registered')
}
