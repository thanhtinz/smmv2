import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PublicFrame } from "@/components/public-frame";
import { PremiumShopView } from "@/components/premium-views";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** SEO RIÊNG theo DANH MỤC (đợt 121): khi khách lọc ?cat=<id> và danh mục
 *  đó có metaTitle/metaDescription (sửa ở Admin → Danh mục Premium) thì
 *  trang danh sách dùng đúng bản đó; trống -> {} dùng mặc định toàn web. */
export async function generateMetadata({ searchParams }: { searchParams: { cat?: string } }): Promise<Metadata> {
  const catId = searchParams.cat ? parseInt(searchParams.cat) : NaN;
  if (!Number.isFinite(catId) || catId <= 0) return {};
  const cat = await prisma.premiumCategory.findUnique({
    where: { id: catId },
    select: { active: true, metaTitle: true, metaDescription: true },
  }).catch(() => null);
  if (!cat || !cat.active || (!cat.metaTitle && !cat.metaDescription)) return {};
  // Object twitter ở trang con không kế thừa `card` của layout (Next tự điền
  // "summary") — đọc cùng setting twitter_card như layout (đợt 121).
  const s = await getSettings().catch(() => null);
  const cardType = s?.twitter_card === "summary" ? "summary" : "summary_large_image";
  return {
    ...(cat.metaTitle ? { title: cat.metaTitle } : {}),
    ...(cat.metaDescription ? { description: cat.metaDescription } : {}),
    openGraph: {
      ...(cat.metaTitle ? { title: cat.metaTitle } : {}),
      ...(cat.metaDescription ? { description: cat.metaDescription } : {}),
    },
    twitter: {
      card: cardType,
      ...(cat.metaTitle ? { title: cat.metaTitle } : {}),
      ...(cat.metaDescription ? { description: cat.metaDescription } : {}),
    },
  };
}

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
            <p className="mt-2 text-sm text-slate-500">{L("Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau.")}</p>
            <Link href="/" className="btn-primary mt-5 inline-block">{L("Về trang chủ")}</Link>
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
