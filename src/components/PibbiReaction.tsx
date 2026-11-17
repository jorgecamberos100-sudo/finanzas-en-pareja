import Mascota, { type MascotaPose } from './Mascota'

/** Contextos en los que PIBBI reacciona cuando alguien registra un dato. */
export type ReactionContext =
  | 'saludando' | 'apuntando' | 'calculando' | 'pensando'
  | 'celebrando' | 'progreso' | 'ahorrando'

const REACTIONS: Record<ReactionContext, { pose: MascotaPose; text: string }> = {
  saludando: { pose: 'saludando', text: '¡Hola! 👋' },
  apuntando: { pose: 'saludando', text: '¡Anotado! 📝' },
  calculando: { pose: 'contar', text: 'Haciendo cuentas… 🧮' },
  pensando: { pose: 'pensativo', text: 'Déjame pensar… 🤔' },
  celebrando: { pose: 'celebrando', text: '¡Lo lograste! 🎉' },
  progreso: { pose: 'progreso', text: '¡Vas muy bien! 📈' },
  ahorrando: { pose: 'ahorrando', text: '¡A ahorrar! 🪙' },
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
    <div className={`flex items-center gap-3 rounded-2xl border border-rosafuerte/40 bg-tarjeta p-3 ${className}`}>
      <Mascota pose={r.pose} alt={`PIBBI ${contexto}`} className="h-14 w-14 shrink-0" />
      <p className="text-sm font-semibold text-crema">{mensaje ?? r.text}</p>
    </div>
  )
}
