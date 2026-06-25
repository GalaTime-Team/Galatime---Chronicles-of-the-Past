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
          primaryHover: '#8F92D6',
          accent: '#C5B4E9',
          dark: '#09091A',
          success: "#236050",
          successHover: "#44BB9B",
          warning: "#FFBB00",
          warningHover: "#FFD869",
          error: "#A42132",
          errorHover: "#D42B42"
        }
      }
    },
  },
  plugins: []
}

