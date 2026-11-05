import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Trang Cài đặt panel cũ đã gộp về một trang Cài đặt duy nhất (/panel-admin/cau-hinh):
 *  thông tin + kết nối ở tab Chung, mô-đun tách ra Cửa hàng Addon, widget ra Widget Liên hệ.
 *  Giữ route này để link cũ tự chuyển hướng. */
export default function PanelSettingsLegacyRedirect() {
  redirect("/panel-admin/cau-hinh");
}
