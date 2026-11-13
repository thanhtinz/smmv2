import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { KiemTienView } from "@/components/kiemtien";
import { AffiliateIntro } from "@/components/affiliate-intro";
import { affiliateWithdrawMin } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export default async function EarnPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { getSettings } = await import("@/lib/settings");
  const settings = await getSettings();
  if (settings.module_affiliate === "0") { const { redirect } = await import("next/navigation"); redirect("/"); }
  const user = (await getCurrentUser())!;
  // CỔNG THAM GIA (chủ web chốt 2026-11-12, mẫu ldshop /account/aff): chưa
  // ghi danh (affiliateEnrolledAt = null) thì route này hiện trang GIỚI
  // THIỆU chương trình với tỉ lệ thật từ cấu hình; bấm "Đăng ký tham gia"
  // (enrollAffiliateAction) xong mới vào dashboard hoa hồng.
  if (!user.affiliateEnrolledAt) {
    return (
      <AffiliateIntro
        pct={Math.max(0, parseInt(settings.affiliate_percent || "0", 10) || 0)}
        withdrawMin={affiliateWithdrawMin(settings as any)}
      />
    );
  }
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  // Link giới thiệu dạng trang chủ + ?aff=MÃ (mẫu shopkey): cookie first-touch
  // 30 ngày + đếm click do AffTracker / /api/aff/click xử lý trên mọi trang.
  return <KiemTienView userId={user.id} linkBase={`${proto}://${host}`} sp={searchParams} tabBase="/dashboard/kiem-tien" />;
}
