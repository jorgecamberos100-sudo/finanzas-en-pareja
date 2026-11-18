/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del cerdito: fondo azul marino oscuro, rosa, dorado, menta.
        // Paleta A · Marino afinado: mismos acentos, superficies más separadas.
        noche: '#0A0F1E',
        tarjeta: '#232E52',
        elevado: '#2C3C68',
        borde: '#42548A',
        crema: '#FDE8D8',
        humo: '#C6CDEB',
        rosaclaro: '#F9A8B8',
        rosafuerte: '#F4728F',
        rosatenue: '#F4728F1A', // rosa fuerte al 10%: avisos y selección.
        menta: '#7DDBC3',
        verde: '#4ADE80',
        dorado: '#F5C542',
        rojosuave: '#FF8A80',
      },
    },
  },
  plugins: [],
}
