import Mascota, { type MascotaPose } from './Mascota'
import { REACTION_POSES, type ReactionContext } from '../lib/pibbi-poses'

export type { ReactionContext } from '../lib/pibbi-poses'

const REACTIONS: Record<ReactionContext, { pose: MascotaPose; text: string }> = {
  saludando: { pose: REACTION_POSES.saludando, text: '¡Hola!' },
  apuntando: { pose: REACTION_POSES.apuntando, text: '¡Anotado!' },
  calculando: { pose: REACTION_POSES.calculando, text: 'Haciendo cuentas…' },
  pensando: { pose: REACTION_POSES.pensando, text: 'Déjame pensar…' },
  celebrando: { pose: REACTION_POSES.celebrando, text: '¡Lo lograste!' },
  progreso: { pose: REACTION_POSES.progreso, text: '¡Vas muy bien!' },
  ahorrando: { pose: REACTION_POSES.ahorrando, text: '¡A ahorrar!' },
}

interface Props {
  contexto: ReactionContext
  /** Mensaje opcional que reemplaza el texto por defecto de la reacción. */
  mensaje?: string
  className?: string
}

/**
 * PIBBI reaccionando según el contexto, sin bloquear nada: aparece junto
 * a la confirmación (un banner o un globo), nunca como modal.
 */
export default function PibbiReaction({ contexto, mensaje, className = '' }: Props) {
  const r = REACTIONS[contexto]
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-foco/60 bg-tarjeta p-3 ${className}`}>
      <Mascota pose={r.pose} alt={`PIBBI ${contexto}`} className="h-12 w-12 shrink-0" />
      <p className="text-sm font-semibold text-crema">{mensaje ?? r.text}</p>
    </div>
  )
}
