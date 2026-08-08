import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   '#0A0F1E',
          secondary: '#111827',
          card:      '#1A2235',
        },
        brand: {
          border:   '#1F2D45',
          green:    '#10B981',
          blue:     '#3B82F6',
          yellow:   '#F59E0B',
          red:      '#EF4444',
        },
        text: {
          primary:   '#F1F5F9',
          secondary: '#94A3B8',
          muted:     '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':  'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      keyframes: {
        pulse_ring: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':       { opacity: '0.5', transform: 'scale(1.08)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-700px 0' },
          '100%': { backgroundPosition: '700px 0' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulse_ring: 'pulse_ring 2s ease-in-out infinite',
        shimmer:    'shimmer 1.5s infinite linear',
        fadeIn:     'fadeIn 0.3s ease-out forwards',
      },
      boxShadow: {
        glow_green:  '0 0 20px rgba(16,185,129,0.3)',
        glow_blue:   '0 0 20px rgba(59,130,246,0.3)',
        glow_red:    '0 0 20px rgba(239,68,68,0.3)',
        glow_yellow: '0 0 20px rgba(245,158,11,0.3)',
        card:        '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}

export default config
