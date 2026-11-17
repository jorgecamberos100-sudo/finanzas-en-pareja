import { useEffect, useState } from 'react'
import { supabase, setHouseholdId } from '../lib/supabase'

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

/** Wizard de 5 pasos: cuenta → hogar + invitación → cuentas → categorías/presupuesto → primer movimiento. */
export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [householdName, setHouseholdName] = useState('Nuestro hogar')
  const [inviteCode, setInviteCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinExpanded, setJoinExpanded] = useState(false)
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
    if (error) { setError(error.message); setBusy(false); return }
    const user = data.user
    if (user) await supabase.from('users').upsert({ id: user.id, name: name || email.split('@')[0], email })
    setBusy(false); setStep(2)
  }

  async function createHousehold() {
    setBusy(true); setError(null)
    const { data: session } = await supabase.auth.getSession()
    const user = session.session?.user
    if (!user) { setError('Primero crea tu cuenta.'); setBusy(false); return }
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const { data: hh, error } = await supabase.from('households').insert({
      name: householdName, currency: 'MXN', default_split: 50, invite_code: code,
    }).select().single()
    if (error || !hh) { setError(error?.message ?? 'No se pudo crear el hogar.'); setBusy(false); return }
    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'admin' })
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
      <p className="text-sm text-stone-500">Paso {step} de 5</p>
      <div className="mb-6 mt-1 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div className="h-full bg-teal-600 transition-all" style={{ width: `${step * 20}%` }} />
      </div>

      {step === 1 && (
        <section>
          <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
          <p className="mb-4 text-stone-500">Tu pareja tendrá su propio login. Todo se sincroniza en tiempo real.</p>
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
          <button onClick={step1} disabled={busy} className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white">Continuar</button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-2xl font-bold">Crea o únete a un hogar</h1>
          <p className="mb-4 text-stone-500">Un hogar = exactamente 2 personas.</p>

          {/* Ruta principal: el primero crea el hogar. No necesita ningún código. */}
          <div className="mb-4 rounded-2xl border-2 border-teal-600 p-4 dark:border-teal-500">
            <p className="text-lg font-bold">Soy el primero: crear nuestro hogar</p>
            <p className="mb-3 text-sm text-stone-500">Tú creas el hogar y la app te da un código para compartir con tu pareja. No necesitas ningún código para esto.</p>
            <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Nombre del hogar" className="mb-2 w-full rounded-xl border p-3" />
            <button onClick={createHousehold} disabled={busy} className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white">Crear hogar</button>
          </div>

          <div className="mb-4 flex items-center gap-3 text-sm text-stone-400">
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
            <span>o</span>
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
          </div>

          {/* Ruta secundaria: solo para quien ya recibió un código de su pareja. */}
          <div className="rounded-2xl bg-stone-100 p-4 dark:bg-stone-800">
            <p className="text-lg font-bold">Mi pareja ya creó el hogar</p>
            <p className="mb-3 text-sm text-stone-500">Solo si tu pareja ya creó el hogar y te pasó su código.</p>
            {joinExpanded ? (
              <>
                {joinCode && <p className="mb-2 rounded-lg bg-teal-50 p-2 text-sm text-teal-700 dark:bg-teal-950 dark:text-teal-300">Código recibido del enlace de invitación. Revisa que sea el correcto y pulsa “Unirme”.</p>}
                <div className="flex gap-2">
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Código (ej. K7X2Q9)" className="flex-1 rounded-xl border p-3 uppercase" />
                  <button onClick={joinHousehold} disabled={busy} className="rounded-xl bg-stone-900 px-4 font-bold text-white dark:bg-stone-100 dark:text-stone-900">Unirme</button>
                </div>
              </>
            ) : (
              <button onClick={() => setJoinExpanded(true)} className="w-full rounded-xl border border-stone-300 bg-white py-3 font-bold dark:border-stone-600 dark:bg-stone-900">Tengo un código de invitación</button>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="text-2xl font-bold">Invita a tu pareja</h1>
          <p className="mb-4 text-stone-500">Comparte este código o enlace. Tu pareja crea su cuenta y se une con él.</p>
          <div className="mb-4 rounded-2xl bg-teal-50 p-4 text-center dark:bg-teal-950">
            <p className="text-3xl font-black tracking-widest text-teal-700 dark:text-teal-300">{inviteCode}</p>
            <p className="mt-1 text-sm text-stone-500">{`${window.location.origin}/onboarding?codigo=${inviteCode}`}</p>
          </div>
          <button onClick={seedAccountsAndCategories} disabled={busy} className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white">Continuar (puede unirse después)</button>
        </section>
      )}

      {step === 4 && (
        <section>
          <h1 className="text-2xl font-bold">Cuentas y presupuesto inicial</h1>
          <p className="mb-4 text-stone-500">Crearemos 3 cuentas (efectivo, banco y tarjeta) y 13 categorías LatAm con límites mensuales de ejemplo en MXN. Luego podrás editar todo.</p>
          <ul className="mb-4 list-disc pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>Despensa $6,000 · Renta $8,000 · Transporte $2,500</li>
            <li>Servicios $1,500 · Restaurantes $2,000 · Metas $2,000</li>
          </ul>
          <button onClick={seedAccountsAndCategories} disabled={busy} className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white">Crear cuentas y categorías</button>
        </section>
      )}

      {step === 5 && (
        <section>
          <h1 className="text-2xl font-bold">¡Listo! 🎉</h1>
          <p className="mb-4 text-stone-500">Tu hogar está creado. Toca el botón “+” para registrar tu primer movimiento guiado: monto, categoría, quién pagó y listo.</p>
          <button onClick={onDone} className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white">Ir al inicio</button>
        </section>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  )
}
