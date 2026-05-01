/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
