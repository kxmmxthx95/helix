/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        shell: "hsl(var(--shell))",
        raised: "hsl(var(--raised))",
        "fill-strong": "hsl(var(--fill-strong))",
        "accent-soft": "hsl(var(--accent-soft))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
        drawer: "var(--shadow-drawer)",
        thumb: "var(--shadow-thumb)",
      },
      transitionTimingFunction: {
        ios: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Sukhumvit Set", "Noto Sans Thai", "system-ui", "sans-serif"],
        heading: ["Geist", "-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Sukhumvit Set", "Noto Sans Thai", "system-ui", "sans-serif"],
        ui: ["Geist", "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Sukhumvit Set", "Noto Sans Thai", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
        game: ["Mali", "Prompt", "Sukhumvit Set", "Noto Sans Thai", "system-ui", "sans-serif"],
        sarabun: ["Sarabun", "system-ui", "-apple-system", "sans-serif"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: { from: { backgroundPosition: "150% 0" }, to: { backgroundPosition: "-50% 0" } },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
