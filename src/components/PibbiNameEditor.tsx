import { useState } from 'react'
import { usePibbi } from '../lib/pibbi'
import { MASCOT_NAME_SUGGESTIONS, normalizarNombreMascota } from '../lib/pibbi-identidad'

interface Props {
  /** Texto corto arriba del editor. */
  title?: string
}

/**
 * Ponerle nombre a la mascota: 2 sugerencias (como Muse al crear la
 * cuenta) + escribir el propio. Se guarda al momento (local + cuenta) y
 * el nombre se usa en toda la app. Se usa en el panel de PIBBI y en el
 * Onboarding (paso 4, junto a las prendas).
 */
export default function PibbiNameEditor({ title = '¿Cómo se llama tu cerdito?' }: Props) {
  const { name, setName } = usePibbi()
  const [draft, setDraft] = useState(name)
  const [saved, setSaved] = useState(false)

  function guardar(n?: string) {
    const next = normalizarNombreMascota(n ?? draft)
    setName(next)
    setDraft(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <p className="mb-2 font-bold">{title}</p>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar() }}
          maxLength={20}
          aria-label="Nombre de tu mascota"
          className="min-w-0 flex-1 rounded-xl border p-3"
        />
        <button type="button" onClick={() => guardar()} className="shrink-0 rounded-xl bg-dorado px-4 font-bold text-tinta">
          Guardar
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {MASCOT_NAME_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => guardar(s)}
            aria-pressed={draft === s}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              draft === s ? 'border-foco bg-doradotenue' : 'border-borde bg-elevado'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {saved && <p role="status" className="mt-2 text-xs font-semibold text-verde">¡Guardado! Tu cerdito se llama {name}.</p>}
    </div>
  )
}
