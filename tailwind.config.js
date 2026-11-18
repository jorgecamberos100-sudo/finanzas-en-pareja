/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dos temas (ver src/lib/tema.ts y src/index.css): los valores viven
        // como tripletes RGB en variables CSS (--X-rgb) en :root (noche,
        // esmeralda oscura, fondo verde casi negro) y en
        // :root[data-theme='dia'] (día, esmeralda clara, fondo blanco
        // verdoso). Cambiar de tema es solo cambiar data-theme en <html>;
        // los componentes usan los mismos nombres de token en ambos temas.
        // Sin rosa en la interfaz (decisión de George): el rosa es solo
        // de PIBBI. La señal de dinero es la menta brillante (relleno
        // de botones); el foco es menta en noche y esmeralda en día.
        // A PIBBI no le afecta: sus colores viven en sus propias
        // variables e imágenes.
        noche: 'rgb(var(--noche-rgb) / <alpha-value>)',
        tarjeta: 'rgb(var(--tarjeta-rgb) / <alpha-value>)',
        elevado: 'rgb(var(--elevado-rgb) / <alpha-value>)',
        borde: 'rgb(var(--borde-rgb) / <alpha-value>)',
        crema: 'rgb(var(--crema-rgb) / <alpha-value>)',
        humo: 'rgb(var(--humo-rgb) / <alpha-value>)',
        menta: 'rgb(var(--menta-rgb) / <alpha-value>)',
        verde: 'rgb(var(--verde-rgb) / <alpha-value>)',
        dorado: 'rgb(var(--dorado-rgb) / <alpha-value>)',
        // Texto de acento (montos, metas, enlaces, código): en noche es
        // una menta clara (#6EE7B7); en día es un verde oscuro (#0B5C3D)
        // para no romper contraste sobre fondo claro. El relleno de
        // botones sigue en `dorado` (menta brillante #20B981).
        doradotexto: 'rgb(var(--doradotexto-rgb) / <alpha-value>)',
        // Dorado al 10%: avisos y selección.
        doradotenue: 'rgb(var(--dorado-rgb) / 0.1)',
        rojosuave: 'rgb(var(--rojosuave-rgb) / <alpha-value>)',
        // Tinta oscura: texto sobre botones menta y botón oscuro
        // ("Unirme"). En ambos temas es el verde casi negro #0C2B1C.
        tinta: 'rgb(var(--tinta-rgb) / <alpha-value>)',
        // Atención (anillo de foco, barra de progreso, bordes de
        // aviso/selección): menta en noche, esmeralda en día.
        foco: 'rgb(var(--foco-rgb) / <alpha-value>)',
      },
      // Tipografía propia: Inter para interfaz, Sora para títulos y montos.
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Sombras por tema (las variables viven en src/index.css): suaves en
      // día, profundas en noche. Dan la sensación de tarjeta física.
      boxShadow: {
        tarjeta: 'var(--sombra-tarjeta)',
        elevado: 'var(--sombra-elevada)',
        fab: 'var(--sombra-fab)',
      },
      keyframes: {
        'hoja-subir': {
          from: { transform: 'translateY(28px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'paso-entrar': {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        aparecer: { from: { opacity: '0' }, to: { opacity: '1' } },
        'latido-suave': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
      },
      animation: {
        'hoja-subir': 'hoja-subir 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'paso-entrar': 'paso-entrar 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        aparecer: 'aparecer 0.25s ease-out',
        'latido-suave': 'latido-suave 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}