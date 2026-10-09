import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#0c0e1a",
          soft: "#161a2e",
          card: "#ffffff",
        },
        brand: {
          50: "#eef1ff",
          100: "#dfe5ff",
          200: "#c5cfff",
          300: "#a1aeff",
          400: "#7c84ff",
          500: "#5e5bf5",
          600: "#4c44e8",
          700: "#3e36cc",
          800: "#322ea3",
          900: "#2b2b7d",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16, 18, 40, 0.05), 0 8px 24px -8px rgba(16, 18, 40, 0.10)",
        lift: "0 2px 4px rgba(16, 18, 40, 0.06), 0 16px 40px -12px rgba(16, 18, 40, 0.18)",
        glow: "0 0 0 1px rgba(94, 91, 245, 0.15), 0 8px 24px -8px rgba(94, 91, 245, 0.35)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
