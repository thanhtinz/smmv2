import { redirect } from "next/navigation";

/** Trang Cài đặt Telegram ĐÃ BỎ (lệnh Tín 2026-11-08): FZR là MỘT nhà cung
 *  cấp dùng chung cho mọi dòng sản phẩm — cấu hình chung (webhook, phân công
 *  nhà cung cấp phục vụ Telegram) nằm ở trang Nhà cung cấp; công tắc bật/tắt
 *  mục Telegram nằm ở trang Mô-đun. Giữ route này làm redirect để bookmark
 *  cũ không gãy. */
export default function AdminTelegramSettingsGone() {
  redirect("/admin/nha-cung-cap");
}
