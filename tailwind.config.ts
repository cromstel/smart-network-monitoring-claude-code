import type { Config } from 'tailwindcss'

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        down: token('down'),
        up: token('up'),
        danger: token('danger'),
        warning: token('warning'),
        success: token('success'),
      },
      fontFamily: {
        display: ['"Chakra Petch"', 'ui-sans-serif', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { DEFAULT: '4px', md: '6px', lg: '8px' },
      keyframes: {
        sweep: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '0.6' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        sweep: 'sweep 3s linear infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.2, 0.6, 0.4, 1) infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
