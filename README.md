# Finanzas en Pareja

App de finanzas para una pareja, en español (es-MX) y pesos mexicanos (MXN). Para 2 personas con un hogar compartido, con deuda mutua y reparto 50/50 (o personalizado).

- **Manual y privado:** no se conecta a ningún banco. Los movimientos se registran a mano, por CSV o con el chat de IA (foto, voz o texto).
- **El chat propone, tú confirmas:** la IA convierte un mensaje en movimientos o recordatorios, pero **nada se guarda sin pulsar Confirmar**.
- **Todo compartido al instante:** cada movimiento, meta o recordatorio aparece en el teléfono de la pareja por Realtime.
- **$0 al mes:** todos los servicios (Supabase, Vercel, Cloudflare AI y Groq/Z.AI) corren en sus niveles gratuitos.
- **PIBBI, la mascota:** un cerdito rosa que reacciona a lo que registras, se puede vestir y aparece en las pantallas principales. **El rosa es solo de PIBBI; el resto de la app usa negro y azul.**

### Funciones

| Área | Qué hace |
| --- | --- |
| Inicio | Saldo total, ingresos y gastos del mes, "por asignar" (ingresos no asignados a sobres) y deuda mutua. |
| Movimientos | Historial, filtros por mes/cuenta/categoría/búsqueda, edición, eliminación, cola "Por revisar" (capturas por confirmar) e importación de CSV con mapeo, preview y deduplicación. |
| Presupuesto | Sobres mensuales con límites, progreso y alertas (80 % y 100 %), traspasos entre sobres y rollover de lo que quedó. |
| Plan | Metas con aportes, progreso y ritmo esperado; cuentas, patrimonio y la revisión (money date) con notas y acuerdos. |
| Avisos | Recordatorios de pago con recurrencia y notificaciones (local y push). |
| Chat | Captura por texto, foto o voz con IA y confirmación explícita. |
| PWA | Instalable (Android/iOS), con modo claro/oscuro y soporte fuera de línea (el service worker guarda la app para que abra sin red). |

## Chat de captura

Nueva pestaña **Chat**: escribe, manda foto o graba voz y la app propone los movimientos. **Nada se guarda sin tu confirmación.**

- **Texto:** "Gasté $350 en Walmart en despensa, pagué yo" → gasto, categoría Despensa, 50/50.
- **Foto de ticket:** lee total, comercio y fecha. **Foto de libreta:** varias líneas → varios movimientos.
- **Voz:** nota de voz en es-MX, se transcribe y se convierte en propuesta.
- **Siempre editable:** monto, categoría, cuenta, quién pagó y fecha se corrigen en la tarjeta antes de pulsar **Confirmar y guardar**. Los campos dudosos salen marcados como "Revisar".
- **La captura manual no cambia:** el botón `+` y `QuickAddModal` siguen tal cual.

### Motor de IA ($0 real, investigación 17-nov-2026)

| Tarea | Principal | Respaldo $0 |
| --- | --- | --- |
| Texto → JSON | Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash` | Groq `openai/gpt-oss-20b` |
| Foto → JSON | Cloudflare `@cf/mistralai/mistral-small-3.1-24b-instruct` (`guided_json`) | Z.AI `glm-4.6v-flash` |
| Voz → texto | Cloudflare `@cf/openai/whisper-large-v3-turbo` | Groq `whisper-large-v3-turbo` |

Cloudflare Workers AI: cuota gratuita recurrente de **10,000 Neurons/día, sin tarjeta**, con cero retención de contenido y sin entrenamiento. A ~15 capturas/día se usa ~7% de la cuota: **$0/mes**, con escalamiento modular si crece.

Si la Edge Function no está configurada, el chat cae al **parser local en español** (`src/lib/capture.ts`) para texto simple, y te avisa para que uses el botón `+` en fotos/voz.

### Arquitectura

```
PWA (texto / foto / voz) — JWT de Supabase Auth
│
▼
Edge Function "capture-parse" (Deno) — valida JWT, llama a Cloudflare/Groq/Z.AI
│  devuelve SOLO propuestas JSON, NUNCA escribe en BD
▼
Tarjeta editable en el chat (needs_review marcado)
│  confirmación explícita del usuario
▼
App.addTransaction() → Supabase (RLS) → Realtime a la pareja
```

También existe `capture-confirm`, una Edge Function que valida entradas, resuelve `current_user`/`partner` al ID real del usuario autenticado, calcula `dedupe_hash` y escribe en `transactions` con RLS.

**Reglas:** la IA nunca guarda directo; "pagué yo" se resuelve en el servidor con el usuario autenticado; pago ≠ reparto (las transferencias no se dividen ni cuentan como gasto); montos en pesos (units), nunca en centavos en `Transaction.amount`; la zona horaria se toma del dispositivo.

### Configurar el chat (paso a paso)

1. **Cloudflare (gratis, sin tarjeta):** crea cuenta en [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → AI. Copia tu **Account ID** (esquina inferior derecha del dashboard).
2. **Token:** My Profile → API Tokens → Create Token → plantilla "Edit Cloudflare Workers" (o un token personalizado con permiso `Workers AI: Edit`). Guárdalo, solo se muestra una vez.
3. **Secretos en Supabase (nunca en el código ni en `.env`):** Dashboard → Edge Functions → Secrets, o con la CLI:

```bash
supabase secrets set CLOUDFLARE_ACCOUNT_ID=tu-account-id CLOUDFLARE_API_TOKEN=tu-token
# Opcionales (respaldos $0):
supabase secrets set GROQ_API_KEY=tu-llave-groq ZAI_API_KEY=tu-llave-zai
```

4. **Desplegar las funciones:**

```bash
supabase functions deploy capture-parse
supabase functions deploy capture-confirm
```

5. **Probar:** abre la pestaña Chat, escribe "Gasté $350 en Walmart en despensa, pagué yo", revisa la tarjeta y confirma. Luego prueba con una foto de ticket real.

### Batería de pruebas antes de lanzar

Nadie publica precisión en letra manuscrita mexicana: hay que probarlo con tus datos.

- **20 tickets impresos** (fotos claras y deficientes) · **20 fotos de libreta** (varias líneas, montos, fechas) · **30 audios de 15 s** (expresiones mexicanas, ruido moderado) · **30 textos** con ambigüedades.
- Mide por separado: monto exacto, comercio correcto, número de movimientos detectados (que no omita líneas) y fidelidad de transcripción.
- Compara Mistral 3.1 vs GLM-4.6V-Flash en tu libreta, y Whisper turbo vs Groq en audios ruidosos.
- **Criterio de lanzamiento:** las cifras son correctas **o están marcadas para revisión**. Mejor "no estoy seguro" que inventar una compra de $850.

## Recordatorios y notificaciones

Pestaña **Avisos** (`/recordatorios`): recordatorios de pago con título, monto opcional, fecha, hora del aviso (por defecto 09:00) y recurrencia (una vez, diario, semanal, mensual, anual). Los ve el hogar completo.

### Desde el chat

- "recuérdame pagar $1,500 de renta el 1 de diciembre" → recordatorio (no un gasto).
- "recuérdame la luz el viernes" → recordatorio con fecha del viernes.
- "pagar la renta el 1ro" → ambiguo: propone **ambas** cosas (recordatorio y movimiento) y tú eliges; nunca se guarda nada sin confirmar.
- La IA (`capture-parse`) también devuelve recordatorios en `reminders` cuando el mensaje habla de un pago futuro; si no hay IA, el parser local (`src/lib/reminders.ts`) hace lo mismo.

### Cómo llegan las notificaciones

| Situación | Qué pasa |
| --- | --- |
| App abierta o instalada (PWA) | El chequeo en la app (`useReminderNotifications`, cada 30 s) muestra la notificación local a la hora indicada. Solo hay que aceptar el permiso de notificaciones. |
| App cerrada (Android/escritorio) | Push real con Web Push + VAPID: la Edge Function `reminders-push` la dispara cada 15 min un cron. Requiere las claves VAPID y cron manuales. |
| iOS | El push web funciona solo si la PWA está instalada en la pantalla de inicio (iOS 16.4+). |

### Push cuando la app está cerrada (pasos manuales, $0)

1. **Generar las claves VAPID** (una sola vez, en tu computadora):

```bash
npx -y web-push generate-vapid-keys
```

Anota la `Public Key` y la `Private Key` (son dos cadenas largas en base64url).

2. **Secretos en Supabase** (Dashboard → Edge Functions → Secrets, o con la CLI; nunca en el código):

```bash
supabase secrets set VAPID_PUBLIC_KEY=<publica> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:tu-correo@example.com
```

3. **Desplegar migración y funciones:**

```bash
supabase db push
supabase functions deploy reminders-push
supabase functions deploy capture-parse   # prompt actualizado: devuelve reminders
```

4. **Variable pública en Vercel** (para que el navegador se suscriba al push): en el proyecto de Vercel → Settings → Environment Variables → `VITE_VAPID_PUBLIC_KEY` = la **public key** del paso 1.
5. **Cron cada 15 minutos** (en el SQL Editor de Supabase, con la service_role key — se muestra una sola vez en Settings → API; no la compartas por chat):

```sql
select cron.schedule(
  'reminders-push-cada-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://gnvanftgqmceiicgzdtp.supabase.co/functions/v1/reminders-push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || 'TU_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Requiere las extensiones `pg_cron` y `pg_net` activadas en el proyecto (Database → Extensions).

6. **Activar el push en cada celular:** en la pestaña Avisos, pulsa "Activar notificaciones en este celular" y acepta el permiso de notificaciones. Cada dispositivo queda suscrito con su propia notificación.

Sin el cron y las claves, todo lo demás (lista, chat, notificación local con la app abierta) funciona igual.

**Pruebas:** `npm run test:reminders` (33 casos: "recuérdame pagar $1,500 de renta el 1 de diciembre", "recuérdame la luz el viernes", mensual "el 1ro de cada mes", horas, y que un monto no se confunda con fecha).

## Estética: PIBBI, el cerdito

La mascota se llama PIBBI: es el cerdito rosa 3D de la hoja de personaje. Los recortes (de frente, celebrando y sentado con moneda) van incrustados en `src/lib/mascota-images.ts` y se usan con el componente `Mascota.tsx`.

| Uso | Color |
| --- | --- |
| Fondo | noche `#0A0A0C` |
| Tarjetas | tarjeta `#1C1C1F` |
| Texto | blanco/crema `#F7F7F8` |
| Texto secundario | humo `#9CA3AF` |
| Botones principales | azul `#2563EB`, texto tinta `#FFFFFF` |
| Bordes y superficies | borde `#2C2C31` / elevado `#26262C` |
| Éxito | verde `#34C759` / menta `#34D399` |
| Error | rojo suave `#FF6B6B` |

PIBBI aparece en: bienvenida del Onboarding, pantalla de “¡Listo!”, estado vacío del Dashboard y de Movimientos, saludo del Chat, meta alcanzada (celebrando) y recordatorios ya pagados (celebrando). **El rosa solo se utiliza para PIBBI y sus elementos de personaje.**

### Estética y componentes

- **Rediseño Muse:** lienzo casi negro en modo oscuro y casi blanco en modo claro.
- **Acento único:** azul `#2563EB` para acciones principales, estados activos y foco.
- **Botones píldora:** primario azul con texto blanco, secundario con borde, fantasma solo texto e icono circular de 40 px.
- **Sin emojis en la UI:** los iconos visibles son SVG propios del sistema `Icono`/`IconoCategoria`.
- **PIBBI permanece rosa:** nunca se usa rosa fuera de la mascota.
- **Tarjetas:** superficies consistentes con bordes discretos y sombra `shadow-tarjeta`.
- **Campos:** fondo de tarjeta, borde de superficie y radio píldora para controles pequeños.
- **Modo claro/oscuro:** conserva los tokens separados; el acento sigue siendo azul.
- **Accesibilidad:** contraste reforzado, estados de foco visibles y controles con etiquetas.
- **Reactivo:** cada que alguien registra un dato, PIBBI aparece reaccionando según el contexto (`src/components/PibbiReaction.tsx`): saludando/apuntando al crear un recordatorio, haciendo cuentas al revisar, ahorrando al aportar.
- **Personalizable:** cada persona viste a su propio PIBBI con lentes, gorra, moño, corona o sin accesorios (`src/components/PibbiDresser.tsx`). La prenda se dibuja en SVG sobre la foto y se guarda en `pibbi_customization`.
- **Modo individual:** en el Onboarding se puede elegir “Solo yo por ahora”: el hogar se crea con un solo miembro y reparto 100% (sin 50/50 roto ni deuda mutua). Invitar a la pareja es una opción.

**Pruebas:** `npm run test:pibbi` (73 casos: accesorios válidos, poses de reacción, reparto 100% en solo vs 50/50 en pareja, deuda mutua con liquidaciones, y poses nuevas de fondo circular negro).

### Correcciones de la auditoría Qwen (PR #9, 17-nov-2026)

Se verificó cada hallazgo en el código antes de corregirlo (Qwen no daba líneas exactas y no revisó el backend). Confirmados y corregidos: la app ya no se atora en "Cargando…" si falla la red, login/registro tienen mensajes en español, los hijos ya no fallan al leer el split, y el QuickAdd no permite guardar negativos.

### Stack

React + Vite + TypeScript + Tailwind CSS · Supabase (Auth email/password, PostgreSQL con RLS, Realtime) · PWA (manifest + service worker) · Deploy gratuito en Vercel.

### Estructura

```
finanzas-en-pareja/
├── index.html
├── package.json  vite.config.ts  tsconfig.json
├── tailwind.config.js  postcss.config.js
├── .env.example  .gitignore
├── public/
│   ├── manifest.webmanifest
│   ├── favicon.svg
│   └── icons/           # icon-192.png y icon-512.png (generar)
├── src/
│   ├── main.tsx  App.tsx  index.css  types.ts
│   ├── sw.ts        # service worker (injectManifest): precache + push.
│   │                # skipWaiting + clientsClaim, navegación NetworkFirst
│   │                # (el index.html nunca se sirve solo desde precache) y
│   │                # aviso "Nueva versión disponible" (src/lib/sw-update.ts).
│   ├── lib/
│   │   ├── supabase.ts  # cliente + hogar activo
│   │   ├── sw-update.ts # registro manual del SW + aviso de actualización
│   │   ├── format.ts    # es-MX, MXN, hash de deduplicación CSV
│   │   ├── capture.ts   # tipos ProposedEntry/CaptureResult + parser local es-MX
│   │   ├── reminders.ts # parser de recordatorios, recurrencia, notificaciones locales y push
│   │   └── split.ts     # split 50/50 y personalizado, deuda mutua,
│   │                    # totales del mes (transferencias excluidas)
│   ├── pages/
│   │   ├── Onboarding.tsx   # wizard de 5 pasos
│   │   ├── Chat.tsx         # pestaña Chat: envuelve ChatCapture
│   │   ├── Reminders.tsx    # pestaña Avisos: CRUD de recordatorios + activar push
│   │   ├── Dashboard.tsx    # saldo, mes, por asignar, deuda, metas, vencimientos
│   │   ├── Movimientos.tsx  # historial, filtros, cola "Por revisar", CSV
│   │   ├── Presupuesto.tsx  # sobres, traspasos, rollover, recurrentes
│   │   └── Plan.tsx         # metas, cuentas/patrimonio, money date
│   └── components/
│       ├── QuickAddModal.tsx  # captura rápida global (manual, sin cambios)
│       ├── ChatCapture.tsx    # chat texto/foto/voz, propuestas editables, confirmación
│       ├── CsvImport.tsx      # mapeo, preview, dedupe, reglas por comercio
│       ├── GoalCard.tsx       # progreso + marcador de ritmo esperado
│       └── EnvelopeCard.tsx   # sobre con alertas 80 % / 100 %
└── supabase/
    ├── config.toml            # verify_jwt en capture-parse / capture-confirm
    ├── functions/
    │   ├── _shared/capture.ts # validación JSON + hash dedupe (Deno)
    │   ├── capture-parse/index.ts   # texto/foto/voz -> propuestas (Cloudflare/Groq/Z.AI)
    │   ├── capture-confirm/index.ts # escribe en transactions tras confirmación
    │   └── reminders-push/index.ts  # envía el push Web Push (VAPID, sin JWT: la llama pg_cron)
    ├── migrations/001_init.sql  # todas las tablas + RLS
    ├── migrations/002_reminders.sql  # reminders + push_subscriptions + RLS
    └── seed.sql                 # categorías LatAm, cuentas y usuarios de ejemplo
```

## Paso a paso

### 1. Crear el proyecto Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `finanzas-en-pareja`. Elige región cercana (ej. US East) y una contraseña de base de datos segura. Guárdala.
3. Espera a que el proyecto se cree.
4. Ve a **Authentication → Providers → Email** y confirma que Email está activado. En **Authentication → Settings**, desactiva “Confirm email” si quieres probar sin confirmar correo (solo durante el desarrollo).

### 2. Correr la migración y el seed

1. En Supabase, abre **SQL Editor → New query**.
2. Pega todo el contenido de `supabase/migrations/001_init.sql` y pulsa **Run**. Esto crea las 11 tablas (`users`, `households`, `household_members`, `accounts`, `categories`, `transactions`, `rules`, `goals`, `goal_contributions`, `money_dates`, `recurring_expenses`).
3. Verifica en **Table Editor** que las tablas existan y en **Authentication → Policies** que el RLS esté activado.
4. **Seed (opcional, solo demo):** crea primero los 2 usuarios reales (por Auth o con el onboarding) y sustituye los UUID de ejemplo en `supabase/seed.sql` por los IDs reales de `auth.users`. Luego ejecuta el seed.

### 3. Variables de entorno

1. En Supabase ve a **Settings → API** y copia la **Project URL** y la **anon public key**. (Nunca uses la `service_role` key en el frontend.)
2. En tu computadora:

```bash
cp .env.example .env
```

3. Edita `.env`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-publica-aqui
```

4. El archivo `.env` ya está en `.gitignore`: **nunca se sube a GitHub**.

### 4. Correr en local y subir a GitHub

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # verifica que compila: tsc + vite build
```

Para subir a GitHub:

```bash
git init
git add .
git commit -m "Finanzas en Pareja: app completa (React + Supabase + PWA)"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/finanzas-en-pareja.git
git push -u origin main
```

### 5. Deploy gratuito en Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New → Project** → **Import** el repo `finanzas-en-pareja`.
2. Framework: Vite (se detecta solo). Build command: `npm run build`. Output: `dist`.
3. En **Environment Variables** agrega las mismas dos variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Pulsa **Deploy**. Obtendrás una URL `https://finanzas-en-pareja.vercel.app` (o similar). Esa es la URL que ambos usarán.
5. **Iconos PWA:** genera `public/icons/icon-192.png` y `public/icons/icon-512.png` (512×512 con fondo azul oscuro `#0F1530`) antes del deploy final.

### 6. Instalar la PWA en ambos teléfonos

**Android (Chrome):** 1. Abre la URL de Vercel en Chrome. 2. Menú → **Instalar app**/**Agregar a pantalla principal**. 3. Abre la app instalada e inicia sesión.

**iPhone (Safari):** 1. Abre la URL en Safari. 2. Compartir → **Agregar a pantalla de inicio**. 3. Abre la app desde el ícono e inicia sesión.

**Onboarding (solo la primera vez, uno de los dos):** 1. Crea tu cuenta → crea el hogar → comparte el código de invitación. 2. Tu pareja crea su cuenta y se une con ese código. 3. Se crean las cuentas y las 13 categorías con límites de ejemplo en MXN. 4. Registra el primer movimiento con el botón `+`.

### 7. Criterio de aceptación (pruébalo así)

1. Con los dos teléfonos y las dos cuentas dentro del mismo hogar, Jorge registra un gasto de $500 en despensa desde su teléfono.
2. **En menos de 2 segundos** el movimiento debe aparecer en el teléfono de su pareja (Realtime; si no aparece, revisa que la suscripción al canal `household-<id>` esté activa y que ambos vean el mismo hogar).
3. En **Inicio**, la deuda mutua debe mostrar quién le debe a quién y el monto correcto según el split (50/50 por defecto).
4. Pulsa **Liquidar ahora** en el teléfono del deudor: la deuda debe quedar en $0 (“Están a mano”) en ambos teléfonos.
5. Registra una transferencia entre dos cuentas propias: no debe aparecer como gasto en el Dashboard ni en Presupuesto.

## Datos y privacidad

- Sin conexión bancaria. Todo es manual o por CSV.
- Lo marcado como **privado** solo lo ve su dueño: la política RLS lo impide a nivel de base de datos, no solo oculta el dato en pantalla.
- La deduplicación de CSV usa un hash SHA-256 de `fecha + monto + comercio + cuenta`; el hash único por hogar evita importar dos veces el mismo movimiento.
- Al corregir la categoría de un comercio, se guarda una regla en `rules` y se aplica automáticamente a futuros movimientos de ese comercio.

## Desarrollo

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
npm run test:reminders
npm run test:capture
npm run test:pibbi
npm run test:login
```

## Licencia

Uso personal, gratis para siempre para 2 usuarios.
