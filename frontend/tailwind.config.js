/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bento: {
          bg: "#060A14",
          card: "#0E1626",
          subtle: "#080D1A",
          border: "rgba(59, 130, 246, 0.15)",
          "border-hover": "rgba(59, 130, 246, 0.35)",
          accent: "#38BDF8",
          primary: "#3B82F6",
          "primary-hover": "#2563EB",
          verified: "#10B981",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        bento: "0 20px 40px -10px rgba(2, 6, 23, 0.8)",
        "glow-blue": "0 0 16px rgba(59, 130, 246, 0.4)",
        "glow-emerald": "0 0 10px rgba(16, 185, 129, 0.4)",
      },
      borderRadius: {
        bento: "18px",
      },
    },
  },
  plugins: [],
};
