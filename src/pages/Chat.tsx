import type { AppData } from '../App'
import type { Transaction } from '../types'
import { capturasRestantes, capturasUsadas, defPlan } from '../lib/planes'
import ChatCapture from '../components/ChatCapture'
import PibbiHeader from '../components/PibbiHeader'
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
        title="Chat de captura 💬"
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
      />
      <ChatCapture data={data} onSave={onSave} onRefresh={onRefresh} />
    </main>
  )
}
