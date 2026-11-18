import Mascota from './Mascota'
import { REACTION_POSES, type ReactionContext } from '../lib/pibbi-poses'
import { textoReaccion } from '../lib/pibbi-identidad'
import { usePibbi } from '../lib/pibbi'

export type { ReactionContext } from '../lib/pibbi-poses'

interface Props {
  contexto: ReactionContext
  /** Mensaje opcional que reemplaza el texto por defecto de la reacción. */
  mensaje?: string
  className?: string
}

/**
 * PIBBI reaccionando según el contexto, sin bloquear nada: aparece junto
 * a la confirmación (un banner o un globo), nunca como modal. El texto
 * depende de su personalidad (vibe) y usa su nombre. Al celebrar (meta
 * lograda, pago hecho) baila a 120 px, como en el panel.
 */
export default function PibbiReaction({ contexto, mensaje, className = '' }: Props) {
  const { name, vibe } = usePibbi()
  const pose = REACTION_POSES[contexto]
  const celebrando = contexto === 'celebrando'
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-foco/60 bg-tarjeta p-3 ${className}`}>
      <Mascota
        pose={pose}
        dancing={celebrando}
        alt={`${name} ${contexto}`}
        className={celebrando ? 'h-[120px] w-[120px] shrink-0' : 'h-12 w-12 shrink-0'}
      />
      <p className="text-sm font-semibold text-crema">{mensaje ?? textoReaccion(contexto, vibe, name)}</p>
    </div>
  )
}
