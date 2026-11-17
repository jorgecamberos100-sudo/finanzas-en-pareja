import { useEffect, useState } from 'react'
import { supabase, setHouseholdId, findMyHouseholdId } from '../lib/supabase'
import { traducirErrorAuth, esCorreoYaRegistrado } from '../lib/auth'
import Mascota from '../components/Mascota'
import PibbiDresser from '../components/PibbiDresser'

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

/** Wizard de 5 pasos: cuenta → modo (solo o en pareja) → invitación opcional → viste a PIBBI → listo. */
export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(1)
  /** Paso 1 tiene dos modos: registrarse (nuevo) o iniciar sesión (ya tiene cuenta). */
  const [mode, setMode] = useState<'registro' | 'login'>('registro')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [householdName, setHouseholdName] = useState('Nuestro hogar')
  const [inviteCode, setInviteCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinExpanded, setJoinExpanded] = useState(false)
  /** null = aún no elige; true = solo por ahora; false = en pareja. */
  const [soloMode, setSoloMode] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // El enlace de invitación del paso 3 es /onboarding?codigo=XXXXXX: prellenar
  // el código y desplegar la sección de unirse, para que el enlace funcione.
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get('codigo')
    if (codigo) {
      setJoinCode(codigo.trim().toUpperCase())
      setJoinExpanded(true)
    }
  }, [])

  async function step1() {
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden. Revísalas y vuelve a intentarlo.'); return }
    setBusy(true); setError(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      // Si el correo ya existe, no lo dejamos atorado: lo mandamos al login.
      if (esCorreoYaRegistrado(error.message)) {
        setError('Ese correo ya tiene cuenta. Inicia sesión con tu contraseña.')
        setMode('login')
      } else {
        setError(traducirErrorAuth(error.message))
      }
      setBusy(false); return
    }
    const user = data.user
    if (user) await supabase.from('users').upsert({ id: user.id, name: name || email.split('@')[0], email })
    setBusy(false); setStep(2)
  }

  /**
   * Iniciar sesión con correo y contraseña. Si el usuario ya tiene hogar,
   * lo recupera desde la BD y entra directo al Dashboard; si no tiene,
   * sigue al paso 2 a crear o unirse a uno. Nunca manda al registro a fuerza.
   */
  async function login() {
    setBusy(true); setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(traducirErrorAuth(error.message)); setBusy(false); return }
    const user = data.user
    if (!user) { setError('No se pudo iniciar sesión. Inténtalo de nuevo.'); setBusy(false); return }
    const householdId = await findMyHouseholdId(user.id)
    setBusy(false)
    if (householdId) {
      setHouseholdId(householdId)
      onDone()
    } else {
      setStep(2)
    }
  }

  /**
   * Crea el hogar. Solo (1 persona): el reparto es 100% para quien lo crea
   * y la invitación queda como opción para después. En pareja: 50/50.
   */
  async function createHousehold(solo: boolean) {
    setBusy(true); setError(null)
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    if (!user) { setError('Primero crea tu cuenta.'); setBusy(false); return }
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const { data: hh, error } = await supabase.from('households').insert({
      name: solo ? 'Mi hogar' : householdName, currency: 'MXN', default_split: solo ? 100 : 50, invite_code: code,
    }).select().single()
    if (error || !hh) { setError(error?.message ?? 'No se pudo crear el hogar.'); setBusy(false); return }
    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'admin' })
    setSoloMode(solo)
    setInviteCode(code)
    setHouseholdId(hh.id)
    setBusy(false); setStep(3)
  }

  async function joinHousehold() {
    setBusy(true); setError(null)
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    const { data: hh } = await supabase.from('households').select('id').eq('invite_code', joinCode.trim().toUpperCase()).single()
    if (!hh || !user) { setError('Código inválido. Pídele a tu pareja el código de invitación.'); setBusy(false); return }
    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'miembro' })
    setHouseholdId(hh.id)
    setBusy(false); onDone()
  }

  async function seedAccountsAndCategories() {
    setBusy(true); setError(null)
    const householdId = localStorage.getItem('fp_household_id')
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    if (!householdId || !user) { setError('Falta el hogar.'); setBusy(false); return }
    await supabase.from('accounts').insert([
      { household_id: householdId, owner_id: user.id, name: 'Efectivo', type: 'efectivo', visibility: 'compartida', balance: 0 },
      { household_id: householdId, owner_id: user.id, name: 'Cuenta principal', type: 'banco', visibility: 'compartida', balance: 0 },
      { household_id: householdId, owner_id: user.id, name: 'Tarjeta de crédito', type: 'tarjeta', visibility: 'solo_saldo', balance: 0 },
    ])
    await supabase.from('categories').insert(SEED_CATEGORIES.map((c) => ({ ...c, household_id: householdId })))
    setBusy(false); setStep(5)
  }

  return (
    <div className="mx-auto max-w-lg p-5">
      <p className="text-sm text-humo">Paso {step} de 5</p>
      <div className="mb-6 mt-1 h-2 overflow-hidden rounded-full bg-borde ">
        <div className="h-full bg-rosafuerte transition-all" style={{ width: `${step * 20}%` }} />
      </div>

      {step === 1 && (
        <section>
          <div className="mb-4 flex items-start gap-3">
            <Mascota className="h-20 w-20 shrink-0" />
            <p className="rounded-2xl rounded-tl-sm bg-elevado p-3 text-sm text-crema">¡Hola! Soy PIBBI, tu cerdito de los ahorros 🐷 Te ayudo a cuidar cada peso, en pareja.</p>
          </div>
          {mode === 'login' ? (
            <>
              <h1 className="text-2xl font-bold">Inicia sesión</h1>
              <p className="mb-4 text-humo">Entra con el correo y la contraseña con los que creaste tu cuenta.</p>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico" type="email" className="mb-2 w-full rounded-xl border p-3" />
              <div className="relative mb-4">
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" type={showPassword ? 'text' : 'password'} className="w-full rounded-xl border p-3 pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xl" title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <button onClick={login} disabled={busy} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">Entrar</button>
              <button onClick={() => { setMode('registro'); setError(null) }} className="mt-3 w-full py-2 text-sm font-semibold text-rosaclaro">¿No tienes cuenta? Crea una</button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
              <p className="mb-4 text-humo">Si luego invitas a tu pareja, tendrá su propio login y todo se sincroniza en tiempo real.</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="mb-2 w-full rounded-xl border p-3" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico" type="email" className="mb-2 w-full rounded-xl border p-3" />
              <div className="relative mb-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña (mín. 6 caracteres)" type={showPassword ? 'text' : 'password'} className="w-full rounded-xl border p-3 pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xl" title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <div className="relative mb-4">
                <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmar contraseña" type={showPassword ? 'text' : 'password'} className="w-full rounded-xl border p-3 pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xl" title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <button onClick={step1} disabled={busy} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">Continuar</button>
              <button onClick={() => { setMode('login'); setError(null) }} className="mt-3 w-full py-2 text-sm font-semibold text-rosaclaro">¿Ya tienes cuenta? Inicia sesión</button>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-2xl font-bold">¿Cómo quieres usar la app?</h1>
          <p className="mb-4 text-humo">Puedes usarla solo por ahora e invitar a tu pareja después, o en pareja desde el inicio.</p>

          {/* Modo individual: hogar de 1 persona, sin código ni invitación obligatoria. */}
          <div className="mb-4 rounded-2xl border-2 border-rosafuerte p-4 ">
            <p className="text-lg font-bold">🙋 Solo yo por ahora</p>
            <p className="mb-3 text-sm text-humo">Tu hogar es solo tuyo. Sin códigos y sin invitar a nadie por ahora; podrás invitar a tu pareja cuando quieras desde Inicio.</p>
            <button onClick={() => void createHousehold(true)} disabled={busy} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">Usar solo por ahora</button>
          </div>

          <div className="mb-4 flex items-center gap-3 text-sm text-humo">
            <span className="h-px flex-1 bg-borde " />
            <span>o en pareja</span>
            <span className="h-px flex-1 bg-borde " />
          </div>

          {/* Ruta principal en pareja: el primero crea el hogar. No necesita ningún código. */}
          <div className="mb-4 rounded-2xl border-2 border-rosafuerte p-4 ">
            <p className="text-lg font-bold">Soy el primero: crear nuestro hogar</p>
            <p className="mb-3 text-sm text-humo">Tú creas el hogar y la app te da un código para compartir con tu pareja. No necesitas ningún código para esto.</p>
            <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Nombre del hogar" className="mb-2 w-full rounded-xl border p-3" />
            <button onClick={() => void createHousehold(false)} disabled={busy} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">Crear hogar</button>
          </div>

          <div className="mb-4 flex items-center gap-3 text-sm text-humo">
            <span className="h-px flex-1 bg-borde " />
            <span>o</span>
            <span className="h-px flex-1 bg-borde " />
          </div>

          {/* Ruta secundaria: solo para quien ya recibió un código de su pareja. */}
          <div className="rounded-2xl bg-elevado p-4 ">
            <p className="text-lg font-bold">Mi pareja ya creó el hogar</p>
            <p className="mb-3 text-sm text-humo">Solo si tu pareja ya creó el hogar y te pasó su código.</p>
            {joinExpanded ? (
              <>
                {joinCode && <p className="mb-2 rounded-lg bg-[#F4728F1A] p-2 text-sm text-rosaclaro  ">Código recibido del enlace de invitación. Revisa que sea el correcto y pulsa “Unirme”.</p>}
                <div className="flex gap-2">
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Código (ej. K7X2Q9)" className="flex-1 rounded-xl border p-3 uppercase" />
                  <button onClick={joinHousehold} disabled={busy} className="rounded-xl bg-noche px-4 font-bold text-white  ">Unirme</button>
                </div>
              </>
            ) : (
              <button onClick={() => setJoinExpanded(true)} className="w-full rounded-xl border border-borde bg-tarjeta py-3 font-bold  ">Tengo un código de invitación</button>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="text-2xl font-bold">{soloMode ? 'Invita a tu pareja (opcional)' : 'Invita a tu pareja'}</h1>
          <p className="mb-4 text-humo">{soloMode ? 'Si algún día quieres compartir la app, este es tu código. No es obligatorio: puedes seguir usando la app solo.' : 'Comparte este código o enlace. Tu pareja crea su cuenta y se une con él.'}</p>
          <div className="mb-4 rounded-2xl bg-[#F4728F1A] p-4 text-center ">
            <p className="text-3xl font-black tracking-widest text-rosaclaro ">{inviteCode}</p>
            <p className="mt-1 text-sm text-humo">{`${window.location.origin}/onboarding?codigo=${inviteCode}`}</p>
          </div>
          <button onClick={() => setStep(4)} disabled={busy} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">{soloMode ? 'Lo haré después' : 'Continuar (puede unirse después)'}</button>
        </section>
      )}

      {step === 4 && (
        <section>
          <h1 className="text-2xl font-bold">Viste a PIBBI</h1>
          <p className="mb-4 text-humo">Elige la prenda de tu PIBBI. Puedes cambiarla cuando quieras desde Inicio. Este paso es opcional.</p>
          <div className="mb-4 rounded-2xl border border-borde bg-tarjeta p-4">
            <PibbiDresser />
          </div>
          <p className="mb-4 text-sm text-humo">Crearemos tus 3 cuentas (efectivo, banco y tarjeta) y 13 categorías con límites mensuales de ejemplo en MXN. Luego podrás editar todo.</p>
          <button onClick={seedAccountsAndCategories} disabled={busy} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">Crear mis cuentas y terminar</button>
        </section>
      )}

      {step === 5 && (
        <section className="text-center">
          <Mascota pose="celebrando" alt="PIBBI celebrando: tu hogar está listo" className="mx-auto mb-4 h-32 w-32" />
          <h1 className="text-2xl font-bold">¡Listo! 🎉</h1>
          <p className="mb-4 text-humo">Tu hogar está creado. Toca el botón “+” para registrar tu primer movimiento guiado: monto, categoría, quién pagó y listo.</p>
          <button onClick={onDone} className="w-full rounded-xl bg-rosafuerte py-3 font-bold text-noche">Ir al inicio</button>
        </section>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-rojosuave">{error}</p>}
    </div>
  )
}
