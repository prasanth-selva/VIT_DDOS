/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './frontend/**/*.{html,js,jsx,ts,tsx}',
    './src/**/*.{html,js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark layered blacks
        'bg-main': '#050505',
        'bg-surface': '#0b0b0b',
        'bg-card': '#0f0f0f',
        'bg-secondary': '#1a1a1a',
        'border-dark': '#1f1f1f',
        'border-subtle': '#2a2a2a',

        // Red accent palette
        'red-primary': '#ef4444',
        'red-accent': '#dc2626',
        'red-light': '#f87171',
        'red-muted': '#dc2626',
        'red-glow': 'rgba(239, 68, 68, 0.45)',
        'red-soft': 'rgba(239, 68, 68, 0.12)',
        'red-dim': 'rgba(239, 68, 68, 0.08)',
      },

      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      letterSpacing: {
        'mono-tight': '0.025em',
        'mono-normal': '0.05em',
      },

      boxShadow: {
        // Glowing card shadows
        'red-glow-sm': '0 0 12px rgba(239, 68, 68, 0.25)',
        'red-glow-md': '0 0 24px rgba(239, 68, 68, 0.35)',
        'red-glow-lg': '0 0 40px rgba(239, 68, 68, 0.45)',

        // Deep card shadows
        'card-depth': '0 20px 40px rgba(0, 0, 0, 0.6)',
        'card-depth-lg': '0 30px 60px rgba(0, 0, 0, 0.8)',

        // Subtle inner shadows
        'inset-dark': 'inset 0 1px 3px rgba(0, 0, 0, 0.5)',
      },

      backgroundImage: {
        // Radial red glow for backgrounds
        'radial-red-glow': 'radial-gradient(ellipse 800px at 50% 50%, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0) 70%)',
        'radial-red-soft': 'radial-gradient(ellipse 1000px at 50% 50%, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0) 80%)',

        // Subtle grid patterns
        'grid-subtle': `
          linear-gradient(rgba(239, 68, 68, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(239, 68, 68, 0.03) 1px, transparent 1px)
        `,
      },

      backgroundSize: {
        'grid-lg': '60px 60px',
      },

      animation: {
        'pulse-red': 'pulse-red 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-line': 'scan-line 4s linear infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.6s ease-out',
      },

      keyframes: {
        'pulse-red': {
          '0%, 100%': {
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.3)',
          },
          '50%': {
            boxShadow: '0 0 24px rgba(239, 68, 68, 0.6)',
          },
        },

        'scan-line': {
          '0%': {
            transform: 'translateY(-100%)',
          },
          '100%': {
            transform: 'translateY(100%)',
          },
        },

        'glow-pulse': {
          '0%, 100%': {
            opacity: '0.8',
          },
          '50%': {
            opacity: '1',
          },
        },

        'fade-in': {
          '0%': {
            opacity: '0',
          },
          '100%': {
            opacity: '1',
          },
        },
      },

      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },

      transitionTimingFunction: {
        'out-smooth': 'cubic-bezier(0.33, 0.66, 0.66, 1)',
      },

      backdropBlur: {
        xs: '2px',
      },

      opacity: {
        '2': '0.02',
        '3': '0.03',
        '8': '0.08',
      },
    },
  },

  plugins: [],
};
