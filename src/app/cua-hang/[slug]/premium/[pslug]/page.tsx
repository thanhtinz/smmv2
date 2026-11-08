import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteFooter, PublicHeader, PremiumInfoSections } from "@/components/site";
import { PremiumBuyForm } from "@/components/client";
import { Flash, I } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { buyPremiumAction } from "@/app/actions/user";
import { getSettings } from "@/lib/settings";
import { parsePremiumFields, productImages } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { ProductGallery } from "@/components/rich-editor";
import { getActiveFlashSale, flashAppliesToProduct } from "@/lib/flash";
import { FlashBanner } from "@/components/flash-banner";

export const dynamic = "force-dynamic";

/** Chi tiết Premium tại panel con — giá hiển thị là giá của panel này; đơn đặt tại đây
 *  (hoặc bất cứ đâu) của khách thuộc panel đều tính theo giá + cấp bậc của panel. */
export default async function PanelPremiumDetail({ params, searchParams }: { params: { slug: string; pslug: string }; searchParams: { msg?: string; err?: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const { L, Ld, M } = await getServerI18n(panel?.langConfig ?? null);
  const product = await prisma.premiumProduct.findUnique({
    where: { slug: params.pslug },
    include: { category: true, variants: { where: { active: true }, orderBy: [{ sort: "asc" }, { price: "asc" }] } },
  });
  if (!product || !product.active) notFound();
  if (product.panelId != null && product.panelId !== panel.id) notFound();
  const panelRate = (r: number) => Math.round(r * (1 + panel.markup / 100));
  // Flash sale riêng của panel này (phạm vi có Premium) — server vẫn chốt lại khi đặt đơn
  const flashSale = await getActiveFlashSale(panel.id, "PREMIUM");
  const flashPct = flashAppliesToProduct(flashSale, product.id) ? flashSale!.percent : 0;
  const base = `/cua-hang/${panel.slug}/premium`;
  const session = await getSession();
  const stocks = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE", variantId: { in: product.variants.map((v) => v.id) } }, _count: true });
  const stockMap = new Map(stocks.map((x) => [x.variantId, x._count]));
  const related = await prisma.premiumProduct.findMany({
    where: { active: true, categoryId: product.categoryId, id: { not: product.id }, OR: [{ panelId: null }, { panelId: panel.id }] },
    orderBy: { sort: "asc" }, take: 3,
    include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } },
  });

  return (
    <div data-accent={panel.accent} className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader panel={{ name: panel.name, slug: panel.slug }} announcement={panel.announcement} />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <Link href={base} className="text-sm font-medium text-brand-600">{L("← Tất cả sản phẩm Premium của")} {panel.name}</Link>
        <div className="mt-6 empty:hidden"><FlashBanner panelId={panel.id} kind="PREMIUM" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-6 items-start">
          <div className="lg:col-span-2">
            {productImages(product.images, product.imageUrl).length ? (
              <ProductGallery images={productImages(product.images, product.imageUrl)} name={product.name} />
            ) : (
              <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-white font-black text-3xl" style={{ background: product.color }}>{product.name.charAt(0)}</div>
            )}
            <h1 className="text-3xl font-extrabold text-slate-900 mt-5">{product.name}</h1>
            <p className="text-slate-500 mt-2">{product.tagline}</p>
            <div className="mt-5 space-y-2.5 text-sm text-slate-600">
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>{product.fulfillment === "AUTO_STOCK" ? L("Giao ngay tự động từ kho sau khi thanh toán") : L("Nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email")}</div>
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>{L("Bảo hành theo số ngày ghi trên từng gói — lỗi là đổi mới hoặc hoàn tiền")}</div>
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>{L("Thanh toán bằng số dư, xem lại nội dung đã giao bất cứ lúc nào trong mục Đơn Premium")}</div>
            </div>
            <div className="mt-4 text-sm text-slate-400">{L("Giá tại")} {panel.name} {L("— gói rẻ nhất:")} {product.variants[0] ? M(product.panelId ? product.variants[0].price : panelRate(product.variants[0].price)) : "—"}</div>
          </div>
          <div className="card p-6 lg:col-span-3">
            <h2 className="font-bold text-slate-900 mb-4">{L("Chọn gói")}</h2>
            <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
            {session ? (
              <PremiumBuyForm
                maxQty={parseInt((await getSettings()).premium_max_qty) || 50}
                slug={product.slug}
                fulfillment={product.fulfillment}
                action={buyPremiumAction}
                fields={parsePremiumFields(product.customFields)}
                note={product.buyNote}
                flashPct={flashPct}
                variants={product.variants.map((v) => ({ id: v.id, name: v.name, price: product.panelId ? v.price : panelRate(v.price), warrantyDays: v.warrantyDays, stock: stockMap.get(v.id) || 0 }))}
              />
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500 mb-4">{L("Đăng nhập để mua bằng số dư — nạp tiền qua SePay, cộng tự động.")}</p>
                <Link href="/login" className="btn-primary">{L("Đăng nhập")}</Link>
                <Link href={`/cua-hang/${panel.slug}/dang-ky`} className="btn-ghost ml-2">{L("Đăng ký tại")} {panel.name}</Link>
              </div>
            )}
          </div>
        </div>
        <PremiumInfoSections product={{ description: product.description, usageGuide: product.usageGuide, warrantyInfo: product.warrantyInfo, categoryName: product.category.name, fulfillment: product.fulfillment, variants: product.variants.map((v) => ({ name: v.name, warrantyDays: v.warrantyDays })) }} />
        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-extrabold text-slate-900 mb-5">{L("Sản phẩm liên quan")}</h2>
            <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto py-1 -my-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
              {related.map((p) => (
                <Link key={p.id} href={`${base}/${p.slug}`} className="card p-5 hover:shadow-lg transition group w-[75%] shrink-0 snap-start sm:w-auto">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                  <div className="font-bold text-slate-900 mt-3.5 group-hover:text-brand-700">{p.name}</div>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.tagline}</p>
                  {p.variants[0] && <div className="mt-3 text-sm">{L("Chỉ từ")} <span className="font-extrabold text-brand-700">{M(p.panelId ? p.variants[0].price : panelRate(p.variants[0].price))}</span></div>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <SiteFooter brand={{ name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
