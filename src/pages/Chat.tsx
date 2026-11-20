import type { AppData } from '../App'
import type { Transaction } from '../types'
import { capturasRestantes, capturasUsadas, defPlan } from '../lib/planes'
import ChatCapture from '../components/ChatCapture'
import PibbiHeader from '../components/PibbiHeader'
import ThemeToggle from '../components/ThemeToggle'
import { PAGE_PIBBI_POSES } from '../lib/pibbi-poses'
import { usePibbi } from '../lib/pibbi'
import { saludoPibbi } from '../lib/pibbi-identidad'

interface Props {
  data: AppData
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) => Promise<void>
  onRefresh: () => void
}

/** Pestaña Chat: captura por texto, foto o voz. La captura manual sigue en el botón +. */
export default function Chat({ data, onSave, onRefresh }: Props) {
  const def = defPlan(data.plan)
  const { name, vibe } = usePibbi()
  return (
    <main className="space-y-2">
      <PibbiHeader
        pose={PAGE_PIBBI_POSES.chat}
        // Título sin salto: con el interruptor en el encabezado, a 360 px
        // el emoji 💬 bajaba solo a una segunda línea y se veía roto.
        // Sin salto, el título conserva su ancho y el interruptor baja a
        // una segunda línea del encabezado (flex-wrap), como los botones
        // de Movimientos.
        title={<span className="whitespace-nowrap">Chat de captura</span>}
        subtitle={
          <>
            <p className="text-sm text-humo">
              {saludoPibbi(vibe, name)} Escríbelo, mándale foto al ticket o a tu libreta, o graba una nota de voz. Revisa la propuesta y confirma: nada se guarda solo.
              También puedes pedirme un recordatorio: “recuérdame pagar la renta el 1ro”.
            </p>
            <p className="mt-1 text-xs text-humo">
              Plan {def.nombre} · Capturas con IA este mes: {capturasUsadas(data.plan)}/{def.capturasIaMes}
              {capturasRestantes(data.plan) === 0 ? ' · Llegaste al límite, pásate a Plus para seguir' : ''}
            </p>
          </>
        }
        className="px-4 pt-4"
      >
        {/* El interruptor vive en el encabezado (no en la barra inferior). */}
        <ThemeToggle className="rounded-full border border-borde bg-elevado p-2.5 text-crema transition active:scale-95" />
      </PibbiHeader>
      <ChatCapture data={data} onSave={onSave} onRefresh={onRefresh} />
    </main>
  )
}
