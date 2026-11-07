import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { PremiumShopView } from "@/components/premium-views";

export const dynamic = "force-dynamic";

/** Shop Premium TRONG khu khách — cùng khung dashboard với SMM (sidebar + header),
 *  dùng chung nội dung với trang công khai qua PremiumShopView. */
export default async function DashboardPremiumPage({ searchParams }: { searchParams: { cat?: string; q?: string; sort?: string; from?: string; to?: string } }) {
  if ((await getSettings()).module_premium === "0") {
    return (
      <div className="card p-8 text-center">
        <div className="text-lg font-bold text-slate-900">Mảng Premium đang tạm ngưng</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau hoặc dùng dịch vụ SMM.</p>
        <Link href="/dashboard/dich-vu" className="btn-primary mt-5 inline-block">Xem dịch vụ SMM</Link>
      </div>
    );
  }
  return <PremiumShopView cat={searchParams.cat} q={searchParams.q} sort={searchParams.sort} from={searchParams.from} to={searchParams.to} base="/dashboard/premium" />;
}
