import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppData } from '../App'
import type { Transaction } from '../types'
import { formatMoney, todayIso } from '../lib/format'
import { computeMutualBalance } from '../lib/split'
import { supabase } from '../lib/supabase'
import { mensajeHumano } from '../lib/errores'
import { contextoPibbi, nombreParaSaludo, responderPibbi, saludoPibbi } from '../lib/pibbi-respuestas'
import ChatCapture from '../components/ChatCapture'
import Mascota from '../components/Mascota'
import PibbiDresser from '../components/PibbiDresser'
import ThemeToggle from '../components/ThemeToggle'
import { Alerta, Boton, IconoBalanza, IconoCheck, IconoCopiar, IconoMenu, IconoPuntos, IconoRopa, IconoSalir, IconoX, Tarjeta } from '../components/ui'

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
  // Menú "···" estilo Muse: vestir, tema y salir viven ahí, no
  // amontonados en el encabezado. El encabezado queda mínimo: dos
  // botones redondos, como en Muse (menú a la izquierda, "···" a la
  // derecha), sin avatar chiquito ni píldora de Salir.
  const [menuAbierto, setMenuAbierto] = useState(false)
  // PIBBI "trabajando": el héroe muestra "escribiendo…" mientras el
  // chat le pasa el estado (ver onEscribiendo en ChatCapture).
  const [escribiendo, setEscribiendo] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [liquidando, setLiquidando] = useState(false)
  const [liquidarError, setLiquidarError] = useState<string | null>(null)
  // La invitación no es una tarjeta gigante en el chat: es una tira
  // compacta que se puede cerrar y no vuelve (se guarda por código).
  const inviteCode = data.household?.invite_code ?? ''
  const [invitarOculto, setInvitarOculto] = useState(() => {
    try { return inviteCode ? localStorage.getItem(`fp-invitar-${inviteCode}`) === '1' : false } catch { return false }
  })
  function ocultarInvitar() {
    setInvitarOculto(true)
    try { if (inviteCode) localStorage.setItem(`fp-invitar-${inviteCode}`, '1') } catch { /* sin almacenamiento */ }
  }

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
  const debtorName = mutual?.debtor_id === data.me?.id ? 'Tú' : (data.partner ? nombreParaSaludo(data.partner.name) : 'Tu pareja')
  const creditorName = mutual?.creditor_id === data.me?.id ? 'ti' : (data.partner ? nombreParaSaludo(data.partner.name) : 'tu pareja')

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
      {/* Encabezado mínimo estilo Muse: dos botones redondos (menú a la
          izquierda, "···" a la derecha) y nada más. Vestir, tema y salir
          viven en el menú; el avatar grande y centrado es el héroe de
          abajo, no un circulito a la izquierda. */}
      <header className="sticky top-0 z-30 border-b border-borde/60 bg-noche/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Menú"
            aria-expanded={menuAbierto}
            className="rounded-full border border-borde bg-tarjeta p-2.5 text-crema shadow-tarjeta transition active:scale-95"
          >
            <IconoMenu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Más opciones"
            aria-expanded={menuAbierto}
            className="rounded-full border border-borde bg-tarjeta p-2.5 text-crema shadow-tarjeta transition active:scale-95"
          >
            <IconoPuntos className="h-5 w-5" />
          </button>
        </div>
      </header>

      {menuAbierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
          <div className="fixed inset-x-4 top-16 z-50 mx-auto max-w-lg rounded-[28px] border border-borde bg-tarjeta p-2 shadow-elevado" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuAbierto(false); setVestidor((v) => !v) }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold text-crema transition active:scale-[0.98]"
            >
              <IconoRopa className="h-5 w-5 text-doradotexto" /> Vestir a PIBBI
            </button>
            <div className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-crema">
              <span className="flex-1">Cambiar tema</span>
              <ThemeToggle className="rounded-full border border-borde bg-elevado p-2.5 text-crema transition active:scale-95" />
            </div>
            {onSignOut && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuAbierto(false); if (confirm('¿Cerrar sesión en este dispositivo?')) onSignOut() }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold text-rojosuave transition active:scale-[0.98]"
              >
                <IconoSalir className="h-5 w-5" /> Cerrar sesión
              </button>
            )}
          </div>
        </>
      )}

      {/* Héroe estilo Muse: PIBBI grande y centrado arriba del chat, con
          su nombre y su estado en una píldora debajo. Círculo h-24
          (96 px CSS; el de Muse mide ~85 px en un Galaxy, este es su
          equivalente con la imagen HD, nítida). Se desplaza con la
          conversación, como el avatar de Muse. */}
      <div className="flex flex-col items-center px-4 pb-1 pt-4 text-center">
        <Mascota pose="frente" marco="circulo" className="h-24 w-24" />
        <div className="mt-3 rounded-full border border-borde bg-elevado px-4 py-2 shadow-tarjeta">
          <p className="font-bold leading-tight">PIBBI</p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-humo">
            <span className={`h-1.5 w-1.5 rounded-full ${escribiendo ? 'bg-doradotexto' : 'bg-verde'}`} aria-hidden="true" />
            {escribiendo ? 'escribiendo…' : 'En línea'}
          </p>
        </div>
      </div>

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

      {/* Hogar de 1 persona: invitar a la pareja es una tira compacta y
          descartable, no una tarjeta gigante tapando el chat. La URL
          nunca se muestra (se partía a mitad de palabra): solo el código
          y el botón de copiar; el enlace va dentro del texto copiado. */}
      {!data.partner && data.household && !invitarOculto && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-full border border-borde bg-tarjeta py-1.5 pl-3 pr-1.5 shadow-tarjeta">
            <p className="min-w-0 flex-1 truncate text-xs">
              <span className="font-bold text-crema">Invita a tu pareja</span>
              <span className="text-humo"> · código </span>
              <span className="font-bold tracking-[0.2em] text-doradotexto">{data.household.invite_code}</span>
            </p>
            <button
              type="button"
              onClick={copyInvite}
              aria-label="Copiar código y enlace de invitación"
              title="Copiar código y enlace"
              className="shrink-0 rounded-full bg-elevado p-2 text-crema transition active:scale-90"
            >
              {copied ? <IconoCheck className="h-4 w-4" /> : <IconoCopiar className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={ocultarInvitar}
              aria-label="Ocultar invitación"
              title="Ocultar"
              className="shrink-0 rounded-full bg-elevado p-2 text-humo transition active:scale-90"
            >
              <IconoX className="h-4 w-4" />
            </button>
          </div>
          {copyFailed && <p role="alert" className="mt-1.5 text-center text-xs text-doradotexto">No se pudo copiar: el código es {data.household.invite_code}, cópialo a mano.</p>}
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
        onEscribiendo={setEscribiendo}
      />
    </main>
  )
}
