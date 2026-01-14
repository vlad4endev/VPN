/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px', // iPhone SE and similar
        'sm': '640px', // Small tablets
        'md': '768px', // Tablets
        'lg': '1024px', // Desktops
        'xl': '1280px', // Large desktops
        '2xl': '1536px', // Extra large desktops
      },
      maxWidth: {
        'container': '1280px', // Max design width
      },
    },
  },
  plugins: [],
}

