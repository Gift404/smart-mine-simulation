/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#0e141b",
        panel2: "#141c25",
        border: "#232d38",
        status: {
          normal: "#2fd47b",
          warning: "#f5a524",
          critical: "#f13c3c",
          lost: "#6b7683",
        },
      },
    },
  },
  plugins: [],
};
