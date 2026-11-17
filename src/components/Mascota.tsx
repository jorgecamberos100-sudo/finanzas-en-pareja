import { MASCOTA, MASCOTA_AHORRANDO, MASCOTA_CELEBRANDO } from '../lib/mascota-images'

/**
 * La mascota de la app: PIBBI, el cerdito rosa de la hoja de personaje.
 * Los recortes ya traen fondo azul marino, así que van en un marco
 * redondeado que se funde con el tema oscuro.
 */
interface Props {
  /** 'frente' (de frente), 'celebrando' o 'ahorrando' (sentado con moneda) */
  pose?: 'frente' | 'celebrando' | 'ahorrando'
  alt?: string
  className?: string
}

const POSES = { frente: MASCOTA, celebrando: MASCOTA_CELEBRANDO, ahorrando: MASCOTA_AHORRANDO }

export default function Mascota({ pose = 'frente', alt = 'PIBBI, nuestro cerdito de los ahorros', className = 'h-28 w-28' }: Props) {
  return <img src={POSES[pose]} alt={alt} className={`${className} rounded-3xl object-cover ring-1 ring-borde`} />
}
