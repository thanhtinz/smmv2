import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Trang quản lý panel cũ đã chuyển vào Panel Admin riêng (/panel-admin) */
export default function OldPanelPage() {
  redirect("/panel-admin");
}
