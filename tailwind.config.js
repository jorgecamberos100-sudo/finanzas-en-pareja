/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dos temas (ver src/lib/tema.ts y src/index.css): los valores viven
        // como tripletes RGB en variables CSS (--X-rgb) en :root (noche,
        // paleta A · Marino afinado) y en :root[data-theme='dia'] (día,
        // paleta C · Papel crema). Cambiar de tema es solo cambiar
        // data-theme en <html>; los componentes usan los mismos nombres
        // de token en ambos temas.
        // Sin rosa en la interfaz (decisión de George): el rosa es solo
        // de PIBBI. El acento principal es el dorado (dinero); el foco
        // es dorado en noche y tinta en día. A PIBBI no le afecta: sus
        // colores viven en sus propias variables e imágenes.
        noche: 'rgb(var(--noche-rgb) / <alpha-value>)',
        tarjeta: 'rgb(var(--tarjeta-rgb) / <alpha-value>)',
        elevado: 'rgb(var(--elevado-rgb) / <alpha-value>)',
        borde: 'rgb(var(--borde-rgb) / <alpha-value>)',
        crema: 'rgb(var(--crema-rgb) / <alpha-value>)',
        humo: 'rgb(var(--humo-rgb) / <alpha-value>)',
        menta: 'rgb(var(--menta-rgb) / <alpha-value>)',
        verde: 'rgb(var(--verde-rgb) / <alpha-value>)',
        dorado: 'rgb(var(--dorado-rgb) / <alpha-value>)',
        // Texto dorado (montos, metas, enlaces, código): en noche es el
        // dorado brillante; en día es un dorado oscuro (#7A5F08) para no
        // romper contraste sobre fondo claro. El relleno dorado de
        // botones sigue en `dorado`.
        doradotexto: 'rgb(var(--doradotexto-rgb) / <alpha-value>)',
        // Dorado al 10%: avisos y selección.
        doradotenue: 'rgb(var(--dorado-rgb) / 0.1)',
        rojosuave: 'rgb(var(--rojosuave-rgb) / <alpha-value>)',
        // Tinta oscura: texto sobre botones dorados y botón oscuro
        // ("Unirme"). En noche es el fondo #0A0F1E; en día, #1B2340.
        tinta: 'rgb(var(--tinta-rgb) / <alpha-value>)',
        // Atención (anillo de foco, barra de progreso, bordes de
        // aviso/selección): dorado en noche, tinta en día.
        foco: 'rgb(var(--foco-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
