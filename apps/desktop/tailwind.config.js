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
          successHover: "#36967C",
          warning: "#FFBB00",
          warningHover: "#FFD869",
          error: "#A42132",
          errorHover: "#D42B42",
          element:{
            immune: '#1B4B3E',
            superStrong: '#236050',
            strong: '#44BB9B',
            normal: '#FFFFFF',
            weak: '#D42B42',
            superWeak: '#A42132',
          },
          stats: {
            health: '#44BB9B',
            manaFrom: '#D5B7F7',
            manaTo: '#93FBFC',
            stamina: '#FFBB00',
            damage: '#D42B42'
          }
        }
      }
    },
  },
  plugins: []
}

