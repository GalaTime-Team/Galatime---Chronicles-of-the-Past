/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        custom: ['m5x7', '"Trebuchet MS"', '"Segoe UI"', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      },
      colors: {
        galatime: {
          primary: '#6D72CA',
          accent: '#C5B4E9',
          dark: '#09091A',
          correct: "#236050",
          warning: "#FFD869",
          error: "#A42132"
        }
      }
    },
  },
  plugins: []
}

