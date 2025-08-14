import type { Config } from 'tailwindcss'

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#F7941D",
          grey: "#3B3E44",
          bg: "#F7F8FA"
        }
      },
      borderRadius: {
        '2xl': '1.5rem'
      },
      boxShadow: {
        soft: "0 6px 24px rgba(0,0,0,0.06)"
      }
    },
  },
  plugins: [],
} satisfies Config
