import { redirect } from "next/navigation";

/* Bảng giá đã chuyển vào khu khách (lệnh Tín 2026-11-05) — link cũ tự chuyển hướng. */
export default function Page() {
  redirect("/dashboard/dich-vu");
}
