import { SiteFooter, PublicHeader } from "@/components/site";
import { PremiumDetailView } from "@/components/premium-views";

export const dynamic = "force-dynamic";

/** Chi tiết Premium công khai trong khung cửa hàng cho mọi khách — không còn
 *  chuyển hướng khách đã đăng nhập sang khu khách (đổi khung). Form mua bên
 *  trong tự hiện theo phiên đăng nhập; xem chi tiết không cần đăng nhập. */
export default async function PremiumDetail({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <PremiumDetailView slug={params.slug} searchParams={searchParams} base="/premium" />
      </main>
      <SiteFooter />
    </div>
  );
}
