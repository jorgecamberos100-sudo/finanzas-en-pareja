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
import { Alerta, Boton, Confirmar, IconoBalanza, IconoCorazon, IconoPuntos, IconoRopa, IconoSalir, Tarjeta } from '../components/ui'

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
  // Menú "···" estilo Muse: es el Perfil y ajustes de la app. El
  // encabezado queda mínimo: un solo botón "···" a la derecha (antes
  // había dos botones que abrían el mismo menú). La invitación a la
  // pareja vive aquí, en su sección, no en el chat.
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [invitarAbierto, setInvitarAbierto] = useState(false)
  const [confirmarSalir, setConfirmarSalir] = useState(false)
  const [confirmarLiquidar, setConfirmarLiquidar] = useState(false)
  // PIBBI "trabajando": el héroe muestra "escribiendo…" mientras el
  // chat le pasa el estado (ver onEscribiendo en ChatCapture).
  const [escribiendo, setEscribiendo] = useState(false)
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
  const debtorName = mutual?.debtor_id === data.me?.id ? 'Tú' : (data.partner ? nombreParaSaludo(data.partner.name) : 'Tu pareja')
  const creditorName = mutual?.creditor_id === data.me?.id ? 'ti' : (data.partner ? nombreParaSaludo(data.partner.name) : 'tu pareja')

  async function liquidar() {
    if (!mutual || !data.me || !data.household || liquidando) return
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
      {/* Encabezado mínimo estilo Muse: un solo botón "···" a la
          derecha, y el héroe de PIBBI DENTRO del encabezado fijo:
          como en Muse, el avatar queda fijo solapando la parte
          superior y NO se desplaza con la conversación al hacer
          scroll. Antes el héroe se iba al bajar y PIBBI desaparecía. */}
      <header className="sticky top-0 z-50 border-b border-borde/60 bg-noche/90 backdrop-blur-xl">
        <div className="flex items-center justify-end px-4 py-2">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Perfil y ajustes"
            aria-expanded={menuAbierto}
            className="rounded-full border border-borde bg-tarjeta p-2.5 text-crema shadow-tarjeta transition active:scale-95"
          >
            <IconoPuntos className="h-5 w-5" />
          </button>
        </div>

        {/* Héroe estilo Muse: PIBBI grande y centrado arriba del chat,
            con su nombre y su estado en una píldora debajo. Círculo
            h-24 (96 px CSS; el de Muse mide ~85 px en un Galaxy, este
            es su equivalente con la imagen HD, nítida). Al vivir en el
            encabezado fijo, PIBBI siempre está en pantalla. */}
        <div className="flex flex-col items-center px-4 pb-3 pt-1 text-center">
          <Mascota pose="frente" marco="circulo" className="h-24 w-24" />
          <div className="mt-3 rounded-full border border-borde bg-elevado px-4 py-2 shadow-tarjeta">
            <p className="font-bold leading-tight">PIBBI</p>
            <p className="flex items-center justify-center gap-1.5 text-xs text-humo">
              <span className={`h-1.5 w-1.5 rounded-full ${escribiendo ? 'bg-doradotexto' : 'bg-verde'}`} aria-hidden="true" />
              {escribiendo ? 'escribiendo…' : 'En línea'}
            </p>
          </div>
        </div>

        {/* El panel del menu vive dentro del encabezado fijo y se ancla
            justo debajo de el (top-full): antes abria en top-16 y con
            el heroe fijo tapaba a PIBBI. */}
        {menuAbierto && (
          <div className="absolute inset-x-4 top-full z-50 mx-auto mt-2 max-w-lg rounded-[28px] border border-borde bg-tarjeta p-2 shadow-elevado" role="menu" aria-label="Perfil y ajustes">
            {/* Perfil: quién eres, como en WhatsApp. */}
            <div className="flex items-center gap-3 px-3 py-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dorado text-lg font-extrabold text-white" aria-hidden="true">
                {(data.me?.name ?? 'Y').trim().charAt(0).toUpperCase() || 'Y'}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-crema">{data.me?.name ?? 'Yo'}{data.partner ? ` y ${nombreParaSaludo(data.partner.name)}` : ''}</p>
                <p className="truncate text-xs text-humo">{data.me?.email ?? ''}</p>
              </div>
            </div>

            <p className="px-3 pb-1 pt-2 text-xs font-bold text-humo">PIBBI</p>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuAbierto(false); setVestidor((v) => !v) }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold text-crema transition active:scale-[0.98]"
            >
              <IconoRopa className="h-5 w-5 text-doradotexto" /> Vestir a PIBBI
            </button>

            {/* La invitación vive aquí, en su sección, no al principio
                del chat: solo se ve cuando no hay pareja. El enlace
                nunca se muestra (se partía a mitad de palabra): solo el
                código y el botón de copiar. */}
            {!data.partner && data.household && (
              <>
                <p className="px-3 pb-1 pt-2 text-xs font-bold text-humo">Hogar</p>
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={invitarAbierto}
                  onClick={() => setInvitarAbierto((v) => !v)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold text-crema transition active:scale-[0.98]"
                >
                  <IconoCorazon className="h-5 w-5 text-doradotexto" /> Invitar a tu pareja
                </button>
                {invitarAbierto && (
                  <div className="mx-1 mb-1 rounded-2xl bg-elevado p-3 text-center">
                    <p className="text-xs text-humo">Tu pareja crea su cuenta y se une con este código.</p>
                    <p className="mt-1 font-display text-2xl font-extrabold tracking-[0.3em] text-doradotexto">{data.household.invite_code}</p>
                    <Boton variante="secundario" tamano="sm" className="mt-2 w-full" onClick={() => void copyInvite()}>
                      {copied ? '¡Copiado!' : 'Copiar código y enlace'}
                    </Boton>
                    {copyFailed && <p role="alert" className="mt-2 text-xs text-doradotexto">No se pudo copiar: el código es {data.household.invite_code}, cópialo a mano.</p>}
                  </div>
                )}
              </>
            )}

            <p className="px-3 pb-1 pt-2 text-xs font-bold text-humo">App</p>
            <div className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-crema">
              <span className="flex-1">Cambiar tema</span>
              <ThemeToggle className="rounded-full border border-borde bg-elevado p-2.5 text-crema transition active:scale-95" />
            </div>

            <p className="px-3 pb-1 pt-2 text-xs font-bold text-humo">Sesión</p>
            {onSignOut && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuAbierto(false); setConfirmarSalir(true) }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold text-rojosuave transition active:scale-[0.98]"
              >
                <IconoSalir className="h-5 w-5" /> Cerrar sesión
              </button>
            )}
          </div>
        )}
      </header>

      {menuAbierto && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
      )}

      {vestidor && (
        <div className="px-4 pt-3">
          <Tarjeta className="p-4">
            <PibbiDresser />
          </Tarjeta>
        </div>
      )}

      {/* Deuda mutua: una sola acción clara, no una pila de tarjetas.
          Es la única tarjeta sobre el chat y se queda porque es una
          acción (liquidar), no un anuncio: la invitación ya no vive
          aquí, vive en el menú de perfil. */}
      {data.partner && mutual && (
        <div className="px-4 pt-3">
          <Tarjeta className="border-foco/60 bg-doradotenue p-4">
            <p className="flex items-center gap-2 font-bold"><IconoBalanza className="h-5 w-5 text-doradotexto" /> Deuda mutua</p>
            <p className="mt-1 text-sm">{debtorName} le debe <strong className="nums">{formatMoney(mutual.amount, currency)}</strong> a {creditorName}.</p>
            <Boton onClick={() => setConfirmarLiquidar(true)} className="mt-3 w-full">Liquidar ahora</Boton>
            {liquidarError && <div className="mt-2"><Alerta>{liquidarError}</Alerta></div>}
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
        onEscribiendo={setEscribiendo}
      />

      <Confirmar
        abierto={confirmarLiquidar}
        titulo="Liquidar la deuda mutua"
        mensaje={`¿Confirmas que ${debtorName} le pagó ${mutual ? formatMoney(mutual.amount, currency) : ''} a ${creditorName}? Se registrará la liquidación.`}
        textoConfirmar="Sí, liquidar"
        onConfirmar={() => { setConfirmarLiquidar(false); void liquidar() }}
        onCancelar={() => setConfirmarLiquidar(false)}
      />
      {onSignOut && (
        <Confirmar
          abierto={confirmarSalir}
          titulo="Cerrar sesión"
          mensaje="¿Cerrar sesión en este dispositivo?"
          textoConfirmar="Cerrar sesión"
          peligro
          onConfirmar={() => { setConfirmarSalir(false); onSignOut() }}
          onCancelar={() => setConfirmarSalir(false)}
        />
      )}
    </main>
  )
}
