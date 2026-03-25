import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgb(15 23 42 / 0.08), 0 4px 16px -4px rgb(15 23 42 / 0.06)",
        "soft-dark": "0 2px 8px -2px rgb(0 0 0 / 0.35), 0 4px 16px -4px rgb(0 0 0 / 0.25)",
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -6px rgb(15 23 42 / 0.08)",
        "card-dark": "0 1px 2px rgb(0 0 0 / 0.25), 0 8px 24px -8px rgb(0 0 0 / 0.35)",
      },
      backgroundImage: {
        "app-gradient":
          "linear-gradient(145deg, rgb(248 250 252) 0%, rgb(236 253 250) 42%, rgb(241 245 249) 100%)",
        "app-gradient-dark":
          "linear-gradient(145deg, rgb(15 23 42) 0%, rgb(17 24 39) 45%, rgb(15 23 42) 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
