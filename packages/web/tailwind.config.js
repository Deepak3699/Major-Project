/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/pages/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          soft: 'hsl(var(--primary-soft))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          soft: 'hsl(var(--destructive-soft))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning-soft))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          soft: 'hsl(var(--info-soft))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        surface: 'hsl(var(--surface))',
        'border-strong': 'hsl(var(--border-strong))',
        sidebar: {
          DEFAULT: 'hsl(var(--surface))',
          foreground: 'hsl(var(--foreground))',
          muted: 'hsl(var(--muted))',
          border: 'hsl(var(--border))',
          active: 'hsl(var(--primary-soft))',
          'active-foreground': 'hsl(var(--primary-hover))',
        },
        hot: {
          DEFAULT: 'hsl(var(--destructive))',
          soft: 'hsl(var(--destructive-soft))',
        },
        warm: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))',
        },
        cold: {
          DEFAULT: 'hsl(var(--info))',
          soft: 'hsl(var(--info-soft))',
        },
      },
      // Golden-ratio (φ=1.618) modular scales derived from an 8px grid so
      // spacing, type and radius share one visual rhythm across every surface.
      spacing: {
        phi1: '0.5rem',   // 8
        phi2: '0.8125rem',// 13  ≈ 8×1.618
        phi3: '1.3125rem',// 21  ≈ 13×1.618
        phi4: '2.125rem', // 34  ≈ 21×1.618
        phi5: '3.4375rem',// 55  ≈ 34×1.618
      },
      fontSize: {
        // φ≈1.333 (fourth-root-of-2) type ramp — a classic, non-jarring scale.
        xs:   ['0.75rem',    { lineHeight: '1.112', letterSpacing: '0.01em' }],   // 12
        sm:   ['0.875rem',   { lineHeight: '1.485' }],                             // 14
        base: ['1rem',       { lineHeight: '1.618' }],                             // 16
        lg:   ['1.125rem',   { lineHeight: '1.485', letterSpacing: '-0.01em' }],   // 18
        xl:   ['1.3125rem',  { lineHeight: '1.485', letterSpacing: '-0.015em' }],  // 21
        '2xl':['1.618rem',   { lineHeight: '1.25',  letterSpacing: '-0.02em' }],   // 26
        '3xl':['2.291rem',   { lineHeight: '1.15',  letterSpacing: '-0.025em' }],  // 37
        '4xl':['3.052rem',   { lineHeight: '1.08',  letterSpacing: '-0.03em' }],   // 49
      },
      borderRadius: {
        lg: '0.618rem',
        xl: '0.8125rem',
        '2xl': '1.3125rem',
        md: '0.5rem',
        sm: '0.375rem',
        smlg: '0.3rem',
      },
      maxWidth: {
        // golden content measure ≈ 12/16 rem
        'phi-body': '46rem',
        content: '88rem',
      },
      fontFamily: {
        sans: ['Inter Variable', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Inter Variable', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--glow-soft)',
        float: '0 20px 50px -22px rgb(0 0 0 / 0.75), inset 0 1px 0 0 hsl(var(--foreground) / 0.05)',
        'card-hover': '0 16px 40px -18px hsl(var(--primary) / 0.35)',
        glow: 'var(--glow-primary)',
        'glow-sm': '0 0 22px -6px hsl(var(--primary) / 0.5)',
      },
      zIndex: {
        dropdown: '50',
        sticky: '20',
        overlay: '60',
        drawer: '60',
        palette: '90',
        modal: '80',
        toast: '120',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '400% 0' }, '100%': { backgroundPosition: '-400% 0' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        drawerIn: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        overlayIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        gradientMove: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scaleIn 0.35s cubic-bezier(0.22,1,0.36,1) both',
        float: 'float 6s ease-in-out infinite',
        'drawer-in': 'drawerIn 0.28s cubic-bezier(0.22,1,0.36,1) both',
        'overlay-in': 'overlayIn 0.2s ease both',
        'gradient-move': 'gradientMove 8s ease infinite',
      },
    },
  },
  plugins: [],
}
