/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Mobile-first: 320-480px (base), 481+ tablet, 1025+ laptop, 1441+ large
        'xs': '375px',   // Large phones (iPhone SE+)
        'sm': '481px',   // Tablets portrait
        'md': '768px',   // Tablets landscape
        'lg': '1025px',  // Laptops
        'xl': '1441px',  // Large desktops
        '2xl': '1920px', // Ultra-wide
      },
      maxWidth: {
        'container': '1280px',
        'content': '90rem',
      },
      minHeight: {
        'touch': '44px',
        'touch-lg': '48px',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
    },
  },
  plugins: [],
}

