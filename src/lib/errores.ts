/**
 * Errores en español humano para TODA la app. Ningún mensaje técnico en
 * inglés (ni de Supabase Auth, ni de PostgREST, ni de red, ni de las Edge
 * Functions) debe llegar a la pantalla del usuario.
 *
 * Regla: los mensajes que ya escribimos nosotros en español se conservan
 * tal cual; los técnicos se traducen; lo desconocido cae en un mensaje
 * genérico amable. Es lógica pura (sin DOM) para poder probarla en Node.
 */
import { traducirErrorAuth } from './auth'

/** Prefijos de los mensajes que la app ya produce en español. */
const PREFIJOS_ESPANOL = [
  'No se pudo', 'No pude', 'No hay', 'No encontré', 'No me quedó', 'No tienes',
  'Ese correo', 'Ese registro', 'Tu ', 'Tus ', 'Elige', 'Escribe', 'La contraseña',
  'Las contraseñas', 'Demasiados', 'Código inválido', 'Falta', 'Primero',
  'Te enviamos', 'Ya usaste', 'Llegaste', 'Lo dejé', 'Guardado', 'Recordatorio creado',
  'Te propongo', '¿', 'Algo no salió', 'El servicio', 'La captura', 'La nueva contraseña',
  'El enlace', 'El registro', 'El inicio', 'La redirección', 'No pudimos',
]

function textoDe(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return ''
}

/** Convierte cualquier error en un mensaje en español, listo para pantalla. */
export function mensajeHumano(
  error: unknown,
  respaldo = 'Algo no salió como esperábamos. Inténtalo de nuevo en un momento.',
): string {
  const crudo = textoDe(error).trim()
  if (!crudo) return respaldo

  // 1. Mensajes que ya son nuestros, en español: se conservan.
  if (PREFIJOS_ESPANOL.some((p) => crudo.startsWith(p))) return crudo

  const m = crudo.toLowerCase()

  // 2. Red / conexión (los más comunes en el celular).
  if (
    m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') ||
    m.includes('fetch failed') || m.includes('network request failed') || m.includes('enotfound') ||
    m.includes('econnrefused') || m.includes('timeout') || m.includes('timed out')
  ) {
    return 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.'
  }

  // 3. Base de datos / permisos (RLS, duplicados, sesiones).
  if (m.includes('row-level security') || m.includes('42501') || m.includes('permission denied')) {
    return 'No tienes permiso para hacer ese cambio en este hogar.'
  }
  if (m.includes('duplicate key') || m.includes('23505') || m.includes('already exists')) {
    return 'Ese registro ya existe.'
  }
  if (m.includes('jwt') || m.includes('token is expired') || m.includes('session_expired') || m.includes('refresh_token') || m.includes('session missing')) {
    return 'Tu sesión caducó. Vuelve a iniciar sesión.'
  }

  // 4. Edge Functions / IA de servidor: nunca mencionar secretos ni inglés.
  if (m.includes('functionshttperror') || m.includes('non-2xx') || m.includes('edge function') || m.includes('secret') || m.includes('api key') || m.includes('cloudflare') || m.includes('groq') || m.includes('whisper')) {
    return 'El servicio de captura con IA no está disponible ahorita. Lo intentamos en tu teléfono.'
  }

  // 5. Auth: traducciones conocidas + genérico seguro para lo desconocido.
  return traducirErrorAuth(crudo, { seguro: true })
}