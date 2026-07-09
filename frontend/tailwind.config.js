/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: /bg-luma-(000|100|300|500|700|900|FFF)(\/[0-9]+)?/,
    },
    {
      pattern: /text-luma-(000|100|300|500|700|900|FFF)/,
    },
    {
      pattern: /border-luma-(000|100|300|500|700|900|FFF)/,
    },
    'text-accent-gold',
    'bg-accent-gold',
    'border-accent-gold'
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '24': 'repeat(24, minmax(0, 1fr))',
      },
      spacing: {
        // Enforce 8pt grid system mapping
        '0': '0px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      colors: {
        luma: {
          '000': '#000000',
          100: '#111111',
          300: '#333333',
          500: '#666666',
          700: '#AAAAAA',
          900: '#E0E0E0',
          'FFF': '#FFFFFF',
        },
        'accent-gold': '#D4B89E',
        firewall: {
          red: '#9B4444',
          green: '#4A7C59',
          yellow: '#C89F3C',
          blue: '#456B7D',
          purple: '#6B5B95',
        },
        status: {
          safe: '#4A7C59',
          warn: '#C89F3C',
          blocked: '#9B4444',
          online: '#10B981',
          offline: '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slide-in 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
        'fade-in': 'fade-in 0.28s cubic-bezier(0.4, 0.0, 0.2, 1)',
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
