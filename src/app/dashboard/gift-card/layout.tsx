import { requireModuleOn } from "@/lib/modules";

/** Cổng module khu Gift Card (đợt 126 — luật module 2026-11-13): admin
 *  tắt khu Gift Card ở Admin → Mô-đun thì MỌI trang của khu (danh mục,
 *  chi tiết, đơn hàng) bị chặn ở máy chủ, chuyển về trang chủ. Action
 *  đặt hàng và engine createPremiumOrder còn kiểm tra thêm một lớp. */
export default async function GiftCardAreaLayout({ children }: { children: React.ReactNode }) {
  await requireModuleOn("giftcard");
  return <>{children}</>;
}
