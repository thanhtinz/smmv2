import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50:"#eef6ff",100:"#d9eaff",200:"#bcdbff",300:"#8ec4ff",400:"#589eff",500:"#3178fc",600:"#1d5df1",700:"#1548de",800:"#183eb4",900:"#1a378e" },
        ink: "#0b1220",
        panel: "#0f172a",
      },
      fontFamily: { sans: ["Inter","system-ui","sans-serif"] },
      boxShadow: { soft: "0 8px 30px rgba(2,6,23,.08)" },
    },
  },
  plugins: [],
};
export default config;
