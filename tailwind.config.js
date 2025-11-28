/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Ensure the retro font is available for use
        'retro': ['"Press Start 2P"', 'cursive'],
      },
      keyframes: {
        'float-up': {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-40px) scale(1.5)', opacity: '0' },
        },
        flicker: {
          '0%': { opacity: '0.02' },
          '5%': { opacity: '0.05' },
          '10%': { opacity: '0.02' },
          '15%': { opacity: '0.06' },
          '20%': { opacity: '0.02' },
          '50%': { opacity: '0.02' },
          '55%': { opacity: '0.05' },
          '60%': { opacity: '0.02' },
          '100%': { opacity: '0.02' },
        },
        'pulse-glow': {
          '0%, 100%': { 'text-shadow': '0 0 10px rgba(74, 222, 128, 0.5)' },
          '50%': { 'text-shadow': '0 0 20px rgba(74, 222, 128, 0.8)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      },
      animation: {
        'float-up': 'float-up 0.8s ease-out forwards',
        flicker: 'flicker 4s infinite',
        'pulse-glow': 'pulse-glow 2s infinite',
        'slide-down': 'slide-down 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
      }
    },
  },
  plugins: [],
}