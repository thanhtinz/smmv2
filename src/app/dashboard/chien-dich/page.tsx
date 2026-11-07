import { redirect } from "next/navigation";

/** Chiến dịch ĐÃ GỠ khỏi khu khách (lệnh Tín 2026-11-07): route cũ chuyển hướng
 *  về trang tổng quan, dữ liệu chiến dịch cũ vẫn giữ nguyên trong DB. */
export default function CampaignsRemoved() {
  redirect("/dashboard");
}
