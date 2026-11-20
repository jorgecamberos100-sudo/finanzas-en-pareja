import { useState, type ReactNode } from 'react'
import Mascota, { type MascotaPose } from './Mascota'
import PibbiPanel from './PibbiPanel'
import { usePibbi } from '../lib/pibbi'
import { HEADER_SIZE_CLASS } from '../lib/pibbi-identidad'

interface Props {
  pose?: MascotaPose
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * Encabezado común de todas las pantallas: avatar de PIBBI en círculo
 * con su nombre a un lado, título y subtítulo.
 */
export default function PibbiHeader({ pose = 'frente', title, subtitle, children, className = '' }: Props) {
  const [panelOpen, setPanelOpen] = useState(false)
  const { name, size } = usePibbi()

  return (
    <>
      <header className={`flex flex-wrap items-center gap-3 ${className}`}>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-label="Abrir el panel de PIBBI"
            className="block cursor-pointer transition-transform hover:scale-105 active:scale-95"
          >
            <Mascota pose={pose} circular alt={`${name}, tu cerdito`} className={HEADER_SIZE_CLASS[size]} />
          </button>
          <span className="max-w-[120px] truncate text-[13px] font-semibold text-humo">{name}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <div className="text-[13px] text-humo">{subtitle}</div>}
        </div>
        {children && <div className="ml-auto flex shrink-0 gap-2">{children}</div>}
      </header>
      <PibbiPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}
