import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { KiemTienView } from "@/components/kiemtien";

export const dynamic = "force-dynamic";

export default async function EarnPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { getSettings } = await import("@/lib/settings");
  if ((await getSettings()).module_affiliate === "0") { const { redirect } = await import("next/navigation"); redirect("/"); }
  const user = (await getCurrentUser())!;
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  // Link giới thiệu dạng trang chủ + ?aff=MÃ (mẫu shopkey): cookie first-touch
  // 30 ngày + đếm click do AffTracker / /api/aff/click xử lý trên mọi trang.
  return <KiemTienView userId={user.id} linkBase={`${proto}://${host}`} sp={searchParams} tabBase="/dashboard/kiem-tien" />;
}
