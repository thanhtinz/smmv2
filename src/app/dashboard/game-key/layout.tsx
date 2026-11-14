import { requireModuleOn } from "@/lib/modules";

/** Cổng module khu Game Key (đợt 126 — luật module 2026-11-13): admin tắt
 *  khu Game Key ở Admin → Mô-đun thì MỌI trang của khu (danh mục, chi
 *  tiết, đơn hàng) bị chặn ở máy chủ, chuyển về trang chủ. Action đặt
 *  hàng và engine createPremiumOrder còn kiểm tra thêm một lớp riêng. */
export default async function GameKeyAreaLayout({ children }: { children: React.ReactNode }) {
  await requireModuleOn("gamekey");
  return <>{children}</>;
}
