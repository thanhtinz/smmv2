import Link from "next/link";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Flash, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { parsePremiumFields } from "@/lib/format";
import { TopupBuyForm, type TuProduct } from "@/components/top-up";

export const dynamic = "force-dynamic";

/** Trang mua Top-Up — dựng theo ảnh mẫu chi tiết của chủ site (xem
 *  components/top-up.tsx): thẻ header -> hai cột trên PC (trái: hàng sản
 *  phẩm + thẻ gói nạp + thẻ NOTE của NCC; phải: tóm tắt đơn dính, các
 *  trường tuỳ chỉnh của game nằm trong tóm tắt). Ghi chú (description) là
 *  văn bản thật phía FZR của category (note khi đồng bộ) — trang chỉ hiện,
 *  không tự chế. Trường tuỳ chỉnh cũng là định nghĩa thật của NCC lưu kèm
 *  key; khách thấy nhãn admin đã đặt. */
export default async function TopupDetailPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { msg?: string; err?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { L, Ld } = await getServerI18n();
  const id = parseInt(params.id) || 0;
  const product = await prisma.premiumProduct.findFirst({
    where: { id, active: true, panelId: null, variants: { some: { providerGroup: "topups", active: true } } },
    select: {
      id: true, name: true, imageUrl: true, images: true, description: true, customFields: true,
      variants: {
        where: { providerGroup: "topups", active: true },
        select: { id: true, name: true, price: true, providerStock: true },
        orderBy: [{ price: "asc" }],
      },
    },
  });

  if (!product || product.variants.length === 0) {
    return (
      <div className="mx-auto max-w-[600px]">
        <div className="card"><Empty text={L("Game không khả dụng hoặc đã ngưng bán")} /></div>
        <Link href="/dashboard/top-up" className="btn-ghost mt-4 inline-flex !py-2.5">{L("Quay lại danh mục")}</Link>
      </div>
    );
  }

  const cover = product.imageUrl || (() => {
    if (product.images) { try { const arr = JSON.parse(product.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng */ } }
    return null;
  })();
  const tu: TuProduct = {
    id: product.id,
    name: product.name,
    image: cover,
    note: product.description?.trim() ? product.description : null,
    offers: product.variants.map((v) => ({ variantId: v.id, name: v.name, price: v.price, stock: v.providerStock })),
    fields: parsePremiumFields(product.customFields),
  };

  return (
    <div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      {/* Thẻ header như ảnh mẫu */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">Top-up games and services</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Danh mục nạp game và dịch vụ — chọn game để xem các gói nạp và giá.")}</p>
      </div>
      <div className="mt-5">
        <TopupBuyForm product={tu} balance={user.balance} />
      </div>
    </div>
  );
}
