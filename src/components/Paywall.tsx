import { useEffect, useState } from 'react'
import { PLANES, etiquetaPrecio, iniciarCheckout } from '../lib/planes'
import type { PlanId } from '../types'

interface Props {
  /** Por qué apareció el paywall (ej. "Ya usaste tus 10 capturas con IA de este mes."). */
  motivo: string
  onClose: () => void
}

/**
 * Paywall de Plus: explica qué incluye el plan y su precio, y deja el
 * hueco del checkout. Hoy no hay Stripe conectado: los botones muestran
 * que el pago se activará pronto (ver iniciarCheckout en lib/planes.ts).
 * La captura manual con el botón + siempre es gratis y sin límite.
 */
export default function Paywall({ motivo, onClose }: Props) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const plus = PLANES.plus
  const fundadores = PLANES.fundadores

  // Cerrar con Escape para accesibilidad de teclado
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function elegir(plan: PlanId) {
    const res = iniciarCheckout(plan)
    setMensaje(res.mensaje)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Plan Plus de Finanzas en Pareja"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-tarjeta p-5 sm:rounded-3xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold">Pásate a Plus ✨</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg px-2 py-1 text-lg text-humo hover:text-crema"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-humo">{motivo}</p>

        <ul className="mb-3 space-y-1.5 text-sm">
          <li>✅ Capturas con IA ilimitadas (uso justo: {plus.capturasIaMes} al mes)</li>
          <li>✅ Sobres y metas sin límite</li>
          <li>✅ Historial completo, sin límite de 90 días</li>
          <li>✅ Exportar tus movimientos en CSV</li>
        </ul>

        <div className="mb-3 rounded-2xl border border-foco/60 bg-doradotenue p-4">
          <p className="font-bold">Plus — {etiquetaPrecio(plus)}</p>
          <p className="text-xs text-humo">Por hogar, no por persona. Cancela cuando quieras.</p>
          <button
            onClick={() => elegir('plus')}
            className="mt-2 w-full rounded-xl bg-dorado py-2 text-sm font-extrabold tracking-wide text-tinta"
          >
            Quiero Plus — $59/mes
          </button>
          <button
            onClick={() => elegir('plus')}
            className="mt-2 w-full rounded-xl border border-borde py-2 text-sm font-semibold text-doradotexto"
          >
            Quiero Plus anual — $399/año
          </button>
        </div>

        <div className="mb-3 rounded-2xl border border-borde bg-elevado p-4">
          <p className="font-bold">Fundadores — {etiquetaPrecio(fundadores)}</p>
          <p className="text-xs text-humo">Lo mismo que Plus, de por vida, por un solo pago. Solo para los primeros 100 hogares.</p>
          <button
            onClick={() => elegir('fundadores')}
            className="mt-2 w-full rounded-xl border border-borde py-2 text-sm font-semibold text-doradotexto"
          >
            Quiero ser Fundador — $699
          </button>
        </div>

        {mensaje && (
          <p role="status" className="mb-3 rounded-xl bg-elevado p-3 text-sm text-doradotexto">
            {mensaje}
          </p>
        )}

        <p className="mb-3 text-center text-xs text-humo">
          La captura manual con el botón + siempre es gratis y sin límite, con cualquier plan.
        </p>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-elevado py-2 text-sm font-semibold text-humo"
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}
