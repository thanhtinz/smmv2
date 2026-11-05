/** Lớp khung trang auth theo "Kiểu trang Đăng nhập / Đăng ký" ở Cài đặt → Landing Page. */
export function authCardClass(style: string | undefined): string {
  switch (style) {
    case "glass": return "w-full max-w-md rounded-3xl border border-white/50 bg-white/70 p-8 shadow-2xl backdrop-blur-xl";
    case "minimal": return "w-full max-w-md p-8";
    case "app": return "w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl";
    default: return "card p-8 w-full max-w-md";
  }
}
