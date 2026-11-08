import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Flash, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { GiftCardBuyForm, type GcProduct } from "@/components/gift-card";

export const dynamic = "force-dynamic";

/** Trang mua Gift Card — dựng theo ảnh mẫu chi tiết của chủ site (xem
 *  components/gift-card.tsx): thẻ header -> hàng sản phẩm -> thẻ mệnh giá
 *  -> thẻ NOTE của NCC -> thẻ tóm tắt đơn, nút Tiếp tục đặt đơn qua
 *  createPremiumOrder. Ghi chú (description) là văn bản thật phía FZR của
 *  category (note khi đồng bộ) — trang chỉ hiện, không tự chế. */
export default async function GiftCardDetailPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { msg?: string; err?: string };
}) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  const id = parseInt(params.id) || 0;
  const product = await prisma.premiumProduct.findFirst({
    where: { id, active: true, panelId: null, variants: { some: { providerGroup: "giftcards", active: true } } },
    select: {
      id: true, name: true, imageUrl: true, images: true, description: true,
      variants: {
        where: { providerGroup: "giftcards", active: true },
        select: { id: true, name: true, price: true, providerStock: true },
        orderBy: [{ price: "asc" }],
      },
    },
  });

  if (!product || product.variants.length === 0) {
    return (
      <div className="mx-auto max-w-[600px]">
        <div className="card"><Empty text={L("Danh mục không khả dụng hoặc đã ngưng bán")} /></div>
        <Link href="/dashboard/gift-card" className="btn-ghost mt-4 inline-flex !py-2.5">{L("Quay lại danh mục")}</Link>
      </div>
    );
  }

  const cover = product.imageUrl || (() => {
    if (product.images) { try { const arr = JSON.parse(product.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng */ } }
    return null;
  })();
  const gc: GcProduct = {
    id: product.id,
    name: product.name,
    image: cover,
    note: product.description?.trim() ? product.description : null,
    denoms: product.variants.map((v) => ({ variantId: v.id, name: v.name, price: v.price, stock: v.providerStock })),
  };

  return (
    <div className="mx-auto max-w-[600px]">
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      {/* Thẻ header như ảnh mẫu */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">Gift Cards &amp; Codes</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Danh mục thẻ quà tặng và mã nạp — chọn danh mục để xem các mệnh giá và giá.")}</p>
      </div>
      <div className="mt-5">
        <GiftCardBuyForm product={gc} balance={user.balance} />
      </div>
    </div>
  );
}
