import { useState } from 'react'
import { aplicarTema, leerTema, type Tema } from '../lib/tema'

/** Interruptor noche/día (sol/luna). La elección se guarda en
 *  localStorage y se aplica antes del primer render (ver main.tsx),
 *  así al recargar sigue el tema elegido. Por defecto: noche. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() => leerTema())

  function cambiar() {
    const siguiente: Tema = tema === 'noche' ? 'dia' : 'noche'
    setTema(siguiente)
    aplicarTema(siguiente)
  }

  const aDia = tema === 'noche'
  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={aDia ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
      title={aDia ? 'Modo día' : 'Modo noche'}
      className={className}
    >
      {aDia ? (
        // Sol: pasar a día.
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Luna: pasar a noche.
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
        </svg>
      )}
    </button>
  )
}
