/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Claude's warm neutral palette
        sand: {
          50:  "#faf9f7",
          100: "#f3f1ec",
          200: "#e8e3d9",
          300: "#d4cdc0",
          400: "#b8ae9e",
          500: "#9c9080",
        },
        claude: {
          bg:          "#faf9f7",
          surface:     "#ffffff",
          border:      "#e8e3d9",
          text:        "#1a1915",
          muted:       "#6b6659",
          accent:      "#d97757",
          accentHover: "#c96645",
        },
        tfl: {
          tube:       "#e32017",
          elizabeth:  "#6950a1",
          overground: "#ee7c0e",
          dlr:        "#00afad",
          bus:        "#e32017",
          walking:    "#4caf50",
          cycle:      "#f8a800",
          rail:       "#0099cc",
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%":     { opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        blink:     "blink 1s step-start infinite",
      },
    },
  },
  plugins: [],
}
