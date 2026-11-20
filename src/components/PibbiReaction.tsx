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
 * PIBBI reaccionando según el contexto, sin bloquear nada: píldora estilo
 * Muse con su avatar y una frase según su personalidad. El texto depende
 * de su personalidad (vibe) y usa su nombre. Al celebrar (meta lograda,
 * pago hecho) baila, como en el panel. Sin emoji en la UI.
 */
export default function PibbiReaction({ contexto, mensaje, className = '' }: Props) {
  const { name, vibe } = usePibbi()
  const pose = REACTION_POSES[contexto]
  const celebrando = contexto === 'celebrando'
  return (
    <div className={`flex items-center gap-3 rounded-full border border-borde bg-elevado py-2 pl-2 pr-4 ${className}`}>
      <Mascota
        pose={pose}
        dancing={celebrando}
        alt={`${name} ${contexto}`}
        className={celebrando ? 'h-[120px] w-[120px] shrink-0' : 'h-8 w-8 shrink-0'}
      />
      <p className="min-w-0 text-[13px] font-medium text-crema">{mensaje ?? textoReaccion(contexto, vibe, name)}</p>
    </div>
  )
}
