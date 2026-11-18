import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { isPibbiAccessory, type PibbiAccessory } from './pibbi-accessories'
import {
  DEFAULT_MASCOT_NAME, MASCOT_NAME_STORAGE_KEY, MASCOT_SIZE_STORAGE_KEY, MASCOT_VIBE_STORAGE_KEY,
  isPibbiSize, isPibbiVibe, normalizarNombreMascota,
  type PibbiSize, type PibbiVibe,
} from './pibbi-identidad'

export type { PibbiAccessory } from './pibbi-accessories'
export { PIBBI_ACCESSORIES, isPibbiAccessory } from './pibbi-accessories'
export type { PibbiSize, PibbiVibe } from './pibbi-identidad'

const STORAGE_KEY = 'fp_pibbi_accessory'

interface PibbiContextValue {
  accessory: PibbiAccessory
  setAccessory: (a: PibbiAccessory) => void
  /** Nombre de la mascota (la pareja comparte a PIBBI; por defecto 'PIBBI'). */
  name: string
  setName: (n: string) => void
  /** Personalidad de PIBBI: cambia sus saludos y reacciones. */
  vibe: PibbiVibe
  setVibe: (v: PibbiVibe) => void
  /** Tamaño del avatar de PIBBI en el encabezado. */
  size: PibbiSize
  setSize: (s: PibbiSize) => void
}

const PibbiContext = createContext<PibbiContextValue>({
  accessory: 'ninguno',
  setAccessory: () => {},
  name: DEFAULT_MASCOT_NAME,
  setName: () => {},
  vibe: 'alegre',
  setVibe: () => {},
  size: 'normal',
  setSize: () => {},
})

export function usePibbi(): PibbiContextValue {
  return useContext(PibbiContext)
}

function leerLocal<T extends string>(key: string, esValido: (v: string | null) => v is T, defecto: T): T {
  try {
    const saved = localStorage.getItem(key)
    return esValido(saved) ? saved : defecto
  } catch {
    return defecto
  }
}

function guardarLocal(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* sin storage */ }
}

/**
 * La elección de cada persona vive en su propio dispositivo al instante
 * (localStorage) y se sincroniza a la tabla pibbi_customization cuando
 * existe (migración 003; la identidad —nombre, vibe y tamaño— es la
 * migración 007); si la tabla o las columnas aún no existen, el guardado
 * local sigue funcionando y el error de red se ignora en silencio.
 */
export function PibbiProvider({ children }: { children: ReactNode }) {
  const [accessory, setAccessoryState] = useState<PibbiAccessory>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return isPibbiAccessory(saved) ? saved : 'ninguno'
    } catch {
      return 'ninguno'
    }
  })
  const [name, setNameState] = useState<string>(() => leerLocal(MASCOT_NAME_STORAGE_KEY, (v): v is string => v !== null && v.trim() !== '', DEFAULT_MASCOT_NAME))
  const [vibe, setVibeState] = useState<PibbiVibe>(() => leerLocal(MASCOT_VIBE_STORAGE_KEY, isPibbiVibe, 'alegre'))
  const [size, setSizeState] = useState<PibbiSize>(() => leerLocal(MASCOT_SIZE_STORAGE_KEY, isPibbiSize, 'normal'))

  // Al entrar, traer la elección guardada en la cuenta (si la hay).
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const { data: session } = await supabase.auth.getSession()
        const user = session.session?.user
        if (!user) return
        const { data, error } = await supabase
          .from('pibbi_customization')
          .select('accessory')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!alive || error || !data) return
        if (isPibbiAccessory(data.accessory)) {
          setAccessoryState(data.accessory)
          try { localStorage.setItem(STORAGE_KEY, data.accessory) } catch { /* sin storage */ }
        }
      } catch {
        // Sin red o sin tabla: la elección local sigue valiendo.
      }
      // La identidad (nombre, vibe, tamaño) se lee aparte: si la
      // migración 007 aún no está aplicada, este select falla y la
      // identidad local sigue valiendo (sin romper la prenda).
      try {
        const { data: session } = await supabase.auth.getSession()
        const user = session.session?.user
        if (!user) return
        const { data, error } = await supabase
          .from('pibbi_customization')
          .select('mascot_name, vibe, size')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!alive || error || !data) return
        if (typeof data.mascot_name === 'string' && data.mascot_name.trim() !== '') {
          const n = normalizarNombreMascota(data.mascot_name)
          setNameState(n)
          guardarLocal(MASCOT_NAME_STORAGE_KEY, n)
        }
        if (isPibbiVibe(data.vibe)) {
          setVibeState(data.vibe)
          guardarLocal(MASCOT_VIBE_STORAGE_KEY, data.vibe)
        }
        if (isPibbiSize(data.size)) {
          setSizeState(data.size)
          guardarLocal(MASCOT_SIZE_STORAGE_KEY, data.size)
        }
      } catch {
        // Sin red o sin columnas: la identidad local sigue valiendo.
      }
    })()
    return () => { alive = false }
  }, [])

  async function guardarEnDb(campos: Record<string, string>) {
    try {
      const { data: session } = await supabase.auth.getSession()
      const user = session.session?.user
      if (!user) return
      await supabase.from('pibbi_customization').upsert({ user_id: user.id, ...campos })
    } catch {
      // Se guarda local; se sincroniza la próxima vez que haya red/tabla.
    }
  }

  function setAccessory(a: PibbiAccessory) {
    setAccessoryState(a)
    try { localStorage.setItem(STORAGE_KEY, a) } catch { /* sin storage */ }
    void guardarEnDb({ accessory: a })
  }

  function setName(raw: string) {
    const n = normalizarNombreMascota(raw)
    setNameState(n)
    guardarLocal(MASCOT_NAME_STORAGE_KEY, n)
    void guardarEnDb({ mascot_name: n })
  }

  function setVibe(v: PibbiVibe) {
    setVibeState(v)
    guardarLocal(MASCOT_VIBE_STORAGE_KEY, v)
    void guardarEnDb({ vibe: v })
  }

  function setSize(s: PibbiSize) {
    setSizeState(s)
    guardarLocal(MASCOT_SIZE_STORAGE_KEY, s)
    void guardarEnDb({ size: s })
  }

  return (
    <PibbiContext.Provider value={{ accessory, setAccessory, name, setName, vibe, setVibe, size, setSize }}>
      {children}
    </PibbiContext.Provider>
  )
}
