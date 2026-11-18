import { useState } from 'react'
import { aplicarTema, leerTema, siguienteTema, type Tema } from '../lib/tema'

/** Interruptor de tema: alterna noche <-> día (los dos temas esmeralda).
 *  El icono muestra el tema al que se cambia (sol = día, luna = noche).
 *  La elección se guarda en localStorage y se aplica antes del primer
 *  render (ver main.tsx), así al recargar sigue el tema elegido. Por
 *  defecto: noche. */
const ICONOS: Record<Tema, { label: string; titulo: string; svg: React.ReactNode }> = {
  dia: {
    label: 'Cambiar a tema día',
    titulo: 'Tema día',
    svg: (
      // Sol: pasar a día.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  noche: {
    label: 'Cambiar a tema noche',
    titulo: 'Tema noche',
    svg: (
      // Luna: pasar a noche.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
      </svg>
    ),
  },
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() => leerTema())

  function cambiar() {
    const siguiente = siguienteTema(tema)
    setTema(siguiente)
    aplicarTema(siguiente)
  }

  const destino = siguienteTema(tema)
  const icono = ICONOS[destino]
  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={icono.label}
      title={icono.titulo}
      className={className}
    >
      {icono.svg}
    </button>
  )
}
