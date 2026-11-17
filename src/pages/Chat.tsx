import type { AppData } from '../App'
import type { Transaction } from '../types'
import ChatCapture from '../components/ChatCapture'

interface Props {
  data: AppData
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) => Promise<void>
}

/** Pestaña Chat: captura por texto, foto o voz. La captura manual sigue en el botón +. */
export default function Chat({ data, onSave }: Props) {
  return (
    <main className="space-y-2">
      <header className="px-4 pt-4">
        <h1 className="text-2xl font-bold">Chat de captura 💬</h1>
        <p className="text-sm text-stone-500">
          Escríbelo, mándale foto al ticket o a tu libreta, o graba una nota de voz. Revisa la propuesta y confirma: nada se guarda solo.
        </p>
      </header>
      <ChatCapture data={data} onSave={onSave} />
    </main>
  )
}
