import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { isPibbiAccessory, type PibbiAccessory } from './pibbi-accessories'

export type { PibbiAccessory } from './pibbi-accessories'
export { PIBBI_ACCESSORIES, isPibbiAccessory } from './pibbi-accessories'

const STORAGE_KEY = 'fp_pibbi_accessory'

interface PibbiContextValue {
  accessory: PibbiAccessory
  setAccessory: (a: PibbiAccessory) => void
}

const PibbiContext = createContext<PibbiContextValue>({ accessory: 'ninguno', setAccessory: () => {} })

export function usePibbi(): PibbiContextValue {
  return useContext(PibbiContext)
}

/**
 * La elección de cada persona vive en su propio dispositivo al instante
 * (localStorage) y se sincroniza a la tabla pibbi_customization cuando
 * existe (migración 003); si la tabla aún no existe, el guardado local
 * sigue funcionando y el error de red se ignora en silencio.
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
    })()
    return () => { alive = false }
  }, [])

  function setAccessory(a: PibbiAccessory) {
    setAccessoryState(a)
    try { localStorage.setItem(STORAGE_KEY, a) } catch { /* sin storage */ }
    void (async () => {
      try {
        const { data: session } = await supabase.auth.getSession()
        const user = session.session?.user
        if (!user) return
        await supabase.from('pibbi_customization').upsert({ user_id: user.id, accessory: a })
      } catch {
        // Se guarda local; se sincroniza la próxima vez que haya red/tabla.
      }
    })()
  }

  return <PibbiContext.Provider value={{ accessory, setAccessory }}>{children}</PibbiContext.Provider>
}
