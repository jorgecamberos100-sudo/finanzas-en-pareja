# GEMINI.md — finanzas-en-pareja

App de finanzas para una pareja (o modo individual), React + Vite + TypeScript + Tailwind + Supabase (Auth, PostgreSQL con RLS, Realtime) + PWA. Idioma es-MX, moneda MXN.

## Reglas duras
- Montos en pesos en **unidades** (no centavos). `Transaction.amount` es número en pesos; la IA usa `amount_minor` internamente y se convierte con `/100` al guardar.
- Zona horaria = la del **dispositivo** que captura (Tijuana / `Intl.DateTimeFormat().resolvedOptions().timeZone`). **Nunca** hardcodear `America/Mexico_City`.
- La IA de captura **solo propone**: nunca guarda directo; el usuario confirma explícitamente antes de escribir en la BD. La captura manual con el botón `+` (QuickAddModal) debe seguir intacta.
- Nunca escribas secretos ni llaves en el código. Nunca toques la base de datos de producción ni despliegues nada.
- No cambies reglas de negocio (repartos 50/50 o 100% en modo individual, recordatorios, transferencias que no son gasto ni se reparten) sin dejarlo marcado en el resumen.

## Arquitectura
- Páginas: Onboarding, Dashboard, Movimientos, Presupuesto, Plan, Chat (`/chat`), Avisos (`/recordatorios`).
- Edge Functions (Supabase, Deno): `capture-parse` (valida JWT, llama a Cloudflare Workers AI y solo propone), `capture-confirm` (único escritor a BD), `reminders-push` (push cada 15 min vía pg_cron).
- Recordatorios con notificaciones push (web push, VAPID). **Sin alarma** (solo notificaciones).
- Mascota PIBBI: cerdito rosado 3D (`src/components/Mascota.tsx`, `src/lib/mascota/`), animación fluida (flotación senoidal, respiración, parpadeo). Prendas por usuario (tabla `pibbi_customization`).
- Service worker Workbox (`src/sw.ts`): skipWaiting + clientsClaim, navegación NetworkFirst, banner de nueva versión. No lo rompas.
- Migraciones SQL en `supabase/migrations/` (001 init, 002 reminders, 003 pibbi, 004 join_por_codigo_y_realtime — ya aplicada en producción; NO editar 001–004).
- Comandos: `npm run typecheck` · `npm run build` · `npm run test:pibbi` · `npm run test:reminders` · `npm run test:login` · `npm run test:capture` · `npm run test:sw` · `npm run test:push`
- Todo debe quedar en verde antes de terminar.
