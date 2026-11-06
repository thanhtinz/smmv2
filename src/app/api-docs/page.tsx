import { redirect } from "next/navigation";

/* Tài liệu API đã chuyển vào khu khách (lệnh Tín 2026-11-05) — link cũ tự chuyển hướng. */
export default function Page() {
  redirect("/dashboard/api-docs");
}
