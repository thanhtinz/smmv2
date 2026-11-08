import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { SiteFooter, PublicHeader } from "@/components/site";
import { PremiumShopView } from "@/components/premium-views";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Shop Premium công khai (cho khách chưa đăng nhập). Đã đăng nhập -> vào bản trong
 *  khu khách /dashboard/premium để giao diện đồng bộ với SMM (một khung duy nhất). */
export default async function PremiumPage({ searchParams }: { searchParams: { cat?: string; q?: string; sort?: string; from?: string; to?: string } }) {
  const session = await getSession();
  if (session) {
    const qs = new URLSearchParams();
    if (searchParams.cat) qs.set("cat", searchParams.cat);
    if (searchParams.q) qs.set("q", searchParams.q);
    const s = qs.toString();
    redirect(`/dashboard/premium${s ? `?${s}` : ""}`);
  }
  const { L } = await getServerI18n();
  if ((await getSettings()).module_premium === "0") {
    return (
      <div className="dark pub-dark bg-[#07090d] text-slate-300 flex min-h-screen flex-col">
        <PublicHeader />
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-12">
          <div className="card max-w-md p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Mảng Premium đang tạm ngưng")}</div>
            <p className="mt-2 text-sm text-slate-500">{L("Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau hoặc dùng dịch vụ SMM.")}</p>
            <Link href="/dashboard/dich-vu" className="btn-primary mt-5 inline-block">{L("Xem dịch vụ SMM")}</Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-12 w-full">
        <PremiumShopView cat={searchParams.cat} q={searchParams.q} sort={searchParams.sort} from={searchParams.from} to={searchParams.to} base="/premium" />
      </main>
      <SiteFooter />
    </div>
  );
}
