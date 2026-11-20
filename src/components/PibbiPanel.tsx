import { useEffect, useRef, useState } from 'react'
import Mascota from './Mascota'
import PibbiDresser from './PibbiDresser'
import PibbiNameEditor from './PibbiNameEditor'
import { usePibbi } from '../lib/pibbi'
import {
  PIBBI_SIZES,
  PIBBI_VIBES,
  type PibbiSize,
  type PibbiVibe,
} from '../lib/pibbi-identidad'
import { Icono } from './ui'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Panel de PIBBI: avatar grande en círculo, nombre, personalidad,
 * aspecto, tamaño del avatar y botón para bailar. Se cierra con la X,
 * con Escape o tocando fuera.
 */
export default function PibbiPanel({ open, onClose }: Props) {
  const { name, vibe, setVibe, size, setSize } = usePibbi()
  const [dancing, setDancing] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  if (!open) return null

  function bailar() {
    setDancing(true)
    if (timer.current) window.clearTimeout(timer.current)
    // 3 vueltas de 1.2 s y para.
    timer.current = window.setTimeout(() => setDancing(false), 3600)
  }

  function elegirVibe(value: PibbiVibe) {
    setVibe(value)
  }

  function elegirTamano(value: PibbiSize) {
    setSize(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Panel de ${name}`}>
      <button type="button" aria-label="Cerrar el panel" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-tarjeta p-5 shadow-elevada animate-hoja-subir sm:rounded-[28px] sm:p-5">
        <button type="button" onClick={onClose} aria-label="Cerrar" className="btn-icono absolute right-3 top-3">
          <Icono nombre="cerrar" className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center">
          <Mascota
            pose="avatarCircular"
            circular
            dancing={dancing}
            alt={`${name}, tu cerdito`}
            className={`${dancing ? 'h-[120px] w-[120px]' : 'h-24 w-24'} transition-all`}
          />
          <p className="mt-2 text-xl font-black">{name}</p>
          <p className="text-sm text-humo">Tu cerdito de los ahorros</p>
          <button type="button" onClick={bailar} className="btn-primario-chico mt-3">
            ¡Baila!
          </button>
        </div>
        <div className="mt-5 space-y-5">
          <PibbiNameEditor />
          <div>
            <p className="mb-2 font-bold">Personalidad</p>
            <div className="grid grid-cols-2 gap-2">
              {PIBBI_VIBES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => elegirVibe(item.id)}
                  aria-pressed={vibe === item.id}
                  className={`rounded-2xl border-2 p-3 text-left ${
                    vibe === item.id
                      ? 'border-foco bg-doradotenue'
                      : 'border-borde bg-elevado'
                  }`}
                >
                  <span className="block font-bold">{item.name}</span>
                  <span className="text-xs text-humo">{item.desc}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-humo">Su personalidad cambia sus saludos y reacciones.</p>
          </div>
          <PibbiDresser title="Aspecto" />
          <div>
            <p className="mb-2 font-bold">Tamaño</p>
            <div className="grid grid-cols-3 gap-2">
              {PIBBI_SIZES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => elegirTamano(item.id)}
                  aria-pressed={size === item.id}
                  className={`rounded-2xl border-2 p-3 text-center ${
                    size === item.id
                      ? 'border-foco bg-doradotenue'
                      : 'border-borde bg-elevado'
                  }`}
                >
                  <span className="block font-bold">{item.name}</span>
                  <span className="text-xs text-humo">{item.desc}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-humo">El tamaño cambia el avatar de PIBBI en el encabezado.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
