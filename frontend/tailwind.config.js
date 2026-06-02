/** @type {import('tailwindcss').Config} */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('--c-bg'),
        surface: withAlpha('--c-surface'),
        'surface-2': withAlpha('--c-surface-2'),
        'surface-3': withAlpha('--c-surface-3'),
        line: withAlpha('--c-border'),
        'line-strong': withAlpha('--c-border-strong'),
        ink: withAlpha('--c-text'),
        muted: withAlpha('--c-muted'),
        faint: withAlpha('--c-faint'),
        accent: withAlpha('--c-accent'),
        'accent-2': withAlpha('--c-accent-2'),
        critical: withAlpha('--c-critical'),
        high: withAlpha('--c-high'),
        medium: withAlpha('--c-medium'),
        low: withAlpha('--c-low'),
        info: withAlpha('--c-info'),
        success: withAlpha('--c-success'),
        warning: withAlpha('--c-warning'),
        danger: withAlpha('--c-danger'),
      },
      fontFamily: {
        display: ['"Chakra Petch"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        widest2: '0.22em',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.35), 0 0 28px -4px rgb(var(--c-accent) / 0.45)',
        'glow-sm': '0 0 18px -6px rgb(var(--c-accent) / 0.55)',
        panel: '0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 24px 50px -28px rgb(0 0 0 / 0.85)',
        'inner-line': 'inset 0 0 0 1px rgb(var(--c-border) / 1)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(rgb(var(--c-border) / 0.55) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-border) / 0.55) 1px, transparent 1px)',
        'accent-sheen':
          'linear-gradient(135deg, rgb(var(--c-accent) / 1) 0%, rgb(var(--c-accent-2) / 1) 100%)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        sweep: {
          '0%': { transform: 'translateY(-120%)' },
          '100%': { transform: 'translateY(120%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(0.98)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--c-accent) / 0.45)' },
          '70%': { boxShadow: '0 0 0 9px rgb(var(--c-accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--c-accent) / 0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'grid-pan': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '44px 44px' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.5s ease both',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        sweep: 'sweep 4.5s linear infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-glow': 'pulse-glow 2.6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.66, 0, 0, 1) infinite',
        marquee: 'marquee 32s linear infinite',
        'grid-pan': 'grid-pan 18s linear infinite',
        blink: 'blink 1.1s steps(1) infinite',
      },
    },
  },
  plugins: [],
}
