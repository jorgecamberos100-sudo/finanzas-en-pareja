import { useEffect, useRef, useState } from 'react'
import Mascota from './Mascota'
import PibbiDresser from './PibbiDresser'
import PibbiNameEditor from './PibbiNameEditor'
import { usePibbi } from '../lib/pibbi'
import { PIBBI_SIZES, PIBBI_VIBES, type PibbiSize, type PibbiVibe } from '../lib/pibbi-identidad'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Panel de PIBBI (igualito al panel de la mascota de Muse): se abre al
 * tocar a PIBBI en cualquier encabezado o junto a sus mensajes del Chat.
 * Avatar grande en círculo + nombre, editar nombre, personalidad,
 * aspecto (prendas), tamaño del avatar y botón ¡Baila!. Se cierra con
 * la X, con Escape o tocando fuera. No reemplaza nada: las reacciones
 * y las prendas que ya existían se quedan; el panel las reúne.
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

  function elegirVibe(v: PibbiVibe) {
    setVibe(v)
  }

  function elegirTamano(s: PibbiSize) {
    setSize(s)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Panel de ${name}`}>
      <button aria-label="Cerrar el panel" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-tarjeta p-5 sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-full border border-borde bg-elevado px-3 py-1 text-lg text-humo"
        >
          ✕
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
          <p className="text-sm text-humo">Tu cerdito de los ahorros 🐷</p>
          <button
            type="button"
            onClick={bailar}
            className="mt-3 rounded-xl bg-dorado px-4 py-2 font-extrabold tracking-wide text-tinta"
          >
            💃 ¡Baila!
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <PibbiNameEditor />

          <div>
            <p className="mb-2 font-bold">Personalidad</p>
            <div className="grid grid-cols-2 gap-2">
              {PIBBI_VIBES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => elegirVibe(v.id)}
                  aria-pressed={vibe === v.id}
                  className={`rounded-2xl border-2 p-3 text-left ${
                    vibe === v.id ? 'border-foco bg-doradotenue' : 'border-borde bg-elevado'
                  }`}
                >
                  <span className="block font-bold">{v.name}</span>
                  <span className="text-xs text-humo">{v.desc}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-humo">Su personalidad cambia sus saludos y reacciones.</p>
          </div>

          <PibbiDresser title="Aspecto" />

          <div>
            <p className="mb-2 font-bold">Tamaño</p>
            <div className="grid grid-cols-3 gap-2">
              {PIBBI_SIZES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => elegirTamano(s.id)}
                  aria-pressed={size === s.id}
                  className={`rounded-2xl border-2 p-3 text-center ${
                    size === s.id ? 'border-foco bg-doradotenue' : 'border-borde bg-elevado'
                  }`}
                >
                  <span className="block font-bold">{s.name}</span>
                  <span className="text-xs text-humo">{s.desc}</span>
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
