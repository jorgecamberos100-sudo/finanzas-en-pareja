// Poses de PIBBI: qué imagen usa cada pose, dónde van los párpados al
// pestañear y si la pose es circular (fondo negro tipo avatar) o admite
// prendas. Lógica pura, sin React ni DOM, para poder probarla.
// Las prendas SVG están dibujadas para las poses de frente; en las poses
// de perfil (lápiz, calculadora) se esconden porque quedarían mal puestas.
import { MASCOTA, MASCOTA_AHORRANDO, MASCOTA_CELEBRANDO } from './mascota-images'
import { MASCOTA_SALUDANDO } from './mascota/saludando'
import { MASCOTA_PENSATIVO } from './mascota/pensativo'
import { MASCOTA_CONTAR } from './mascota/contar'
import { MASCOTA_PROGRESO } from './mascota/progreso'
import { MASCOTA_PERFIL_LAPIZ } from './mascota/perfil-lapiz'
import { MASCOTA_CALCULADORA } from './mascota/calculadora'
import { MASCOTA_AVATAR_CIRCULAR } from './mascota/avatar-circular'

export type MascotaPose =
  | 'frente' | 'celebrando' | 'ahorrando'
  | 'saludando' | 'pensativo' | 'contar' | 'progreso'
  | 'perfilLapiz' | 'calculadora' | 'avatarCircular'

/** Posición de un párpado, en % del marco (CSS .pibbi-parpado: 18% de ancho, 15% de alto). */
export interface PibbiEyelid {
  /** izquierda del párpado (el ojo queda centrado: ojo_x ≈ left + 9) */
  left: number
  /** arriba del párpado (el ojo queda centrado: ojo_y ≈ top + 7.5) */
  top: number
}

export interface PibbiPoseConfig {
  image: string
  eyelids: PibbiEyelid[]
  /** Fondo circular negro tipo avatar: imagen redonda, sin sombra de suelo. */
  circular?: boolean
  /** Si es falso, no se dibuja la prenda elegida sobre esta pose. */
  accessories?: boolean
}

export const PIBBI_POSES: Record<MascotaPose, PibbiPoseConfig> = {
  // Poses de frente (hoja de personaje): ojos a ~30% de altura y ~28% / ~72% de ancho.
  frente: { image: MASCOTA, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  celebrando: { image: MASCOTA_CELEBRANDO, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  ahorrando: { image: MASCOTA_AHORRANDO, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  saludando: { image: MASCOTA_SALUDANDO, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  pensativo: { image: MASCOTA_PENSATIVO, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  contar: { image: MASCOTA_CONTAR, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  progreso: { image: MASCOTA_PROGRESO, eyelids: [{ left: 19, top: 22 }, { left: 63, top: 22 }] },
  // De perfil con lápiz y libreta: un solo ojo visible (~63% de ancho, ~36% de alto).
  perfilLapiz: { image: MASCOTA_PERFIL_LAPIZ, eyelids: [{ left: 54, top: 28 }], accessories: false },
  // Con calculadora: ojos a ~40% de alto y ~49% / ~68% de ancho.
  calculadora: { image: MASCOTA_CALCULADORA, eyelids: [{ left: 40, top: 32 }, { left: 59, top: 32 }], accessories: false },
  // Avatar circular negro de frente: ojos a ~36% de alto y ~37% / ~66% de ancho.
  avatarCircular: { image: MASCOTA_AVATAR_CIRCULAR, eyelids: [{ left: 28, top: 28 }, { left: 57, top: 28 }], circular: true },
}

/** Contextos en los que PIBBI reacciona cuando alguien registra un dato. */
export type ReactionContext =
  | 'saludando' | 'apuntando' | 'calculando' | 'pensando'
  | 'celebrando' | 'progreso' | 'ahorrando'

/**
 * Qué pose muestra cada contexto: apuntando anota con lápiz y libreta
 * (de perfil, fondo circular negro) y calculando saca la calculadora;
 * el resto conserva sus poses de siempre.
 */
export const REACTION_POSES: Record<ReactionContext, MascotaPose> = {
  saludando: 'saludando',
  apuntando: 'perfilLapiz',
  calculando: 'calculadora',
  pensando: 'pensativo',
  celebrando: 'celebrando',
  progreso: 'progreso',
  ahorrando: 'ahorrando',
}

/** Ventanas de la app: cada una lleva a PIBBI en su encabezado. */
export type PibbiPage =
  | 'dashboard' | 'movimientos' | 'presupuesto' | 'plan'
  | 'chat' | 'recordatorios' | 'onboarding'

/**
 * Pose de PIBBI en el encabezado de cada ventana (componente PibbiHeader):
 * saludando en Inicio (te recibe), calculadora en Movimientos (hace las
 * cuentas de tus gastos), contar en Presupuesto (cuenta las monedas del
 * sobre), progreso en Plan (tus metas avanzan), avatar circular en el Chat
 * (su cara de siempre), perfil con lápiz en Avisos (anota tus pagos) y
 * saludando en el Onboarding (te recibe al crear tu cuenta).
 */
export const PAGE_PIBBI_POSES: Record<PibbiPage, MascotaPose> = {
  dashboard: 'saludando',
  movimientos: 'calculadora',
  presupuesto: 'contar',
  plan: 'progreso',
  chat: 'avatarCircular',
  recordatorios: 'perfilLapiz',
  onboarding: 'saludando',
}
