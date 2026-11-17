import type { AppData } from '../App'
import type { Transaction } from '../types'
import ChatCapture from '../components/ChatCapture'
import Mascota from '../components/Mascota'

interface Props {
  data: AppData
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) => Promise<void>
  onRefresh: () => void
}

/** Pestaña Chat: captura por texto, foto o voz. La captura manual sigue en el botón +. */
export default function Chat({ data, onSave, onRefresh }: Props) {
  return (
    <main className="space-y-2">
      <header className="flex items-start gap-3 px-4 pt-4">
        <Mascota className="h-14 w-14 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold">Chat de captura 💬</h1>
          <p className="text-sm text-humo">
            Soy PIBBI 🐷 Escríbelo, mándale foto al ticket o a tu libreta, o graba una nota de voz. Revisa la propuesta y confirma: nada se guarda solo.
            También puedes pedirme un recordatorio: “recuérdame pagar la renta el 1ro”.
          </p>
        </div>
      </header>
      <ChatCapture data={data} onSave={onSave} onRefresh={onRefresh} />
    </main>
  )
}
