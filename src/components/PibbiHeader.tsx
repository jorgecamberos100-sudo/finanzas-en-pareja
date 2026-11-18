import type { ReactNode } from 'react'
import Mascota, { type MascotaPose } from './Mascota'

interface Props {
  pose?: MascotaPose
  title: ReactNode
  subtitle?: ReactNode
  /** Contenido a la derecha del encabezado (p. ej. el botón Salir o Importar/Exportar). */
  children?: ReactNode
  className?: string
}

/**
 * Encabezado común de todas las ventanas: PIBBI pequeño (h-12, cuerpo
 * entero con object-contain) a la izquierda del título, con la pose
 * adecuada a cada ventana (ver PAGE_PIBBI_POSES en lib/pibbi-poses).
 * Es el mismo patrón que ya tenía el Chat; discreto para no tapar
 * botones ni contenido a 360 px: si las acciones no caben en la fila,
 * bajan a una segunda línea (flex-wrap) en vez de salirse de la pantalla.
 * Es FIJO (sticky): al bajar en la lista, PIBBI sigue en pantalla,
 * como en Muse — nunca desaparece al hacer scroll ni al cambiar de
 * pestaña. Cada ventana pasa por `className` el sangrado que compensa
 * el padding de su `main` (-mx-5 -mt-5 en p-5, -mx-4 -mt-4 en p-4)
 * para que el encabezado llegue de borde a borde.
 */
export default function PibbiHeader({ pose = 'frente', title, subtitle, children, className = '' }: Props) {
  return (
    <header className={`sticky top-0 z-20 flex flex-wrap items-start gap-3 border-b border-borde/60 bg-noche/90 backdrop-blur-xl ${className}`}>
      <Mascota pose={pose} className="h-12 w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        {/* Div (no <p>): el subtítulo puede traer sus propios párrafos, como el Chat. */}
        {subtitle && <div className="text-sm text-humo">{subtitle}</div>}
      </div>
      {children && <div className="ml-auto flex shrink-0 gap-2">{children}</div>}
    </header>
  )
}
