/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        /* Mobile-First: base < 768px, md: 768px, lg: 1024px, xl: 1280px */
        'xs': '375px',
        'sm': '481px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      maxWidth: {
        'container': '80rem',   /* 1280px */
        'content': '90rem',
      },
      minHeight: {
        'touch': '2.75rem',    /* 44px - Apple HIG */
        'touch-lg': '3rem',    /* 48px - Material */
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
    },
  },
  plugins: [],
}

