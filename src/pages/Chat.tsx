import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppData } from '../App'
import type { Transaction } from '../types'
import { formatMoney, todayIso } from '../lib/format'
import { computeMutualBalance } from '../lib/split'
import { supabase } from '../lib/supabase'
import { mensajeHumano } from '../lib/errores'
import { contextoPibbi, responderPibbi, saludoPibbi } from '../lib/pibbi-respuestas'
import ChatCapture from '../components/ChatCapture'
import Mascota from '../components/Mascota'
import PibbiDresser from '../components/PibbiDresser'
import ThemeToggle from '../components/ThemeToggle'
import { Alerta, Boton, IconoBalanza, IconoCheck, IconoCopiar, IconoRopa, IconoSalir, Tarjeta } from '../components/ui'

interface Props {
  data: AppData
  onSave: (tx: Omit<Transaction, 'id' | 'created_at' | 'household_id' | 'dedupe_hash'> & { dedupe_hash?: string | null }) => Promise<void>
  onRefresh: () => void
  onSignOut?: () => void
}

/**
 * Home: la conversación con PIBBI, como en Muse. Arriba PIBBI en su
 * círculo con su nombre, en el centro la charla (una cosa a la vez) y
 * abajo la barra de entrada con texto, foto y voz. Nada amontonado:
 * las secciones viven en sus pestañas y se llega a ellas desde la
 * navegación inferior o desde los atajos del chat.
 */
export default function Chat({ data, onSave, onRefresh, onSignOut }: Props) {
  const navigate = useNavigate()
  const [vestidor, setVestidor] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [liquidando, setLiquidando] = useState(false)
  const [liquidarError, setLiquidarError] = useState<string | null>(null)

  const currency = data.household?.currency ?? 'MXN'
  const ctx = useMemo(
    () =>
      contextoPibbi({
        meId: data.me?.id ?? '',
        meName: data.me?.name ?? 'pareja',
        partnerId: data.partner?.id ?? null,
        partnerName: data.partner?.name ?? null,
        currency,
        accounts: data.accounts,
        categories: data.categories,
        transactions: data.transactions,
        goals: data.goals,
        recurring: data.recurring,
        reminders: data.reminders,
        settlements: data.settlements,
      }),
    [data, currency],
  )
  const saludo = useMemo(() => saludoPibbi(ctx), [ctx])
  const responderLocal = useMemo(() => (texto: string) => responderPibbi(texto, ctx), [ctx])

  const mutual = useMemo(
    () => (data.me && data.partner ? computeMutualBalance(data.transactions, data.me.id, data.partner.id, data.settlements) : null),
    [data.transactions, data.me, data.partner, data.settlements],
  )
  const debtorName = mutual?.debtor_id === data.me?.id ? 'Tú' : data.partner?.name ?? 'Tu pareja'
  const creditorName = mutual?.creditor_id === data.me?.id ? 'ti' : data.partner?.name ?? 'tu pareja'

  async function liquidar() {
    if (!mutual || !data.me || !data.household || liquidando) return
    if (!confirm(`¿Confirmas que ${debtorName} le pagó ${formatMoney(mutual.amount, currency)} a ${creditorName}? Se registrará la liquidación.`)) return
    setLiquidando(true)
    setLiquidarError(null)
    // La liquidación es una transferencia entre personas: se registra como
    // money_date (revisión) y como transferencia, que NO cuenta como gasto.
    const { error } = await supabase.from('money_dates').insert({
      household_id: data.household.id, date: todayIso(),
      notes: `Liquidación de deuda mutua: ${formatMoney(mutual.amount, currency)}`, settled_amount: mutual.amount,
    })
    setLiquidando(false)
    if (error) { setLiquidarError(mensajeHumano(error.message, 'No se pudo registrar la liquidación. Inténtalo de nuevo.')); return }
    onRefresh()
  }

  async function copyInvite() {
    const code = data.household?.invite_code ?? ''
    const link = `${window.location.origin}/onboarding?codigo=${code}`
    setCopyFailed(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(`Únete a mi hogar en Finanzas en Pareja. Código: ${code} · Enlace: ${link}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopyFailed(true)
    }
  }

  const sugerencias = [
    { etiqueta: '¿Cuánto gasté hoy?', enviar: '¿Cuánto gasté hoy?' },
    { etiqueta: '¿Cuánto tengo?', enviar: '¿Cuánto tengo?' },
    ...(data.partner ? [{ etiqueta: '¿Quién le debe a quién?', enviar: '¿Quién le debe a quién?' }] : []),
    { etiqueta: 'Ver sobres', ir: '/presupuesto' },
    { etiqueta: 'Ver movimientos', ir: '/movimientos' },
    { etiqueta: 'Mis metas', ir: '/plan' },
  ]

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col">
      {/* Encabezado fijo estilo Muse: PIBBI en su círculo, su nombre y
          su estado; a la derecha vestir, tema y salir. */}
      <header className="sticky top-0 z-30 border-b border-borde/60 bg-noche/90 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Mascota pose="frente" marco="circulo" className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">PIBBI</p>
            <p className="text-xs text-humo">En línea · tu cerdito de los ahorros</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVestidor((v) => !v)}
              aria-label="Vestir a PIBBI"
              aria-pressed={vestidor}
              title="Vestir a PIBBI"
              className="rounded-full border border-borde bg-tarjeta p-2.5 text-crema shadow-tarjeta transition active:scale-95"
            >
              <IconoRopa className="h-4 w-4" />
            </button>
            <ThemeToggle className="rounded-full border border-borde bg-tarjeta p-2.5 text-crema shadow-tarjeta transition active:scale-95" />
            {onSignOut && (
              <button
                onClick={() => { if (confirm('¿Cerrar sesión en este dispositivo?')) onSignOut() }}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-borde bg-tarjeta px-3 py-2 text-xs font-semibold text-humo transition hover:border-foco hover:text-crema active:scale-95"
              >
                <IconoSalir className="h-4 w-4" /> Salir
              </button>
            )}
          </div>
        </div>
      </header>

      {vestidor && (
        <div className="px-4 pt-3">
          <Tarjeta className="p-4">
            <PibbiDresser />
          </Tarjeta>
        </div>
      )}

      {/* Deuda mutua: una sola acción clara, no una pila de tarjetas. */}
      {data.partner && mutual && (
        <div className="px-4 pt-3">
          <Tarjeta className="border-foco/60 bg-doradotenue p-4">
            <p className="flex items-center gap-2 font-bold"><IconoBalanza className="h-5 w-5 text-doradotexto" /> Deuda mutua</p>
            <p className="mt-1 text-sm">{debtorName} le debe <strong className="nums">{formatMoney(mutual.amount, currency)}</strong> a {creditorName}.</p>
            <Boton onClick={liquidar} cargando={liquidando} className="mt-3 w-full">Liquidar ahora</Boton>
            {liquidarError && <div className="mt-2"><Alerta>{liquidarError}</Alerta></div>}
          </Tarjeta>
        </div>
      )}

      {/* Hogar de 1 persona: invitar a la pareja es una opción, no un requisito. */}
      {!data.partner && data.household && (
        <div className="px-4 pt-3">
          <Tarjeta className="border-foco/60 p-4">
            <p className="font-bold">Invita a tu pareja (opcional)</p>
            <p className="mb-3 mt-1 text-sm text-humo">Usas la app solo por ahora. Cuando quieras, tu pareja crea su cuenta y se une con este código.</p>
            <div className="mb-3 rounded-2xl bg-doradotenue p-3 text-center">
              <p className="font-display text-2xl font-extrabold tracking-[0.25em] text-doradotexto">{data.household.invite_code}</p>
              <p className="mt-1 break-all text-xs text-humo">{`${window.location.origin}/onboarding?codigo=${data.household.invite_code}`}</p>
            </div>
            <Boton onClick={copyInvite} className="w-full">
              {copied ? <><IconoCheck className="h-4 w-4" /> ¡Copiado!</> : <><IconoCopiar className="h-4 w-4" /> Copiar código y enlace</>}
            </Boton>
            {copyFailed && <p role="alert" className="mt-2 text-center text-xs text-doradotexto">No se pudo copiar automáticamente: copia el código y el enlace de la tarjeta.</p>}
          </Tarjeta>
        </div>
      )}

      <ChatCapture
        data={data}
        onSave={onSave}
        onRefresh={onRefresh}
        saludo={saludo}
        responderLocal={responderLocal}
        sugerencias={sugerencias}
        onIr={(ruta) => navigate(ruta)}
      />
    </main>
  )
}
