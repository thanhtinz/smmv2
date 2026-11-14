import { requireModuleOn } from "@/lib/modules";

/** Cổng module khu Manual Services (đợt 126 — luật module 2026-11-13):
 *  admin tắt khu này ở Admin → Mô-đun thì MỌI trang của khu (danh mục,
 *  chi tiết, đơn hàng) bị chặn ở máy chủ, chuyển về trang chủ. Action
 *  đặt hàng, chat và engine createPremiumOrder còn kiểm tra thêm lớp
 *  riêng (chat chỉ chặn phía khách — staff vẫn xử lý đơn cũ). */
export default async function ManualAreaLayout({ children }: { children: React.ReactNode }) {
  await requireModuleOn("manual");
  return <>{children}</>;
}
