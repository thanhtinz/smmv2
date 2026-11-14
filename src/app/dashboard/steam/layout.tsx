import { requireModuleOn } from "@/lib/modules";

/** Cổng module khu Steam (đợt 126 — luật module 2026-11-13): admin tắt
 *  khu Steam ở Admin → Mô-đun thì MỌI trang của khu (Top-Up, Gift Games,
 *  lịch sử) bị chặn ở máy chủ, chuyển về trang chủ. Action đặt hàng và
 *  engine createPremiumOrder còn kiểm tra thêm một lớp riêng. */
export default async function SteamAreaLayout({ children }: { children: React.ReactNode }) {
  await requireModuleOn("steam");
  return <>{children}</>;
}
