import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Flash } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { SteamGiftForm, type SteamGame } from "@/components/steam-gift";

export const dynamic = "force-dynamic";

/** Steam Gift Games — trang đặt hàng riêng dựng theo ảnh mẫu FZR: game từ
 *  các sản phẩm steam_gift đã đồng bộ (appid = providerItemId của variant),
 *  phiên bản = các variant của game, giá chốt tươi theo offer khi đặt đơn.
 *  Chưa đồng bộ game nào → giữ khung trang + thẻ "chưa có dữ liệu".
 *  Desktop lg+ chia 2 cột 73/27 (Summary dính) như trang chi tiết Premium;
 *  mobile 1 cột. */
export default async function SteamGiftPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();

  const products = await prisma.premiumProduct.findMany({
    where: { active: true, panelId: null, variants: { some: { providerGroup: "steam_gift", active: true } } },
    select: {
      id: true, name: true, imageUrl: true, images: true,
      variants: {
        where: { providerGroup: "steam_gift", active: true },
        select: { id: true, name: true, price: true, providerItemId: true },
        orderBy: { price: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  const firstImage = (p: { imageUrl: string | null; images: string | null }): string | null => {
    if (p.imageUrl) return p.imageUrl;
    if (p.images) { try { const arr = JSON.parse(p.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng -> ô trung tính */ } }
    return null;
  };
  const games: SteamGame[] = products
    .filter((p) => p.variants.length > 0)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      image: firstImage(p),
      appid: p.variants[0].providerItemId || "",
      editions: p.variants.map((v) => ({ variantId: v.id, name: v.name, price: v.price })),
    }));

  const headerNode = (
    <>
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[26px] font-black leading-tight text-slate-900">Steam Gift Games</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">{L("Danh mục Steam Gift.")}</p>
      </div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
    </>
  );
  return (
    <div className="mx-auto max-w-[600px] lg:max-w-[1100px]">
      {games.length === 0 ? (
        <div className="space-y-4 sm:space-y-5">
          {headerNode}
          <div className="card p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Chưa có dữ liệu Steam")}</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{L("Danh mục Steam chưa được đồng bộ — vui lòng quay lại sau.")}</p>
          </div>
        </div>
      ) : (
        <SteamGiftForm header={headerNode} games={games} balance={user.balance} />
      )}
    </div>
  );
}
