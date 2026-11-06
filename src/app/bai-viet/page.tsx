import { redirect } from "next/navigation";

/* Bài viết đã chuyển vào khu khách (lệnh Tín 2026-11-05) — link cũ tự chuyển hướng. */
export default function Page({ searchParams }: { searchParams: { cat?: string; q?: string } }) {
  const qs = new URLSearchParams();
  if (searchParams.cat) qs.set("cat", searchParams.cat);
  if (searchParams.q) qs.set("q", searchParams.q);
  const s = qs.toString();
  redirect("/dashboard/bai-viet" + (s ? `?${s}` : ""));
}
