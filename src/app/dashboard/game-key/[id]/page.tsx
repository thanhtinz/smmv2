import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Flash, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { GameKeyBuyForm, type GkGame } from "@/components/game-key";

export const dynamic = "force-dynamic";

/** Trang mua Game Key — dựng theo ảnh mẫu chi tiết của chủ site (xem
 *  components/game-key.tsx): bìa lớn + chọn phiên bản (edition = gói
 *  gamekeys của game, giá + tồn kho phía FZR) + tóm tắt đơn, nút Tiếp tục
 *  đặt đơn qua createPremiumOrder. */
export default async function GameKeyDetailPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { msg?: string; err?: string };
}) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  const id = parseInt(params.id) || 0;
  const product = await prisma.premiumProduct.findFirst({
    where: { id, active: true, panelId: null, variants: { some: { providerGroup: "gamekeys", active: true } } },
    select: {
      id: true, name: true, imageUrl: true, images: true, providerPlatform: true, providerRegion: true, providerAppId: true, providerRegionRestricted: true,
      variants: {
        where: { providerGroup: "gamekeys", active: true },
        select: { id: true, name: true, price: true, providerStock: true, minOrderQty: true, maxOrderQty: true },
        orderBy: [{ price: "asc" }],
      },
    },
  });

  if (!product || product.variants.length === 0) {
    return (
      <div className="mx-auto max-w-[600px]">
        <div className="card"><Empty text={L("Game không khả dụng hoặc đã ngưng bán")} /></div>
        <Link href="/dashboard/game-key" className="btn-ghost mt-4 inline-flex !py-2.5">{L("Quay lại danh mục")}</Link>
      </div>
    );
  }

  const cover = product.imageUrl || (() => {
    if (product.images) { try { const arr = JSON.parse(product.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng */ } }
    return null;
  })();
  const game: GkGame = {
    id: product.id,
    name: product.name,
    image: cover,
    platform: product.providerPlatform,
    region: product.providerRegion,
    appid: product.providerAppId,
    regionRestricted: product.providerRegionRestricted,
    editions: product.variants.map((v) => ({ variantId: v.id, name: v.name, price: v.price, stock: v.providerStock, minQty: v.minOrderQty, maxQty: v.maxOrderQty })),
  };

  return (
    <div className="mx-auto max-w-[600px]">
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="mt-1">
        <GameKeyBuyForm game={game} balance={user.balance} />
      </div>
    </div>
  );
}
