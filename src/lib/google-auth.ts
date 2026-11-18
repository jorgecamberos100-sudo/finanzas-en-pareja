/**
 * Inicio y registro con Google (Supabase Auth, proveedor OAuth `google`).
 *
 * El botón "Continuar con Google" llama a `signInWithOAuth`, que redirige
 * el navegador a Google (la librería hace `window.location.assign` sola,
 * salvo `skipBrowserRedirect`). Al volver, Supabase ya dejó la sesión
 * guardada y el Onboarding detecta al usuario sin hogar y lo manda al
 * paso 2 (o al Dashboard si ya tiene hogar) — ver `resolverSesionExistente`.
 *
 * El proveedor Google se habilita FUERA del código, en la consola de
 * Supabase (Authentication → Providers → Google, con el Client ID/Secret
 * de Google Cloud). Sin eso, el botón falla con "provider is not enabled"
 * y aquí se traduce a español. Nunca van secretos en el repo.
 *
 * El cliente se inyecta (interfaz mínima) para poder probar este camino
 * en Node con un mock de `signInWithOAuth`.
 */
import { traducirErrorAuth } from './auth'

export interface ClienteOAuth {
  auth: {
    signInWithOAuth: (args: {
      provider: 'google'
      options: { redirectTo: string }
    }) => PromiseLike<{
      data: unknown
      error: { message: string } | null
    }>
  }
}

export type ResultadoGoogle = { ok: true } | { ok: false; error: string }

/**
 * Abre el flujo de Google. Si todo va bien el navegador ya va camino a
 * Google y esta promesa se resuelve con `{ ok: true }` (la página se
 * descarga al redirigir, así que el `ok` casi no se llega a usar).
 * Nunca lanza: el error llega como `{ ok: false, error }` en español.
 */
export async function iniciarConGoogle(
  cliente: ClienteOAuth,
): Promise<ResultadoGoogle> {
  try {
    const { error } = await cliente.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/onboarding` },
    })
    if (error) return { ok: false, error: traducirErrorAuth(error.message) }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? traducirErrorAuth(e.message)
          : 'No se pudo abrir Google. Inténtalo de nuevo.',
    }
  }
}

/** Destino al volver de Google (o al abrir /onboarding ya con sesión). */
export interface DestinoSesion {
  setHouseholdId: (id: string) => void
  irDashboard: () => void
  irPaso2: () => void
}

/**
 * Con la sesión ya existente: si el usuario ya tiene hogar, entra directo
 * al Dashboard; si no, sigue al paso 2 a crear o unirse a uno. Es la
 * misma regla que el login con correo/contraseña.
 */
export async function resolverSesionExistente(
  buscarHogar: (userId: string) => Promise<string | null>,
  userId: string,
  destino: DestinoSesion,
): Promise<'dashboard' | 'paso2'> {
  const householdId = await buscarHogar(userId)
  if (householdId) {
    destino.setHouseholdId(householdId)
    destino.irDashboard()
    return 'dashboard'
  }
  destino.irPaso2()
  return 'paso2'
}
