# Finanzas en Pareja 💰

App de finanzas para una pareja (exactamente 2 usuarios): control mutuo de todo lo que entra, sale y de los planes comunes.

- **Español latinoamericano, MXN por defecto** (moneda configurable por hogar).
- **Registro 100 % manual + import CSV. Sin conexión bancaria, nunca.**
- **Gratis, sin anuncios, sin paywalls.** Nada esencial se bloquea.
- **Tiempo real:** todo cambio se refleja al instante en ambos teléfonos (Supabase Realtime).
- **PWA instalable**, mobile-first, modo claro/oscuro.
- **Privacidad real:** cada cuenta y movimiento puede ser compartido, solo saldo o privado. Lo privado solo lo ve su dueño, aplicado en RLS de base de datos, no solo en la UI.

## Funciones

| Área | Qué hace |
| --- | --- |
| Hogar de 2 | Login individual, invitación por código/enlace, roles admin / miembro |
| Captura rápida | Botón `+` fijo → monto, categoría, quién pagó, cuenta, fecha y nota en < 5 s |
| Split y deuda mutua | 50/50, % personalizado o uno absorbe todo → “X le debe $Y a Z” con botón de liquidar |
| Transferencias | Entre cuentas propias: **no cuentan como gasto** en reportes ni en la deuda mutua |
| Presupuesto por sobres | Límite por categoría, gastado, disponible, “Por asignar”, traspasos entre sobres y rollover acumulable |
| Import CSV | Mapeo de columnas, previsualización, deduplicación por hash y reglas por comercio |
| Metas | Objetivo, fecha límite, aportaciones por persona y marcador de ritmo esperado |
| Recurrentes | Gastos fijos / suscripciones con día de cobro; se proyectan y se restan del disponible |
| Alertas | Sobre al 80 % y 100 %, vencimientos y resumen semanal |
| Money date | Revisión en pareja con notas/acuerdos, liquidación y export CSV de respaldo |

## Stack

React + Vite + TypeScript + Tailwind CSS · Supabase (Auth email/password, PostgreSQL con RLS, Realtime) · PWA (manifest + service worker) · Deploy gratuito en Vercel.

## Estructura

```
finanzas-en-pareja/
├── index.html
├── package.json  vite.config.ts  tsconfig.json
├── tailwind.config.js  postcss.config.js
├── .env.example  .gitignore
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js            # fallback manual; en build lo genera vite-plugin-pwa
│   ├── favicon.svg
│   └── icons/           # icon-192.png y icon-512.png (generar, ver paso 5)
├── src/
│   ├── main.tsx  App.tsx  index.css  types.ts
│   ├── lib/
│   │   ├── supabase.ts  # cliente + hogar activo
│   │   ├── format.ts    # es-MX, MXN, hash de deduplicación CSV
│   │   └── split.ts     # split 50/50 y personalizado, deuda mutua,
│   │                    # totales del mes (transferencias excluidas)
│   ├── pages/
│   │   ├── Onboarding.tsx   # wizard de 5 pasos
│   │   ├── Dashboard.tsx    # saldo, mes, por asignar, deuda, metas, vencimientos
│   │   ├── Movimientos.tsx  # historial, filtros, cola "Por revisar", CSV
│   │   ├── Presupuesto.tsx  # sobres, traspasos, rollover, recurrentes
│   │   └── Plan.tsx         # metas, cuentas/patrimonio, money date
│   └── components/
│       ├── QuickAddModal.tsx  # captura rápida global
│       ├── CsvImport.tsx      # mapeo, preview, dedupe, reglas por comercio
│       ├── GoalCard.tsx       # progreso + marcador de ritmo esperado
│       └── EnvelopeCard.tsx   # sobre con alertas 80 % / 100 %
└── supabase/
    ├── migrations/001_init.sql  # todas las tablas + RLS
    └── seed.sql                 # categorías LatAm, cuentas y usuarios de ejemplo
```

## Paso a paso

### 1. Crear el proyecto Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `finanzas-en-pareja`. Elige región cercana (ej. US East) y una contraseña de base de datos segura. Guárdala.
3. Espera a que el proyecto se cree.
4. Ve a **Authentication → Providers → Email** y confirma que Email está activado. En **Authentication → Settings**, desactiva “Confirm email” si quieres probar sin confirmar correo (actívalo en producción).

### 2. Correr la migración y el seed

1. En Supabase, abre **SQL Editor → New query**.
2. Pega todo el contenido de `supabase/migrations/001_init.sql` y pulsa **Run**. Esto crea las 11 tablas (`users`, `households`, `household_members`, `accounts`, `categories`, `transactions`, `rules`, `recurring`, `goals`, `goal_contributions`, `money_dates`), los índices, las funciones `is_member` / `is_admin` y **todas las políticas RLS** (cada usuario solo ve su hogar; lo privado solo su dueño; solo admin edita el hogar).
3. Verifica en **Table Editor** que las tablas existan y en **Authentication → Policies** que el RLS esté activado.
4. **Seed (opcional, solo demo):** crea primero los 2 usuarios reales (por Auth o con el onboarding) y sustituye los UUID de ejemplo en `supabase/seed.sql` por los IDs reales de `auth.users`. Luego pega el seed en el SQL Editor y corre. En producción no hace falta: el onboarding crea las 13 categorías LatAm y las cuentas iniciales automáticamente.

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

El archivo `.env` ya está en `.gitignore`: **nunca se sube a GitHub**.

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
5. **Iconos PWA:** genera `public/icons/icon-192.png` y `public/icons/icon-512.png` (512×512 con fondo teal `#0f766e` y el símbolo 💰) antes del deploy final, o súbelos después y redeploya.

### 6. Instalar la PWA en ambos teléfonos

**Android (Chrome):**

1. Abre la URL de Vercel en Chrome.
2. Menú ⋮ → **Instalar app** / **Agregar a pantalla principal**.
3. Abre la app instalada e inicia sesión.

**iPhone (Safari):**

1. Abre la URL en Safari.
2. Compartir → **Agregar a pantalla de inicio**.
3. Abre la app desde el ícono e inicia sesión.

**Onboarding (solo la primera vez, uno de los dos):**

1. Crea tu cuenta → crea el hogar → comparte el código de invitación.
2. Tu pareja crea su cuenta y se une con ese código.
3. Se crean las cuentas y las 13 categorías con límites de ejemplo en MXN.
4. Registra el primer movimiento con el botón `+`.

### 7. Criterio de aceptación (pruébalo así)

1. Con los dos teléfonos y las dos cuentas dentro del mismo hogar, Jorge registra un gasto de $500 en Despensa desde su teléfono.
2. **En menos de 2 segundos** el movimiento debe aparecer en el teléfono de su pareja (Realtime; si no aparece, revisa que la suscripción al canal `household-<id>` esté activa y que ambos vean el mismo `household_id`).
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
npm run dev        # desarrollo
npm run typecheck  # tsc --noEmit
npm run build      # build de producción
npm run preview    # previsualizar el build
```

## Licencia

Uso personal, gratis para siempre para 2 usuarios.
