import Mascota from './Mascota'
import { PIBBI_ACCESSORIES, usePibbi, type PibbiAccessory } from '../lib/pibbi'

interface Props {
  /** Texto corto arriba del selector. */
  title?: string
}

/**
 * Vestidor de PIBBI: cada persona elige la prenda de su propio PIBBI
 * (lentes, gorra, moño, corona o sin accesorios). Se guarda por usuario
 * y se ve así en toda la app.
 */
export default function PibbiDresser({ title = 'Viste a PIBBI' }: Props) {
  const { accessory, setAccessory } = usePibbi()

  function choose(a: PibbiAccessory) {
    setAccessory(a)
  }

  return (
    <div>
      <p className="mb-2 font-bold">{title} 🎀</p>
      <div className="grid grid-cols-5 gap-2">
        {PIBBI_ACCESSORIES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => choose(a.id)}
            aria-pressed={accessory === a.id}
            title={a.name}
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-2 ${
              accessory === a.id ? 'border-rosafuerte bg-[#F4728F1A]' : 'border-borde bg-elevado'
            }`}
          >
            <Mascota pose="frente" accessory={a.id} alt={`PIBBI con ${a.name}`} className="h-12 w-12" />
            <span className="text-center text-[11px] leading-tight text-humo">{a.emoji} {a.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-humo">Tu PIBBI se ve así en toda la app. Tu pareja tiene el suyo con su propia prenda.</p>
    </div>
  )
}
