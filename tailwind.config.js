/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.ts'],
  theme: {
    extend: {
      // Palette de DESIGN.md, nommée par rôle
      colors: {
        paper: '#F2F4F7',
        surface: '#FFFFFF',
        raised: '#E9EDF2',
        ink: '#141B26',
        ink2: '#455062',
        muted: '#5B6678',
        line: '#DDE2E9',
        'line-strong': '#C2CAD5',
        'on-accent': '#FFFFFF',
        brass: '#B07A1E',
        ame: '#5B3FA6',
        siren: '#B3281A',
        brand: { DEFAULT: '#7E5409', dark: '#654307', light: '#F3E7CC' },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
