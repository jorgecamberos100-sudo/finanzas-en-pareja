import type { Recurring } from '../types'

export interface UpcomingRecurring {
  recurring: Recurring
  /** Días hasta el próximo vencimiento (0 = hoy). */
  daysUntil: number
  /** true si el próximo vencimiento cae el mes siguiente. */
  nextMonth: boolean
}

/**
 * Próximos vencimientos de gastos recurrentes, ordenados por cercanía.
 * Antes solo se mostraban los del resto del mes actual (due_day >= día de
 * hoy): la renta del día 5 quedaba oculta si hoy es 25. Ahora el próximo
 * vencimiento de cada recurrente es este mes o el siguiente, y se ordena
 * por días hasta vencer.
 */
export function upcomingRecurring(recurring: Recurring[], now = new Date(), limit = 3): UpcomingRecurring[] {
  const today = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return [...recurring]
    .map((r) => {
      const dayThisMonth = Math.min(r.due_day, daysInMonth)
      const thisMonth = dayThisMonth >= today
      return {
        recurring: r,
        nextMonth: !thisMonth,
        daysUntil: thisMonth ? dayThisMonth - today : daysInMonth - today + r.due_day,
      }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit)
}
