import { redirect } from "next/navigation";

/** Trang đặt đơn SMM ĐÃ GỠ — web tách thành Digital Shop thuần, phần SMM làm web riêng
 *  (lệnh Tín 2026-11-12): route cũ chuyển hướng về trang chủ để bookmark cũ
 *  không chết 404; dữ liệu cũ vẫn giữ nguyên trong DB. */
export default function OrderRemoved() {
  redirect("/");
}
