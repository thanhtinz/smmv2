import { redirect } from "next/navigation";

/** Đăng ký định kỳ ĐÃ GỠ khỏi khu khách (lệnh Tín 2026-11-07): route cũ chuyển
 *  hướng về trang tổng quan, dữ liệu gói cũ vẫn giữ nguyên trong DB. */
export default function SubscriptionsRemoved() {
  redirect("/");
}
