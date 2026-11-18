import { useEffect, useId, useState } from 'react'
import { PIBBI_POSES, type MascotaPose } from '../lib/pibbi-poses'
import { usePibbi, type PibbiAccessory } from '../lib/pibbi'

export type { MascotaPose } from '../lib/pibbi-poses'

/**
 * La mascota de la app: PIBBI, el cerdito rosa de la hoja de personaje.
 *
 * Las fotos fuente traen un fondo azul marino horneado (sin transparencia).
 * Para que PIBBI se vea grande, nítido y SIN el cuadrito que desentona,
 * aquí se recorta ese fondo en un canvas (flood-fill desde las orillas:
 * solo se elimina el fondo conectado al borde, nunca el cuerpo de PIBBI)
 * y el resultado se cachea por pose. Las poses con fondo circular negro
 * intencional (perfil con lápiz, calculadora, avatar) se muestran como
 * insignia redonda, igual en tema día y noche.
 *
 * Las prendas se dibujan como SVG sobre la imagen, así cada persona ve
 * su propio PIBBI vestido. Si el canvas no está disponible, se usa la
 * imagen original (nunca se rompe la mascota).
 */

interface Props {
  pose?: MascotaPose
  /** Si no se pasa, usa el accesorio guardado de quien está usando la app. */
  accessory?: PibbiAccessory
  alt?: string
  className?: string
  /**
   * Marco de presentación. 'libre' (por defecto): cuerpo entero con el
   * fondo recortado, como hasta ahora. 'circulo': círculo grande y
   * centrado estilo avatar (como el de Muse): fondo suave, anillo tenue,
   * la imagen va con aire interior (padding 6%) para que nunca se
   * recorten orejas, brazos ni patitas, y sin sombra de suelo.
   * La imagen fuente es pequeña (frente 224×258, las demás 138–194 px):
   * a más de ~112 px de ancho en pantalla 2x ya se nota suave al
   * acercar. El círculo se usa a h-28 (112 px) como máximo.
   */
  marco?: 'libre' | 'circulo'
}

/** Cache de recortes por imagen fuente (data URI -> data URI sin fondo). */
const cacheRecortes = new Map<string, string>()

/** ¿El píxel es del fondo navy horneado? (azul dominante y oscuro) */
function esFondo(px: Uint8ClampedArray, o: number): boolean {
  return px[o + 2] > px[o] && px[o + 2] >= px[o + 1] && (px[o] + px[o + 1] + px[o + 2]) < 380
}

/** Recorta el fondo conectado al borde. Devuelve null si no se pudo. */
function recortarFondo(img: HTMLImageElement): string | null {
  try {
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return null
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const datos = ctx.getImageData(0, 0, w, h)
    const px = datos.data
    const n = w * h
    const visitado = new Uint8Array(n)
    const cola = new Int32Array(n)
    let cabeza = 0
    let fin = 0
    const empujar = (i: number) => {
      if (!visitado[i] && esFondo(px, i * 4)) {
        visitado[i] = 1
        cola[fin++] = i
      }
    }
    for (let x = 0; x < w; x++) { empujar(x); empujar((h - 1) * w + x) }
    for (let y = 0; y < h; y++) { empujar(y * w); empujar(y * w + w - 1) }
    while (cabeza < fin) {
      const i = cola[cabeza++]
      const x = i % w
      const y = (i / w) | 0
      if (x > 0) empujar(i - 1)
      if (x < w - 1) empujar(i + 1)
      if (y > 0) empujar(i - w)
      if (y < h - 1) empujar(i + w)
    }
    for (let i = 0; i < n; i++) if (visitado[i]) px[i * 4 + 3] = 0
    ctx.putImageData(datos, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
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

export default function Mascota({ pose = 'frente', accessory, alt = 'PIBBI, nuestro cerdito de los ahorros', className = 'h-24 w-24', marco = 'libre' }: Props) {
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

  const poseCfg = PIBBI_POSES[pose]
  // Insignia: pose con fondo circular negro intencional (avatar, perfil,
  // calculadora). Se ve igual en día y noche, como un chip redondo.
  const esInsignia = poseCfg.circular === true || poseCfg.accessories === false

  const [src, setSrc] = useState<string>(() => cacheRecortes.get(poseCfg.image) ?? poseCfg.image)
  const [listo, setListo] = useState<boolean>(() => esInsignia || cacheRecortes.has(poseCfg.image))

  useEffect(() => {
    if (esInsignia) {
      setSrc(poseCfg.image)
      setListo(true)
      return
    }
    const cacheado = cacheRecortes.get(poseCfg.image)
    if (cacheado) {
      setSrc(cacheado)
      setListo(true)
      return
    }
    setListo(false)
    let vivo = true
    const img = new Image()
    img.onload = () => {
      const recorte = recortarFondo(img)
      const final = recorte ?? poseCfg.image
      cacheRecortes.set(poseCfg.image, final)
      if (vivo) {
        setSrc(final)
        setListo(true)
      }
    }
    img.onerror = () => {
      if (vivo) {
        setSrc(poseCfg.image)
        setListo(true)
      }
    }
    img.src = poseCfg.image
    return () => { vivo = false }
  }, [poseCfg.image, esInsignia])

  // Micro-interacción al tocarlo: el envoltorio escala (hover/active) y el
  // interior sigue con su animación de flotar y pestañear. La animación CSS
  // de .pibbi-vivo pisa el transform de su propio elemento, por eso la
  // escala vive en el envoltorio y no en el mismo div.
  return (
    <div className={`relative shrink-0 transition-transform duration-150 hover:scale-105 active:scale-95 ${marco === 'circulo' ? 'pibbi-circulo' : ''} ${className}`} style={delays}>
      <div className="pibbi-vivo relative h-full w-full">
        {/* La respiración (escala leve) vive en su propio div, anidado:
            así no pelea con la flotación (translate) del padre y la imagen,
            los párpados y las prendas respiran todos juntos. */}
        <div className="pibbi-respira">
          <img
            src={src}
            alt={alt}
            className={`h-full w-full transition-opacity duration-300 ${listo ? 'opacity-100' : 'opacity-0'} ${
              esInsignia ? 'rounded-full bg-black object-cover' : 'pibbi-recorte object-contain'
            }`}
          />
          {/* Párpados de PIBBI: bajan cada ~4 s para que siempre esté pestañeando.
              Cada pose trae la posición de sus ojos (las de frente los tienen
              a ~30% de altura y ~28% / ~72% de ancho; las nuevas, en su sitio). */}
          {poseCfg.eyelids.map((e, i) => (
            <span key={i} aria-hidden="true" className="pibbi-parpado" style={{ left: `${e.left}%`, top: `${e.top}%` }} />
          ))}
          {poseCfg.accessories !== false && <Accesorio accessory={acc} />}
        </div>
      </div>
      {/* Sombra del suelo: fuera del div que flota, respira en contrafase.
          Las insignias redondas no llevan sombra: no están "de pie".
          Tampoco el marco circular: el círculo ya es el marco. */}
      {!esInsignia && marco !== 'circulo' && <span aria-hidden="true" className="pibbi-sombra" />}
    </div>
  )
}