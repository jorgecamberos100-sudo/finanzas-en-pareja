import { useState, type ReactNode } from 'react'
import Mascota, { type MascotaPose } from './Mascota'
import PibbiPanel from './PibbiPanel'
import { usePibbi } from '../lib/pibbi'
import { HEADER_SIZE_CLASS } from '../lib/pibbi-identidad'

interface Props {
  pose?: MascotaPose
  title: ReactNode
  subtitle?: ReactNode
  /** Contenido a la derecha del encabezado (p. ej. el botón Salir o Importar/Exportar). */
  children?: ReactNode
  className?: string
}

/**
 * Encabezado común de todas las ventanas, igualito al de la mascota de
 * Muse: PIBBI en círculo con su nombre debajo, a la izquierda del
 * título, con la pose adecuada a cada ventana (ver PAGE_PIBBI_POSES en
 * lib/pibbi-poses). Tocar a PIBBI abre su panel. El tamaño del avatar lo
 * elige cada quien en el panel (compacto 32 px, normal 40 px, grande
 * 56 px). Discreto para no tapar botones ni contenido a 360 px: si las
 * acciones no caben en la fila, bajan a una segunda línea (flex-wrap)
 * en vez de salirse de la pantalla.
 */
export default function PibbiHeader({ pose = 'frente', title, subtitle, children, className = '' }: Props) {
  const { name, size } = usePibbi()
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <header className={`flex flex-wrap items-start gap-3 ${className}`}>
      <div className="flex shrink-0 flex-col items-center">
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label={`Abrir el panel de ${name}`}
          title={name}
          className="rounded-full transition-transform hover:scale-105 active:scale-95"
        >
          <Mascota pose={pose} circular alt={`${name}, tu cerdito`} className={HEADER_SIZE_CLASS[size]} />
        </button>
        <span className="mt-1 max-w-[64px] truncate text-center text-[11px] font-bold leading-tight text-crema">{name}</span>
      </div>
      {/*
        Título sin min-w-0 a propósito: con min-w-0 el título se encogía
        hasta ~0 px y los botones (shrink-0) lo aplastaban ("Movimientos"
        se veía "Movin" a 360 px). Con el mínimo automático, el título
        conserva el ancho de su palabra más larga y las acciones bajan a
        una segunda línea cuando no caben (flex-wrap del header).
      */}
      <div className="flex-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        {/* Div (no <p>): el subtítulo puede traer sus propios párrafos, como el Chat. */}
        {subtitle && <div className="text-sm text-humo">{subtitle}</div>}
      </div>
      {children && <div className="ml-auto flex shrink-0 gap-2">{children}</div>}
      {panelOpen && <PibbiPanel open={panelOpen} onClose={() => setPanelOpen(false)} />}
    </header>
  )
}
