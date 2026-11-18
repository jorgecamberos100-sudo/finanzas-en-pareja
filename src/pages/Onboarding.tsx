import { useEffect, useRef, useState } from 'react'
import { supabase, setHouseholdId, getHouseholdId, findMyHouseholdId } from '../lib/supabase'
import { traducirErrorAuth, esCorreoYaRegistrado } from '../lib/auth'
import { crearHogar } from '../lib/household'
import { resolverSesionExistente } from '../lib/google-auth'
import { mensajeHumano } from '../lib/errores'
import Mascota from '../components/Mascota'
import PibbiHeader from '../components/PibbiHeader'
import { PAGE_PIBBI_POSES } from '../lib/pibbi-poses'
import PibbiDresser from '../components/PibbiDresser'
import ThemeToggle from '../components/ThemeToggle'
import GoogleSignInButton from '../components/GoogleSignInButton'
import {
  Alerta, Boton, Campo, CampoClave, IconoCheck, IconoCopiar, IconoCorreo, IconoCorazon,
  IconoFlechaDer, IconoFlechaIzq, IconoLlave, IconoUsuario, PasoBarra, Tarjeta,
} from '../components/ui'

interface Props { onDone: () => void }

const SEED_CATEGORIES = [
  { group: 'Vivienda', name: 'Renta / Hipoteca', icon: '🏠', monthly_limit: 8000, rollover: false },
  { group: 'Servicios', name: 'Luz, agua e internet', icon: '💡', monthly_limit: 1500, rollover: false },
  { group: 'Despensa', name: 'Súper y mercado', icon: '🛒', monthly_limit: 6000, rollover: true },
  { group: 'Transporte', name: 'Gasolina y transporte', icon: '🚗', monthly_limit: 2500, rollover: true },
  { group: 'Salud', name: 'Salud y farmacia', icon: '💊', monthly_limit: 1200, rollover: true },
  { group: 'Restaurantes', name: 'Comer fuera', icon: '🍽️', monthly_limit: 2000, rollover: false },
  { group: 'Ocio', name: 'Ocio y entretenimiento', icon: '🎬', monthly_limit: 1200, rollover: false },
  { group: 'Suscripciones', name: 'Suscripciones', icon: '📺', monthly_limit: 600, rollover: false },
  { group: 'Educación', name: 'Educación', icon: '📚', monthly_limit: 1000, rollover: true },
  { group: 'Ropa', name: 'Ropa', icon: '👕', monthly_limit: 800, rollover: true },
  { group: 'Imprevistos', name: 'Imprevistos', icon: '🆘', monthly_limit: 1000, rollover: true },
  { group: 'Metas', name: 'Ahorro para metas', icon: '🎯', monthly_limit: 2000, rollover: true },
  { group: 'Ingresos', name: 'Sueldo', icon: '💼', monthly_limit: 0, rollover: false },
]

const CORREO_RE = /^\S+@\S+\.\S+$/

/** Vistas de autenticación. El login NO es un paso del registro. */
type Vista = 'registro' | 'login' | 'recuperar' | 'nueva' | 'confirma'
interface ErroresCampo { nombre?: string; correo?: string; clave?: string; confirma?: string }

/** Wizard de 5 pasos: cuenta → modo (solo o en pareja) → invitación opcional → viste a PIBBI → listo. */
export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(1)
  const [vista, setVista] = useState<Vista>('registro')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nuevaClave, setNuevaClave] = useState('')
  const [nuevaConfirma, setNuevaConfirma] = useState('')
  const [householdName, setHouseholdName] = useState('Nuestro hogar')
  const [inviteCode, setInviteCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinExpanded, setJoinExpanded] = useState(false)
  const [soloMode, setSoloMode] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<ErroresCampo>({})
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  // El enlace de invitación del paso 3 es /onboarding?codigo=XXXXXX: prellenar
  // el código y desplegar la sección de unirse, para que el enlace funcione.
  // El enlace de recuperación es /onboarding?recuperar=1#...type=recovery.
  const recuperacionPendiente = useRef(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const codigo = params.get('codigo')
    if (codigo) {
      setJoinCode(codigo.trim().toUpperCase())
      setJoinExpanded(true)
    }
    if (params.get('recuperar') === '1' || window.location.hash.includes('type=recovery')) {
      recuperacionPendiente.current = true
      setVista('nueva')
    }
  }, [])

  /**
   * Al volver de Google la sesión ya existe: no pedir correo/contraseña.
   * Si el usuario ya tiene hogar, entra directo al Dashboard; si no,
   * sigue al paso 2 a crear o unirse a uno (la misma regla del login).
   * El `getSession` cubre el regreso con la sesión ya canjeada y el
   * `SIGNED_IN` cubre el canje que termina después de montar.
   * Durante una recuperación de contraseña NO se resuelve el destino:
   * primero se elige la nueva contraseña.
   */
  const sesionResuelta = useRef(false)
  useEffect(() => {
    async function resolver(userId: string) {
      if (sesionResuelta.current || recuperacionPendiente.current) return
      sesionResuelta.current = true
      await resolverSesionExistente(findMyHouseholdId, userId, {
        setHouseholdId,
        irDashboard: onDone,
        irPaso2: () => { setVista('registro'); setStep(2) },
      })
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void resolver(data.session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recuperacionPendiente.current = true
        setVista('nueva')
        return
      }
      if (event === 'SIGNED_IN' && session?.user) void resolver(session.user.id)
    })
    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function limpiarErrorCampo(campo: keyof ErroresCampo) {
    setErrores((e) => (e[campo] ? { ...e, [campo]: undefined } : e))
    setError(null)
  }

  function validarRegistro(): boolean {
    const e: ErroresCampo = {}
    if (!name.trim()) e.nombre = 'Escribe tu nombre para que tu pareja te reconozca.'
    if (!email.trim()) e.correo = 'Escribe tu correo electrónico.'
    else if (!CORREO_RE.test(email.trim())) e.correo = 'Ese correo no es válido. Revisa que esté bien escrito.'
    if (password.length < 6) e.clave = 'La contraseña debe tener al menos 6 caracteres.'
    if (confirmPassword !== password || !confirmPassword) e.confirma = 'Las contraseñas no coinciden. Revísalas.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  async function step1() {
    if (!validarRegistro()) return
    setBusy(true); setError(null); setAviso(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    })
    if (error) {
      // Si el correo ya existe, no lo dejamos atorado: lo mandamos al login.
      if (esCorreoYaRegistrado(error.message)) {
        setAviso('Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.')
        setVista('login')
      } else {
        setError(traducirErrorAuth(error.message, { seguro: true }))
      }
      setBusy(false); return
    }
    const user = data.user
    if (user && data.session) {
      await supabase.from('users').upsert({ id: user.id, name: name.trim() || email.split('@')[0], email: email.trim() })
      setBusy(false); setStep(2)
    } else {
      // Confirmación de correo activada: avisar en español y mandar al login.
      setBusy(false); setVista('confirma')
    }
  }

  function validarLogin(): boolean {
    const e: ErroresCampo = {}
    if (!email.trim()) e.correo = 'Escribe tu correo electrónico.'
    else if (!CORREO_RE.test(email.trim())) e.correo = 'Ese correo no es válido. Revisa que esté bien escrito.'
    if (!password) e.clave = 'Escribe tu contraseña.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  /**
   * Iniciar sesión con correo y contraseña. Si el usuario ya tiene hogar,
   * lo recupera desde la BD y entra directo al Dashboard; si no tiene,
   * sigue al paso 2 a crear o unirse a uno. Nunca manda al registro a fuerza.
   */
  async function login() {
    if (!validarLogin()) return
    setBusy(true); setError(null); setAviso(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { setError(traducirErrorAuth(error.message, { seguro: true })); setBusy(false); return }
    const user = data.user
    if (!user) { setError('No se pudo iniciar sesión. Inténtalo de nuevo.'); setBusy(false); return }
    // Asegurar la fila de perfil (igual que el registro): la necesitan las
    // invitaciones y el hogar. No cambia ninguna regla de negocio.
    const nombreMeta = (user.user_metadata?.name as string | undefined) ?? email.trim().split('@')[0]
    await supabase.from('users').upsert({ id: user.id, name: nombreMeta, email: user.email ?? email.trim() })
    const householdId = await findMyHouseholdId(user.id)
    setBusy(false)
    if (householdId) {
      setHouseholdId(householdId)
      onDone()
    } else {
      setVista('registro'); setStep(2)
    }
  }

  /** "Olvidé mi contraseña": correo de recuperación de Supabase. */
  async function recuperar() {
    const e: ErroresCampo = {}
    if (!email.trim()) e.correo = 'Escribe el correo con el que creaste tu cuenta.'
    else if (!CORREO_RE.test(email.trim())) e.correo = 'Ese correo no es válido. Revisa que esté bien escrito.'
    setErrores(e)
    if (Object.keys(e).length > 0) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/onboarding?recuperar=1`,
    })
    setBusy(false)
    if (error) { setError(traducirErrorAuth(error.message, { seguro: true })); return }
    setAviso('Te enviamos un correo para restablecer tu contraseña. Ábrelo desde este celular y elige una nueva. Si no lo ves, revisa spam.')
  }

  /** Pantalla de nueva contraseña (tras abrir el enlace de recuperación). */
  async function guardarNueva() {
    const e: ErroresCampo = {}
    if (nuevaClave.length < 6) e.clave = 'La contraseña debe tener al menos 6 caracteres.'
    if (nuevaConfirma !== nuevaClave || !nuevaConfirma) e.confirma = 'Las contraseñas no coinciden. Revísalas.'
    setErrores(e)
    if (Object.keys(e).length > 0) return
    setBusy(true); setError(null)
    const { data, error } = await supabase.auth.updateUser({ password: nuevaClave })
    if (error) { setError(traducirErrorAuth(error.message, { seguro: true })); setBusy(false); return }
    recuperacionPendiente.current = false
    sesionResuelta.current = false
    const user = data.user
    if (user) {
      await resolverSesionExistente(findMyHouseholdId, user.id, {
        setHouseholdId,
        irDashboard: onDone,
        irPaso2: () => { setVista('registro'); setStep(2) },
      })
    }
    setBusy(false)
  }

  /**
   * Crea el hogar. Solo (1 persona): el reparto es 100% para quien lo crea
   * y la invitación queda como opción para después. En pareja: 50/50.
   *
   * Se crea vía la RPC SECURITY DEFINER `create_household` (migración 006):
   * el INSERT directo con `.select()` NO funciona — la política INSERT de
   * `households` es `with check (true)` pero el RETURNING se evalúa contra
   * la política SELECT (`is_member(id)`) y el usuario aún no es miembro
   * (la fila en `household_members` se insertaba después). La RPC crea el
   * hogar y agrega al creador como admin en una sola transacción, y
   * devuelve el id y el código de invitación (que genera el servidor).
   */
  async function createHousehold(solo: boolean) {
    setBusy(true); setError(null)
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    if (!user) { setError('Primero crea tu cuenta.'); setBusy(false); return }
    const res = await crearHogar(supabase, {
      name: solo ? 'Mi hogar' : householdName.trim() || 'Nuestro hogar',
      defaultSplit: solo ? 100 : 50,
    })
    if (!res.ok) { setError(mensajeHumano(res.error, 'No se pudo crear el hogar. Inténtalo de nuevo.')); setBusy(false); return }
    setSoloMode(solo)
    setInviteCode(res.hogar.invite_code)
    setHouseholdId(res.hogar.id)
    setBusy(false); setStep(3)
  }

  async function joinHousehold() {
    setBusy(true); setError(null)
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    // El hogar NO se busca con un SELECT directo: RLS solo deja ver el hogar a
    // sus miembros y la pareja aún no lo es. Se usa la función SECURITY DEFINER
    // find_household_by_code (migración 004), que solo devuelve el id.
    const { data: householdId, error: hError } = await supabase.rpc('find_household_by_code', { p_code: joinCode.trim().toUpperCase() })
    if (hError || !householdId || !user) { setError('Código inválido. Pídele a tu pareja el código de invitación.'); setBusy(false); return }
    // Asegurar la fila de perfil antes de unirse (FK de household_members).
    await supabase.from('users').upsert({ id: user.id, name: user.email?.split('@')[0] ?? 'Yo', email: user.email ?? '' })
    // OJO: sin `.select()` a propósito — si se pidiera RETURNING, la
    // política SELECT de household_members (`is_member`) se evaluaría con
    // el snapshot previo al insert y Postgres rechazaría con 42501
    // (el mismo bug que tenía crear el hogar).
    const { error: joinError } = await supabase.from('household_members').insert({ household_id: householdId, user_id: user.id, role: 'miembro' })
    if (joinError) {
      // Si ya era miembro de este hogar, proceder directamente al Dashboard
      if (joinError.code === '23505' || joinError.message.includes('unique') || joinError.message.includes('duplicate')) {
        setHouseholdId(householdId)
        setBusy(false)
        onDone()
        return
      }
      setError(mensajeHumano(joinError.message, 'No se pudo unir al hogar. Inténtalo de nuevo.'))
      setBusy(false)
      return
    }
    setHouseholdId(householdId)
    setBusy(false); onDone()
  }

  async function seedAccountsAndCategories() {
    setBusy(true); setError(null)
    const householdId = getHouseholdId()
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    if (!householdId || !user) { setError('Falta el hogar.'); setBusy(false); return }
    const { error: eAcc } = await supabase.from('accounts').insert([
      { household_id: householdId, owner_id: user.id, name: 'Efectivo', type: 'efectivo', visibility: 'compartida', balance: 0 },
      { household_id: householdId, owner_id: user.id, name: 'Cuenta principal', type: 'banco', visibility: 'compartida', balance: 0 },
      { household_id: householdId, owner_id: user.id, name: 'Tarjeta de crédito', type: 'tarjeta', visibility: 'solo_saldo', balance: 0 },
    ])
    const { error: eCat } = await supabase.from('categories').insert(SEED_CATEGORIES.map((c) => ({ ...c, household_id: householdId })))
    if (eAcc || eCat) {
      setError(mensajeHumano(eAcc?.message ?? eCat?.message, 'No se pudieron crear las cuentas y categorías iniciales.'))
      setBusy(false)
      return
    }
    setBusy(false); setStep(5)
  }

  async function copiarInvitacion() {
    const link = `${window.location.origin}/onboarding?codigo=${inviteCode}`
    try {
      await navigator.clipboard.writeText(`Únete a mi hogar en Finanzas en Pareja. Código: ${inviteCode} · Enlace: ${link}`)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      setError('No se pudo copiar automáticamente: copia el código y el enlace de la tarjeta.')
    }
  }

  const registroValido = Boolean(name.trim()) && CORREO_RE.test(email.trim()) && password.length >= 6 && confirmPassword === password && Boolean(confirmPassword)
  const loginValido = CORREO_RE.test(email.trim()) && Boolean(password)
  const esAuth = vista !== 'registro' || step === 1

  const saludo: Record<Vista, string> = {
    registro: '¡Hola! Soy PIBBI, tu cerdito de los ahorros. Te ayudo a cuidar cada peso, en pareja.',
    login: '¡Qué gusto verte de nuevo! Entra y sigamos cuidando sus pesos.',
    recuperar: 'No pasa nada, a todos se nos olvida. Te mando un correo para crear una nueva.',
    nueva: 'Elige una contraseña nueva y sigamos donde nos quedamos.',
    confirma: 'Falta un pasito: confirma tu correo y luego inicia sesión.',
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-6">
      <div className="mb-6 flex items-center justify-end">
        <ThemeToggle className="rounded-full border border-borde bg-tarjeta p-2.5 text-crema shadow-tarjeta transition active:scale-95" />
      </div>

      {vista === 'registro' && step > 1 && <PasoBarra paso={step} total={5} />}

      <div key={`${vista}-${step}`} className="animate-paso-entrar">
        {esAuth && (
          <>
            {/* PIBBI en círculo grande y centrado, estilo avatar: imagen
                completa con aire, sin recortar orejas ni brazos. La pose
                principal 'frente' usa la imagen HD de George (1231×1278,
                fondo negro): nítida a h-28 (112 px) y al acercar. */}
            <div className="mb-6 flex flex-col items-center text-center">
              <Mascota pose="frente" marco="circulo" className="h-28 w-28" />
              <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
                Finanzas <span className="text-doradotexto">en Pareja</span>
              </h1>
              <p className="mt-1 text-sm text-humo">Su dinero, en equipo · Gratis para los dos</p>
            </div>

            <Tarjeta className="p-5 sm:p-6">
              <div className="mb-5 rounded-2xl rounded-tl-sm bg-elevado p-3.5">
                <p className="text-sm text-crema">{saludo[vista]}</p>
              </div>

              {vista === 'registro' && (
                <>
                  <h2 className="font-display text-xl font-bold">Crea tu cuenta</h2>
                  <p className="mb-4 mt-1 text-sm text-humo">Si luego invitas a tu pareja, tendrá su propio login y todo se sincroniza en tiempo real.</p>
                  <div className="space-y-3.5">
                    <Campo etiqueta="Tu nombre" icono={<IconoUsuario className="h-4 w-4 text-humo" />} value={name}
                      onChange={(e) => { setName(e.target.value); limpiarErrorCampo('nombre') }}
                      placeholder="¿Cómo te llamas?" autoComplete="name" error={errores.nombre} />
                    <Campo etiqueta="Correo electrónico" icono={<IconoCorreo className="h-4 w-4 text-humo" />} type="email" value={email}
                      onChange={(e) => { setEmail(e.target.value); limpiarErrorCampo('correo') }}
                      placeholder="tu@correo.com" autoComplete="email" inputMode="email" error={errores.correo} />
                    <CampoClave etiqueta="Contraseña" value={password}
                      onChange={(e) => { setPassword(e.target.value); limpiarErrorCampo('clave') }}
                      placeholder="Mínimo 6 caracteres" autoComplete="new-password" error={errores.clave} />
                    <CampoClave etiqueta="Confirmar contraseña" value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); limpiarErrorCampo('confirma') }}
                      placeholder="Repite tu contraseña" autoComplete="new-password" error={errores.confirma} />
                    <Boton onClick={() => void step1()} disabled={!registroValido} cargando={busy} className="w-full">
                      Continuar <IconoFlechaDer className="h-4 w-4" />
                    </Boton>
                  </div>
                  <GoogleSignInButton disabled={busy} onError={setError} />
                  <Boton variante="fantasma" className="mt-2 w-full" onClick={() => { setVista('login'); setError(null); setErrores({}); setAviso(null) }}>
                    ¿Ya tienes cuenta? Inicia sesión
                  </Boton>
                </>
              )}

              {vista === 'login' && (
                <>
                  <h2 className="font-display text-xl font-bold">Inicia sesión</h2>
                  <p className="mb-4 mt-1 text-sm text-humo">Entra con el correo y la contraseña con los que creaste tu cuenta.</p>
                  {aviso && <div className="mb-4"><Alerta tono="info">{aviso}</Alerta></div>}
                  <div className="space-y-3.5">
                    <Campo etiqueta="Correo electrónico" icono={<IconoCorreo className="h-4 w-4 text-humo" />} type="email" value={email}
                      onChange={(e) => { setEmail(e.target.value); limpiarErrorCampo('correo') }}
                      placeholder="tu@correo.com" autoComplete="email" inputMode="email" error={errores.correo} />
                    <CampoClave etiqueta="Contraseña" value={password}
                      onChange={(e) => { setPassword(e.target.value); limpiarErrorCampo('clave') }}
                      placeholder="Tu contraseña" autoComplete="current-password" error={errores.clave} />
                    <div className="flex justify-end">
                      <button type="button" onClick={() => { setVista('recuperar'); setError(null); setErrores({}); setAviso(null) }}
                        className="text-xs font-semibold text-doradotexto hover:underline">
                        Olvidé mi contraseña
                      </button>
                    </div>
                    <Boton onClick={() => void login()} disabled={!loginValido} cargando={busy} className="w-full">
                      Entrar <IconoFlechaDer className="h-4 w-4" />
                    </Boton>
                  </div>
                  <GoogleSignInButton disabled={busy} onError={setError} />
                  <Boton variante="fantasma" className="mt-2 w-full" onClick={() => { setVista('registro'); setError(null); setErrores({}); setAviso(null) }}>
                    ¿No tienes cuenta? Crea una
                  </Boton>
                </>
              )}

              {vista === 'recuperar' && (
                <>
                  <h2 className="font-display text-xl font-bold">Restablecer contraseña</h2>
                  <p className="mb-4 mt-1 text-sm text-humo">Te enviamos un enlace a tu correo para elegir una nueva.</p>
                  {aviso && <div className="mb-4"><Alerta tono="exito">{aviso}</Alerta></div>}
                  <div className="space-y-3.5">
                    <Campo etiqueta="Correo electrónico" icono={<IconoCorreo className="h-4 w-4 text-humo" />} type="email" value={email}
                      onChange={(e) => { setEmail(e.target.value); limpiarErrorCampo('correo') }}
                      placeholder="tu@correo.com" autoComplete="email" inputMode="email" error={errores.correo} />
                    <Boton onClick={() => void recuperar()} disabled={!CORREO_RE.test(email.trim())} cargando={busy} className="w-full">
                      Enviar enlace
                    </Boton>
                  </div>
                  <Boton variante="fantasma" className="mt-3 w-full" onClick={() => { setVista('login'); setError(null); setAviso(null) }}>
                    <IconoFlechaIzq className="h-4 w-4" /> Volver a iniciar sesión
                  </Boton>
                </>
              )}

              {vista === 'nueva' && (
                <>
                  <h2 className="font-display text-xl font-bold">Nueva contraseña</h2>
                  <p className="mb-4 mt-1 text-sm text-humo">Elige una contraseña nueva para tu cuenta.</p>
                  <div className="space-y-3.5">
                    <CampoClave etiqueta="Nueva contraseña" value={nuevaClave}
                      onChange={(e) => { setNuevaClave(e.target.value); limpiarErrorCampo('clave') }}
                      placeholder="Mínimo 6 caracteres" autoComplete="new-password" error={errores.clave} />
                    <CampoClave etiqueta="Confirmar contraseña" value={nuevaConfirma}
                      onChange={(e) => { setNuevaConfirma(e.target.value); limpiarErrorCampo('confirma') }}
                      placeholder="Repite tu contraseña" autoComplete="new-password" error={errores.confirma} />
                    <Boton onClick={() => void guardarNueva()} disabled={nuevaClave.length < 6 || nuevaConfirma !== nuevaClave} cargando={busy} className="w-full">
                      Guardar y continuar
                    </Boton>
                  </div>
                </>
              )}

              {vista === 'confirma' && (
                <>
                  <h2 className="font-display text-xl font-bold">Confirma tu correo</h2>
                  <p className="mb-4 mt-1 text-sm text-humo">Te enviamos un correo a <strong className="text-crema">{email}</strong>. Ábrelo, confirma tu cuenta y luego inicia sesión aquí.</p>
                  <Alerta tono="info">Si no lo ves en unos minutos, revisa la carpeta de spam.</Alerta>
                  <Boton className="mt-4 w-full" onClick={() => { setVista('login'); setError(null); setAviso(null) }}>
                    Ya confirmé, iniciar sesión
                  </Boton>
                </>
              )}
            </Tarjeta>
          </>
        )}

        {vista === 'registro' && step === 2 && (
          <section>
            <PibbiHeader
              pose={PAGE_PIBBI_POSES.onboarding}
              title="¿Cómo quieres usar la app?"
              subtitle="Puedes usarla solo por ahora e invitar a tu pareja después, o en pareja desde el inicio."
              className="mb-4"
            />
            <Tarjeta className="mb-4 border-2 border-foco p-4">
              <p className="flex items-center gap-2 font-display text-lg font-bold"><IconoUsuario className="h-5 w-5 text-doradotexto" /> Solo yo por ahora</p>
              <p className="mb-3 mt-1 text-sm text-humo">Tu hogar es solo tuyo. Sin códigos y sin invitar a nadie por ahora; podrás invitar a tu pareja cuando quieras desde Inicio.</p>
              <Boton onClick={() => void createHousehold(true)} cargando={busy} className="w-full">Usar solo por ahora</Boton>
            </Tarjeta>

            <div className="mb-4 flex items-center gap-3 text-sm text-humo">
              <span className="h-px flex-1 bg-borde" /><span>o en pareja</span><span className="h-px flex-1 bg-borde" />
            </div>

            <Tarjeta className="mb-4 border-2 border-foco p-4">
              <p className="flex items-center gap-2 font-display text-lg font-bold"><IconoCorazon className="h-5 w-5 text-doradotexto" /> Soy el primero: crear nuestro hogar</p>
              <p className="mb-3 mt-1 text-sm text-humo">Tú creas el hogar y la app te da un código para compartir con tu pareja. No necesitas ningún código para esto.</p>
              <div className="space-y-3">
                <Campo etiqueta="Nombre del hogar" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Nuestro hogar" />
                <Boton onClick={() => void createHousehold(false)} cargando={busy} className="w-full">Crear hogar</Boton>
              </div>
            </Tarjeta>

            <div className="mb-4 flex items-center gap-3 text-sm text-humo">
              <span className="h-px flex-1 bg-borde" /><span>o</span><span className="h-px flex-1 bg-borde" />
            </div>

            <Tarjeta className="p-4">
              <p className="flex items-center gap-2 font-display text-lg font-bold"><IconoLlave className="h-5 w-5 text-doradotexto" /> Mi pareja ya creó el hogar</p>
              <p className="mb-3 mt-1 text-sm text-humo">Solo si tu pareja ya creó el hogar y te pasó su código.</p>
              {joinExpanded ? (
                <div className="space-y-3">
                  {joinCode && <Alerta tono="info">Código recibido del enlace de invitación. Revisa que sea el correcto y pulsa “Unirme”.</Alerta>}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Campo etiqueta="Código de invitación" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Ej. K7X2Q9" className="uppercase tracking-widest" />
                    </div>
                    <Boton variante="oscuro" onClick={() => void joinHousehold()} cargando={busy} disabled={joinCode.trim().length < 4} className="mb-0.5">Unirme</Boton>
                  </div>
                </div>
              ) : (
                <Boton variante="secundario" className="w-full" onClick={() => setJoinExpanded(true)}>Tengo un código de invitación</Boton>
              )}
            </Tarjeta>

            <div className="mt-6 text-center">
              <button type="button" onClick={async () => { await supabase.auth.signOut(); setStep(1); setVista('login'); setError(null) }} className="text-xs text-humo underline hover:text-crema">
                ¿Quieres usar otra cuenta? Cerrar sesión
              </button>
            </div>
          </section>
        )}

        {vista === 'registro' && step === 3 && (
          <section>
            <PibbiHeader
              pose={PAGE_PIBBI_POSES.onboarding}
              title={soloMode ? 'Invita a tu pareja (opcional)' : 'Invita a tu pareja'}
              subtitle={soloMode ? 'Si algún día quieres compartir la app, este es tu código. No es obligatorio: puedes seguir usando la app solo.' : 'Comparte este código o enlace. Tu pareja crea su cuenta y se une con él.'}
              className="mb-4"
            />
            <Tarjeta className="mb-4 bg-doradotenue p-5 text-center">
              <p className="font-display text-3xl font-extrabold tracking-[0.3em] text-doradotexto">{inviteCode}</p>
              <p className="mt-2 break-all text-xs text-humo">{`${window.location.origin}/onboarding?codigo=${inviteCode}`}</p>
              <Boton variante="secundario" tamano="sm" className="mt-3" onClick={() => void copiarInvitacion()}>
                {copiado ? <><IconoCheck className="h-4 w-4" /> ¡Copiado!</> : <><IconoCopiar className="h-4 w-4" /> Copiar código y enlace</>}
              </Boton>
            </Tarjeta>
            <Boton onClick={() => setStep(4)} cargando={busy} className="w-full">
              {soloMode ? 'Lo haré después' : 'Continuar (se une después)'} <IconoFlechaDer className="h-4 w-4" />
            </Boton>
          </section>
        )}

        {vista === 'registro' && step === 4 && (
          <section>
            <h1 className="font-display text-2xl font-bold">Viste a PIBBI</h1>
            <p className="mb-4 mt-1 text-humo">Elige la prenda de tu PIBBI. Puedes cambiarla cuando quieras desde Inicio. Este paso es opcional.</p>
            <Tarjeta className="mb-4 p-4">
              <PibbiDresser title="Prendas" />
            </Tarjeta>
            <p className="mb-4 text-sm text-humo">Crearemos tus 3 cuentas (efectivo, banco y tarjeta) y 13 categorías con límites mensuales de ejemplo en MXN. Luego podrás editar todo.</p>
            <Boton onClick={() => void seedAccountsAndCategories()} cargando={busy} className="w-full">Crear mis cuentas y terminar</Boton>
          </section>
        )}

        {vista === 'registro' && step === 5 && (
          <section className="text-center">
            <Mascota pose="celebrando" marco="circulo" alt="PIBBI celebrando: tu hogar está listo" className="mx-auto mb-5 h-24 w-24" />
            <h1 className="font-display text-2xl font-extrabold">¡Listo!</h1>
            <p className="mb-5 mt-1 text-humo">Tu hogar está creado. Toca el botón “+” para registrar tu primer movimiento guiado: monto, categoría, quién pagó y listo.</p>
            <Boton onClick={onDone} className="w-full">Ir al inicio <IconoFlechaDer className="h-4 w-4" /></Boton>
          </section>
        )}
      </div>

      {error && <div className="mt-4"><Alerta>{error}</Alerta></div>}
    </div>
  )
}