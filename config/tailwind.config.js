/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#080D16',
        panel: '#111B2A',
        raised: '#16233A',
        edge: 'rgb(148 163 184 / <alpha-value>)',
        teal: { DEFAULT: '#3FE0C0', strong: '#5BEBCF', ink: '#04201B' },
        ink: '#E8EEF6',
        slate2: '#8A99AE',
        faint: '#5B6B80',
        danger: '#F2768A',
        warn: '#E6B45A',
        sky: '#8AB4F8',
      },
      fontFamily: {
        sans: ['Geist', 'DM Sans', 'ui-sans-serif', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { 'fade-up': 'fade-up 280ms ease-out both' },
    },
  },
  plugins: [],
}
