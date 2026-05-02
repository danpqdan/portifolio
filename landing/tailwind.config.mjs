/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Marca — azul institucional. Mantido inalterado.
        brand: {
          50:  '#f0f7ff',
          100: '#dceefd',
          200: '#bcdcfb',
          300: '#8cc1f7',
          400: '#549cf0',
          500: '#2c79e6',
          600: '#1c5dd2',
          700: '#1849ab',
          800: '#173e8b',
          900: '#173672',
          950: '#0f2247',
        },
        // Tokens semanticos. Os componentes referenciam por intencao
        // ('success', 'danger') em vez da paleta crua ('emerald', 'red')
        // — facilita rebrand e mantem consistencia entre badge/toast/alert.
        success: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        danger: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        info: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Display — heros marketing. Linha curta pra densidade alta.
        'display-sm':  ['2.25rem', { lineHeight: '2.5rem',  letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md':  ['3rem',    { lineHeight: '3.25rem', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-lg':  ['3.75rem', { lineHeight: '4rem',    letterSpacing: '-0.03em',  fontWeight: '800' }],
      },
      boxShadow: {
        // Elevacao em superficie escura — sombra suave + brilho frio interior.
        'elev-1': '0 1px 2px 0 rgb(0 0 0 / 0.4), 0 1px 3px 0 rgb(0 0 0 / 0.3)',
        'elev-2': '0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
        'elev-3': '0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.4)',
      },
    },
  },
  plugins: [],
};
