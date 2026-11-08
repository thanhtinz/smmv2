import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { PublicFrame } from "@/components/public-frame";
import { PremiumShopView } from "@/components/premium-views";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Shop Premium công khai trong KHUNG CỬA HÀNG cho MỌI khách (kể cả đã đăng
 *  nhập) — không còn chuyển hướng sang /dashboard/premium làm đổi khung giao
 *  diện. Xem/danh sách/chi tiết không cần đăng nhập; mua hàng mới cần. */
export default async function PremiumPage({ searchParams }: { searchParams: { cat?: string; q?: string; sort?: string; from?: string; to?: string } }) {
  const { L } = await getServerI18n();
  if ((await getSettings()).module_premium === "0") {
    return (
      <PublicFrame>
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-12">
          <div className="card max-w-md p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Mảng Premium đang tạm ngưng")}</div>
            <p className="mt-2 text-sm text-slate-500">{L("Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau hoặc dùng dịch vụ SMM.")}</p>
            <Link href="/dashboard/dich-vu" className="btn-primary mt-5 inline-block">{L("Xem dịch vụ SMM")}</Link>
          </div>
        </main>
      </PublicFrame>
    );
  }
  return (
    <PublicFrame>
      <main className="flex-1 max-w-7xl mx-auto px-4 py-12 w-full">
        <PremiumShopView cat={searchParams.cat} q={searchParams.q} sort={searchParams.sort} from={searchParams.from} to={searchParams.to} base="/premium" />
      </main>
    </PublicFrame>
  );
}
