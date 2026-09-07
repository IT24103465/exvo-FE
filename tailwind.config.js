/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#FF0000', // Red from the logo
          black: '#000000', // Black from the logo
        }
      }
    },
  },
  plugins: [],
}
