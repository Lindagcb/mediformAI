/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#008A80',        // Ubomi Buhle teal
        primaryLight: '#E6F5F4',   // light mint background
        primaryBorder: '#B3E0DC',  // soft teal border
        primaryHover: '#00776E',   // darker hover teal
      },
    },
  },
  plugins: [],
};
