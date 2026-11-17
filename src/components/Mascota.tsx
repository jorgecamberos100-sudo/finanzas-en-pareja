/**
 * La mascota de la app: el cerdito rosa de la hoja de personaje.
 * Los recortes ya traen fondo azul marino, así que van en un marco
 * redondeado que se funde con el tema oscuro.
 */
interface Props {
  /** '/mascota.png' (de frente), '/mascota-celebrando.png' o '/mascota-ahorrando.png' */
  src?: string
  alt?: string
  className?: string
}

export default function Mascota({ src = '/mascota.png', alt = 'Nuestro cerdito de los ahorros', className = 'h-28 w-28' }: Props) {
  return <img src={src} alt={alt} className={`${className} rounded-3xl object-cover ring-1 ring-borde`} />
}
