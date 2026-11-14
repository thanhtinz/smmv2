import Link from "next/link";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Flash, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { parsePremiumFields } from "@/lib/format";
import { ManualBuyForm, type MsProduct } from "@/components/manual-services";

export const dynamic = "force-dynamic";

/** Trang mua Manual Services — cùng khung trang mua Top-Up: thẻ header
 *  -> hai cột trên PC (trái: hàng sản phẩm + thẻ gói kèm delivery_minutes
 *  / note_product của NCC + thẻ NOTE là info của category; phải: tóm tắt
 *  đơn dính, trường replenishment nằm trong tóm tắt). Dịch vụ không còn
 *  gói nào đang bán -> trạng thái tạm không khả dụng, không đặt được. */
export default async function ManualDetailPage( { params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>; }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { L, Ld } = await getServerI18n();
  const id = parseInt(params.id) || 0;
  const product = await prisma.premiumProduct.findFirst({
    where: { id, active: true, panelId: null, variants: { some: { providerGroup: "manual" } } },
    select: {
      id: true, name: true, imageUrl: true, images: true, description: true, providerKind: true, customFields: true,
      variants: {
        where: { providerGroup: "manual", active: true },
        select: { id: true, name: true, price: true, deliveryMinutes: true, providerNote: true },
        orderBy: [{ price: "asc" }],
      },
    },
  });

  if (!product) {
    return (
      <div className="mx-auto max-w-[600px]">
        <div className="card"><Empty text={L("Dịch vụ không khả dụng hoặc đã ngưng bán")} /></div>
        <Link href="/dashboard/manual-services" className="btn-ghost mt-4 inline-flex !py-2.5">{L("Quay lại danh mục")}</Link>
      </div>
    );
  }

  const cover = product.imageUrl || (() => {
    if (product.images) { try { const arr = JSON.parse(product.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng */ } }
    return null;
  })();
  const ms: MsProduct = {
    id: product.id,
    name: product.name,
    image: cover,
    info: product.description?.trim() ? product.description : null,
    kind: product.providerKind,
    offers: product.variants.map((v) => ({ variantId: v.id, name: v.name, price: v.price, minutes: v.deliveryMinutes, note: v.providerNote })),
    fields: parsePremiumFields(product.customFields),
  };

  return (
    <div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">Manual Services</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Duyệt và đặt các dịch vụ xử lý thủ công.")}</p>
      </div>
      <div className="mt-5">
        {ms.offers.length === 0 ? (
          <div className="mx-auto max-w-[600px]">
            <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
              <div className="bg-amber-600 px-3 py-2 text-center text-sm font-bold text-white">{L("Tạm thời không khả dụng")}</div>
              <div className="p-6 text-center">
                <div className="text-base font-bold text-slate-900">{product.name}</div>
                <p className="mt-1.5 text-sm text-slate-500">{L("Dịch vụ tạm ngưng nhận đơn — vui lòng quay lại sau.")}</p>
              </div>
            </div>
            <Link href="/dashboard/manual-services" className="btn-ghost mt-4 inline-flex !py-2.5">{L("Quay lại danh mục")}</Link>
          </div>
        ) : (
          <ManualBuyForm product={ms} balance={user.balance} />
        )}
      </div>
    </div>
  );
}
