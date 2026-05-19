/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef1fb',
          100: '#d5ddf5',
          200: '#aabaea',
          300: '#8097df',
          400: '#5574d4',
          500: '#3a5bca',
          600: '#2b3990',
          700: '#1f2a6a',
          800: '#141c47',
          900: '#0a1030',
          950: '#05071a',
        },
        itrm: {
          yellow:  '#FDB913',
          magenta: '#E0007A',
          orange:  '#F47920',
          green:   '#95C11F',
          cyan:    '#00AEEF',
        },
      },
    },
  },
  plugins: [],
}
