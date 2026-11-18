/**
 * Kit de interfaz premium de Finanzas en Pareja.
 * - Iconos SVG propios (stroke currentColor): nada de emojis como iconos.
 * - Botones con estado deshabilitado real, spinner y micro-interacción.
 * - Campos con etiqueta visible, icono y error por campo (en español).
 * - Tarjetas con sombra por tema, esqueletos de carga y logo con PIBBI.
 * Todo usa los tokens del tema (noche/día): funciona igual en ambos.
 */
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import Mascota from './Mascota'

// ---------- Iconos SVG ----------
function Svg({ className = 'h-5 w-5', children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  )
}
type PIcono = { className?: string }
export const IconoCorreo = ({ className }: PIcono) => <Svg className={className}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></Svg>
export const IconoCandado = ({ className }: PIcono) => <Svg className={className}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" /></Svg>
export const IconoUsuario = ({ className }: PIcono) => <Svg className={className}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" /></Svg>
export const IconoOjo = ({ className }: PIcono) => <Svg className={className}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
export const IconoOjoCerrado = ({ className }: PIcono) => <Svg className={className}><path d="M4 4l16 16" /><path d="M10.6 6c.46-.07.93-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.3 3.2M6.6 6.9A16.6 16.6 0 0 0 2.5 12S6 18.1 12 18.1c1.2 0 2.3-.24 3.3-.62" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>
export const IconoFlechaDer = ({ className }: PIcono) => <Svg className={className}><path d="M4 12h15m0 0-6-6m6 6-6 6" /></Svg>
export const IconoFlechaIzq = ({ className }: PIcono) => <Svg className={className}><path d="M20 12H5m0 0 6-6m-6 6 6 6" /></Svg>
export const IconoCheck = ({ className }: PIcono) => <Svg className={className}><path d="m4.5 12.5 5 5 10-11" /></Svg>
export const IconoX = ({ className }: PIcono) => <Svg className={className}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const IconoMas = ({ className }: PIcono) => <Svg className={className}><path d="M12 5v14M5 12h14" /></Svg>
export const IconoCamara = ({ className }: PIcono) => <Svg className={className}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1L9 4h6l1.5 2h1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5Z" /><circle cx="12" cy="12.5" r="3.2" /></Svg>
export const IconoMicrofono = ({ className }: PIcono) => <Svg className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></Svg>
export const IconoEnviar = ({ className }: PIcono) => <Svg className={className}><path d="M4.5 12 20 4.5 14.5 20l-3-6.5Z" /><path d="m11.5 13.5 8.5-9" /></Svg>
export const IconoInicio = ({ className }: PIcono) => <Svg className={className}><path d="m4 11 8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></Svg>
export const IconoLista = ({ className }: PIcono) => <Svg className={className}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></Svg>
export const IconoSobre = ({ className }: PIcono) => <Svg className={className}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 9h18" /><path d="M7 14h4" /></Svg>
export const IconoMeta = ({ className }: PIcono) => <Svg className={className}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></Svg>
export const IconoChat = ({ className }: PIcono) => <Svg className={className}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4Z" /><path d="M8.5 9h7M8.5 12.5h4" /></Svg>
export const IconoCampana = ({ className }: PIcono) => <Svg className={className}><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15Z" /><path d="M10 20a2 2 0 0 0 4 0" /></Svg>
export const IconoBalanza = ({ className }: PIcono) => <Svg className={className}><path d="M12 4v16M7 20h10" /><path d="M12 6 5 8m7-2 7 2" /><path d="M5 8 2.8 13a3 3 0 0 0 4.4 0ZM19 8l-2.2 5a3 3 0 0 0 4.4 0Z" /></Svg>
export const IconoCalendario = ({ className }: PIcono) => <Svg className={className}><rect x="4" y="5.5" width="16" height="15" rx="2.5" /><path d="M4 10h16M8 3.5v4M16 3.5v4" /></Svg>
export const IconoCorazon = ({ className }: PIcono) => <Svg className={className}><path d="M12 20s-7.5-4.6-9-9.2C2 7.5 4 5 6.8 5c2 0 3.6 1.1 5.2 3.1C13.6 6.1 15.2 5 17.2 5 20 5 22 7.5 21 10.8 19.5 15.4 12 20 12 20Z" /></Svg>
export const IconoLlave = ({ className }: PIcono) => <Svg className={className}><circle cx="8" cy="14" r="4.5" /><path d="m11.5 10.5 8-8M17 5l2.5 2.5M14.5 7.5 17 10" /></Svg>
export const IconoCopiar = ({ className }: PIcono) => <Svg className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" /></Svg>
export const IconoSalir = ({ className }: PIcono) => <Svg className={className}><path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14" /><path d="M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5" /></Svg>
export const IconoAlerta = ({ className }: PIcono) => <Svg className={className}><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4" /><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" /></Svg>
export const IconoBrillo = ({ className }: PIcono) => <Svg className={className}><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9Z" /><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" /></Svg>
export const IconoGasto = ({ className }: PIcono) => <Svg className={className}><path d="M12 5v13m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></Svg>
export const IconoIngreso = ({ className }: PIcono) => <Svg className={className}><path d="M12 19V6m0 0 5 5m-5-5-5 5" /><path d="M5 4h14" /></Svg>
export const IconoTransferencia = ({ className }: PIcono) => <Svg className={className}><path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5" /><path d="M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" /></Svg>
export const IconoReloj = ({ className }: PIcono) => <Svg className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
export const IconoBuscar = ({ className }: PIcono) => <Svg className={className}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Svg>

// ---------- Spinner propio (aro menta) ----------
export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// ---------- Botón ----------
type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'oscuro' | 'peligro'
interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
  tamano?: 'sm' | 'md'
  cargando?: boolean
}
const ESTILO_VARIANTE: Record<VarianteBoton, string> = {
  primario: 'bg-dorado text-tinta shadow-fab hover:brightness-105',
  secundario: 'border border-borde bg-elevado text-crema hover:border-foco/60',
  fantasma: 'text-doradotexto hover:bg-elevado',
  oscuro: 'bg-tinta text-white hover:brightness-110',
  peligro: 'bg-rojosuave/15 text-rojosuave hover:bg-rojosuave/25',
}
export function Boton({ variante = 'primario', tamano = 'md', cargando = false, disabled, className = '', children, type = 'button', ...rest }: PropsBoton) {
  const pad = tamano === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      className={`inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-bold tracking-wide transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${pad} ${ESTILO_VARIANTE[variante]} ${className}`}
      {...rest}
    >
      {cargando && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

// ---------- Campos con etiqueta visible, icono y error por campo ----------
function MarcoCampo({ etiqueta, icono, error, ayuda, children }: {
  etiqueta: string; icono?: ReactNode; error?: string | null; ayuda?: string; children: ReactNode
}) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-crema">
        {icono}{etiqueta}
      </span>
      <div className="relative">{children}</div>
      {error ? (
        <p role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-medium text-rojosuave">
          <IconoAlerta className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
        </p>
      ) : ayuda ? (
        <p className="mt-1.5 text-xs text-humo">{ayuda}</p>
      ) : null}
    </label>
  )
}
const CLASE_INPUT = 'w-full rounded-xl border bg-tarjeta px-3.5 py-3 text-base text-crema placeholder:text-humo/70 transition-colors focus:border-foco'
function claseBorde(error?: string | null) {
  return error ? 'border-rojosuave ring-1 ring-rojosuave/40' : 'border-borde'
}
interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string
  icono?: ReactNode
  error?: string | null
  ayuda?: string
}
export function Campo({ etiqueta, icono, error, ayuda, className = '', ...rest }: PropsCampo) {
  return (
    <MarcoCampo etiqueta={etiqueta} icono={icono} error={error} ayuda={ayuda}>
      <input className={`${CLASE_INPUT} ${claseBorde(error)} ${className}`} aria-invalid={Boolean(error)} {...rest} />
    </MarcoCampo>
  )
}
interface PropsCampoClave extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  etiqueta: string
  error?: string | null
  ayuda?: string
}
export function CampoClave({ etiqueta, error, ayuda, className = '', ...rest }: PropsCampoClave) {
  const [ver, setVer] = useState(false)
  return (
    <MarcoCampo etiqueta={etiqueta} icono={<IconoCandado className="h-4 w-4 text-humo" />} error={error} ayuda={ayuda}>
      <input
        type={ver ? 'text' : 'password'}
        className={`${CLASE_INPUT} ${claseBorde(error)} pr-12 ${className}`}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-humo transition hover:text-crema active:scale-90"
      >
        {ver ? <IconoOjoCerrado /> : <IconoOjo />}
      </button>
    </MarcoCampo>
  )
}

// ---------- Tarjeta / esqueleto / alerta ----------
export function Tarjeta({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-3xl border border-borde bg-tarjeta shadow-tarjeta ${className}`}>{children}</div>
}
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`esqueleto rounded-2xl ${className}`} aria-hidden="true" />
}
export function Alerta({ children, tono = 'error' }: { children: ReactNode; tono?: 'error' | 'exito' | 'info' }) {
  const estilo = tono === 'error'
    ? 'border-rojosuave/30 bg-rojosuave/10 text-rojosuave'
    : tono === 'exito'
      ? 'border-verde/30 bg-verde/10 text-verde'
      : 'border-foco/30 bg-doradotenue text-doradotexto'
  return (
    <div role={tono === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${estilo}`}>
      {tono === 'error' ? <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" /> : <IconoCheck className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ---------- Barra de pasos del onboarding ----------
export function PasoBarra({ paso, total }: { paso: number; total: number }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-humo">Paso {paso} de {total}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i < paso ? 'w-5 bg-foco' : 'w-1.5 bg-borde'}`} />
          ))}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-borde">
        <div className="h-full rounded-full bg-foco transition-transform duration-500" style={{ transform: `scaleX(${paso / total})`, transformOrigin: 'left' }} />
      </div>
    </div>
  )
}

// ---------- Logo: wordmark con PIBBI integrado (sin duplicar) ----------
export function Logo({ conPibbi = true, tamano = 'md', className = '' }: { conPibbi?: boolean; tamano?: 'sm' | 'md' | 'lg'; className?: string }) {
  const txt = tamano === 'lg' ? 'text-2xl' : tamano === 'sm' ? 'text-base' : 'text-lg'
  const pig = tamano === 'lg' ? 'h-12 w-12' : tamano === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {conPibbi && <Mascota pose="frente" className={`${pig} shrink-0`} alt="" />}
      <div className="leading-none">
        <p className={`font-display ${txt} font-extrabold tracking-tight text-crema`}>
          Finanzas<span className="text-doradotexto"> en Pareja</span>
        </p>
        {tamano !== 'sm' && <p className="mt-1 text-[11px] font-medium text-humo">Su dinero, en equipo</p>}
      </div>
    </div>
  )
}