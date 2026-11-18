import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { iniciarConGoogle } from '../lib/google-auth'

interface Props {
  disabled?: boolean
  /** Se llama con el error ya en español cuando Google no se pudo abrir. */
  onError: (message: string) => void
}

/** Logo "G" de Google (4 colores), SVG en línea, sin emojis ni imágenes. */
function LogoGoogle() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45c-.28 1.48-1.12 2.73-2.38 3.57v2.97h3.86c2.26-2.08 3.56-5.14 3.56-8.73z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-2.97c-1.07.72-2.44 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.29v3.07C3.27 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.3c-.24-.72-.38-1.48-.38-2.3s.14-1.58.38-2.3V6.63H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.37l3.96-3.07z"
      />
      <path
        fill="#EA4335"
        d="M12 4.73c1.76 0 3.34.6 4.58 1.79l3.43-3.43C17.96 1.19 15.24 0 12 0 7.31 0 3.27 2.7 1.29 6.63l3.96 3.07C6.2 6.85 8.86 4.73 12 4.73z"
      />
    </svg>
  )
}

/**
 * Botón "Continuar con Google" para el paso 1 del Onboarding (registro e
 * inicio de sesión: OAuth es el mismo flujo en ambos casos — Supabase crea
 * la cuenta la primera vez y entra directo las siguientes).
 *
 * El botón es blanco con el logo G, como el botón oficial de Google, y se
 * ve igual en el tema de día y en el de noche. El correo/contraseña sigue
 * existiendo; Google es una opción más, no un reemplazo.
 */
export default function GoogleSignInButton({ disabled, onError }: Props) {
  const [busy, setBusy] = useState(false)
  const ocupado = disabled || busy

  async function entrar() {
    setBusy(true)
    const res = await iniciarConGoogle(supabase)
    // Si salió bien el navegador ya va camino a Google. Si falló
    // (proveedor no habilitado, red caída), se queda aquí con el error.
    if (!res.ok) {
      onError(res.error)
      setBusy(false)
    }
  }

  return (
    <>
      <div className="my-4 flex items-center gap-3 text-sm text-humo">
        <span className="h-px flex-1 bg-borde" />
        <span>o continúa con</span>
        <span className="h-px flex-1 bg-borde" />
      </div>
      <button
        type="button"
        onClick={() => void entrar()}
        disabled={ocupado}
        className="flex w-full items-center justify-center gap-3 whitespace-nowrap rounded-xl border border-googleborde bg-white py-3 font-bold text-googletinta disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogoGoogle />
        {busy ? 'Abriendo Google…' : 'Continuar con Google'}
      </button>
    </>
  )
}
