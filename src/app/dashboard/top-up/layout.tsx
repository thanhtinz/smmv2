import { requireModuleOn } from "@/lib/modules";

/** Cổng module khu Top-Up (đợt 126 — luật module 2026-11-13): admin tắt
 *  khu Top-Up ở Admin → Mô-đun thì MỌI trang của khu (danh mục, chi
 *  tiết, đơn hàng) bị chặn ở máy chủ, chuyển về trang chủ. Action đặt
 *  hàng và engine createPremiumOrder còn kiểm tra thêm một lớp riêng. */
export default async function TopupAreaLayout({ children }: { children: React.ReactNode }) {
  await requireModuleOn("topup");
  return <>{children}</>;
}
