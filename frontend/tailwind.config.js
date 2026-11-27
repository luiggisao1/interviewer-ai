/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-secondary": "rgb(var(--ink-secondary) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-deep": "rgb(var(--accent-deep) / <alpha-value>)",
        verified: "rgb(var(--verified) / <alpha-value>)",
        "verified-deep": "rgb(var(--verified-deep) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        "danger-deep": "rgb(var(--danger-deep) / <alpha-value>)",
      },
      fontFamily: {
        serif: ['"Newsreader"', "Georgia", '"Iowan Old Style"', "serif"],
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        editorial: "0 10px 28px -16px rgba(24, 24, 27, 0.14)",
      },
      borderRadius: {
        editorial: "10px",
      },
    },
  },
  plugins: [],
};
