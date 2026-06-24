/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gala: {
          obsidian: "#111113",
          ember: "#c05a2e",
          parchment: "#f6e3b4",
          steel: "#5a6a73",
        },
      },
    },
  },
  plugins: [],
}

