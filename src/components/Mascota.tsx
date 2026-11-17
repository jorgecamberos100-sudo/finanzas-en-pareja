import { useId } from 'react'
import { MASCOTA, MASCOTA_AHORRANDO, MASCOTA_CELEBRANDO } from '../lib/mascota-images'
import { MASCOTA_SALUDANDO } from '../lib/mascota/saludando'
import { MASCOTA_PENSATIVO } from '../lib/mascota/pensativo'
import { MASCOTA_CONTAR } from '../lib/mascota/contar'
import { MASCOTA_PROGRESO } from '../lib/mascota/progreso'
import { usePibbi, type PibbiAccessory } from '../lib/pibbi'

/**
 * La mascota de la app: PIBBI, el cerdito rosa de la hoja de personaje.
 * Los recortes ya traen fondo azul marino, así que van en un marco
 * redondeado que se funde con el tema oscuro. Las prendas se dibujan
 * como SVG sobre la imagen, así cada persona ve su propio PIBBI vestido.
 */
export type MascotaPose =
  | 'frente' | 'celebrando' | 'ahorrando'
  | 'saludando' | 'pensativo' | 'contar' | 'progreso'

interface Props {
  pose?: MascotaPose
  /** Si no se pasa, usa el accesorio guardado de quien está usando la app. */
  accessory?: PibbiAccessory
  alt?: string
  className?: string
}

const POSES: Record<MascotaPose, string> = {
  frente: MASCOTA,
  celebrando: MASCOTA_CELEBRANDO,
  ahorrando: MASCOTA_AHORRANDO,
  saludando: MASCOTA_SALUDANDO,
  pensativo: MASCOTA_PENSATIVO,
  contar: MASCOTA_CONTAR,
  progreso: MASCOTA_PROGRESO,
}

/** Prendas dibujadas en SVG sobre la foto de PIBBI (posiciones relativas). */
function Accesorio({ accessory }: { accessory: PibbiAccessory }) {
  if (accessory === 'lentes') {
    return (
      <svg viewBox="0 0 100 40" aria-hidden="true" className="pointer-events-none absolute left-[11%] top-[30%] w-[78%]">
        <circle cx="28" cy="20" r="14" fill="rgba(255,255,255,0.10)" stroke="#0F1530" strokeWidth="5" />
        <circle cx="72" cy="20" r="14" fill="rgba(255,255,255,0.10)" stroke="#0F1530" strokeWidth="5" />
        <path d="M42 18 Q50 13 58 18" fill="none" stroke="#0F1530" strokeWidth="5" strokeLinecap="round" />
        <path d="M14 18 L4 14 M86 18 L96 14" fill="none" stroke="#0F1530" strokeWidth="5" strokeLinecap="round" />
      </svg>
    )
  }
  if (accessory === 'gorra') {
    return (
      <svg viewBox="0 0 100 46" aria-hidden="true" className="pointer-events-none absolute left-[9%] top-[-4%] w-[82%]">
        <path d="M8 40 Q8 8 50 8 Q92 8 92 40 Q70 30 50 30 Q30 30 8 40 Z" fill="#F4728F" />
        <path d="M4 38 Q50 26 96 38 Q96 44 88 44 Q50 34 12 44 Q4 44 4 38 Z" fill="#D14D6D" />
        <circle cx="50" cy="10" r="4" fill="#F5C542" />
      </svg>
    )
  }
  if (accessory === 'mono') {
    return (
      <svg viewBox="0 0 100 44" aria-hidden="true" className="pointer-events-none absolute bottom-[4%] left-[28%] w-[44%]">
        <path d="M50 22 L12 6 Q6 22 12 38 Z" fill="#F5C542" />
        <path d="M50 22 L88 6 Q94 22 88 38 Z" fill="#F5C542" />
        <circle cx="50" cy="22" r="9" fill="#D9A41F" />
      </svg>
    )
  }
  if (accessory === 'corona') {
    return (
      <svg viewBox="0 0 100 52" aria-hidden="true" className="pointer-events-none absolute left-[24%] top-[-7%] w-[52%]">
        <path d="M8 44 L12 14 L32 30 L50 6 L68 30 L88 14 L92 44 Z" fill="#F5C542" stroke="#D9A41F" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="50" cy="34" r="4" fill="#F4728F" />
        <circle cx="26" cy="34" r="3" fill="#7DDBC3" />
        <circle cx="74" cy="34" r="3" fill="#7DDBC3" />
      </svg>
    )
  }
  return null
}

export default function Mascota({ pose = 'frente', accessory, alt = 'PIBBI, nuestro cerdito de los ahorros', className = 'h-28 w-28' }: Props) {
  const { accessory: saved } = usePibbi()
  const acc = accessory ?? saved
  // Cada PIBBI lleva su propio retraso negativo (estable por instancia):
  // así dos cerditos en la misma pantalla no flotan, respiran ni
  // pestañean al unísono y el movimiento se siente orgánico. El retraso
  // negativo hace que cada uno arranque a mitad de ciclo, sin salto inicial.
  const uid = useId()
  const seed = [...uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const delays = {
    '--pibbi-float-delay': `${-((seed % 48) / 10)}s`, // ciclo 4.8 s
    '--pibbi-breathe-delay': `${-((seed % 72) / 10)}s`, // ciclo 7.2 s
    '--pibbi-blink-delay': `${-((seed % 42) / 10)}s`, // ciclo 4.2 s
  } as React.CSSProperties
  // Micro-interacción al tocarlo: el envoltorio escala (hover/active) y el
  // interior sigue con su animación de flotar y pestañear. La animación CSS
  // de .pibbi-vivo pisa el transform de su propio elemento, por eso la
  // escala vive en el envoltorio y no en el mismo div.
  return (
    <div className={`relative shrink-0 transition-transform duration-150 hover:scale-105 active:scale-95 ${className}`} style={delays}>
      <div className="pibbi-vivo relative h-full w-full">
        {/* La respiración (escala leve) vive en su propio div, anidado:
            así no pelea con la flotación (translate) del padre y la imagen,
            los párpados y las prendas respiran todos juntos. */}
        <div className="pibbi-respira">
          <img src={POSES[pose]} alt={alt} className="h-full w-full rounded-3xl object-cover ring-1 ring-borde" />
          {/* Párpados de PIBBI: bajan cada ~4 s para que siempre esté pestañeando.
              Los ojos están a ~30% de altura y ~28% / ~72% de ancho en las poses
              de frente; el párpado los cubre por completo al cerrarse. */}
          <span aria-hidden="true" className="pibbi-parpado" style={{ left: '19%' }} />
          <span aria-hidden="true" className="pibbi-parpado" style={{ left: '63%' }} />
          <Accesorio accessory={acc} />
        </div>
      </div>
      {/* Sombra del suelo: fuera del div que flota, respira en contrafase. */}
      <span aria-hidden="true" className="pibbi-sombra" />
    </div>
  )
}
