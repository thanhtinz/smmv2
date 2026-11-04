import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Màu chủ đạo chạy bằng CSS variable -> đổi được 6 tông giao diện + sáng/tối mà không sửa từng trang
        brand: {
          50: "rgb(var(--b50) / <alpha-value>)",
          100: "rgb(var(--b100) / <alpha-value>)",
          200: "rgb(var(--b200) / <alpha-value>)",
          300: "rgb(var(--b300) / <alpha-value>)",
          400: "rgb(var(--b400) / <alpha-value>)",
          500: "rgb(var(--b500) / <alpha-value>)",
          600: "rgb(var(--b600) / <alpha-value>)",
          700: "rgb(var(--b700) / <alpha-value>)",
          800: "rgb(var(--b800) / <alpha-value>)",
          900: "rgb(var(--b900) / <alpha-value>)",
        },
        ink: "#0b1220",
        panel: "#0f172a",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      boxShadow: { soft: "0 8px 24px rgba(27,46,94,.08)" },
    },
  },
  plugins: [],
};
export default config;
