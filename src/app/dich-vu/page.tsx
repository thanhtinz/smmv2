import { redirect } from "next/navigation";

/** Bảng giá SMM công khai ĐÃ GỠ — web tách thành Digital Shop thuần, phần SMM làm web riêng
 *  (lệnh Tín 2026-11-12): route cũ chuyển hướng về trang chủ để bookmark cũ
 *  không chết 404; dữ liệu cũ vẫn giữ nguyên trong DB. */
export default function PublicPriceRemoved() {
  redirect("/");
}
