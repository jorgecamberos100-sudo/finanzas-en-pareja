/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del cerdito: fondo azul marino oscuro, rosa, dorado, menta.
        noche: '#0F1530',
        tarjeta: '#1A2145',
        elevado: '#232B52',
        borde: '#2A3358',
        crema: '#FDE8D8',
        humo: '#B9C0E0',
        rosaclaro: '#F9A8B8',
        rosafuerte: '#F4728F',
        menta: '#7DDBC3',
        verde: '#4ADE80',
        dorado: '#F5C542',
        rojosuave: '#FF8A80',
      },
    },
  },
  plugins: [],
}
