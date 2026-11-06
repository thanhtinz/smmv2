import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteFooter, PublicHeader, PremiumInfoSections } from "@/components/site";
import { PremiumBuyForm } from "@/components/client";
import { Flash, I } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { buyPremiumAction } from "@/app/actions/user";
import { getSettings } from "@/lib/settings";
import { vnd, parsePremiumFields, productImages } from "@/lib/format";
import { ProductGallery } from "@/components/rich-editor";

export const dynamic = "force-dynamic";

export default async function PremiumDetail({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  const product = await prisma.premiumProduct.findUnique({
    where: { slug: params.slug },
    include: { category: true, variants: { where: { active: true }, orderBy: [{ sort: "asc" }, { price: "asc" }] } },
  });
  if (!product || !product.active) notFound();
  const session = await getSession();
  const viewer = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { panelId: true } }) : null;
  if (product.panelId != null && product.panelId !== viewer?.panelId) notFound();
  const stocks = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE", variantId: { in: product.variants.map((v) => v.id) } }, _count: true });
  const stockMap = new Map(stocks.map((x) => [x.variantId, x._count]));
  const maxQty = parseInt((await getSettings()).premium_max_qty) || 50;
  const related = await prisma.premiumProduct.findMany({
    where: { active: true, categoryId: product.categoryId, id: { not: product.id }, OR: [{ panelId: null }, ...(viewer?.panelId ? [{ panelId: viewer.panelId }] : [])] },
    orderBy: { sort: "asc" }, take: 3,
    include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } },
  });

  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <Link href="/premium" className="text-sm font-medium text-brand-600">← Tất cả sản phẩm Premium</Link>
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
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>{product.fulfillment === "AUTO_STOCK" ? "Giao ngay tự động từ kho sau khi thanh toán" : "Nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email"}</div>
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>Bảo hành theo số ngày ghi trên từng gói — lỗi là đổi mới hoặc hoàn tiền</div>
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>Thanh toán bằng số dư, xem lại nội dung đã giao bất cứ lúc nào trong mục Đơn Premium</div>
            </div>
            <div className="mt-4 text-sm text-slate-400">Giá tham khảo gói rẻ nhất: {product.variants[0] ? vnd(product.variants[0].price) : "—"}</div>
          </div>
          <div className="card p-6 lg:col-span-3">
            <h2 className="font-bold text-slate-900 mb-4">Chọn gói</h2>
            <Flash msg={searchParams.msg} err={searchParams.err} />
            {session ? (
              <PremiumBuyForm
                maxQty={maxQty}
                slug={product.slug}
                fulfillment={product.fulfillment}
                action={buyPremiumAction}
                fields={parsePremiumFields(product.customFields)}
                note={product.buyNote}
                variants={product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, warrantyDays: v.warrantyDays, stock: stockMap.get(v.id) || 0 }))}
              />
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500 mb-4">Đăng nhập để mua bằng số dư — nạp tiền bằng chuyển khoản, cộng tự động.</p>
                <Link href={`/login`} className="btn-primary">Đăng nhập</Link>
                <Link href="/register" className="btn-ghost ml-2">Đăng ký</Link>
              </div>
            )}
          </div>
        </div>
        <PremiumInfoSections product={{ description: product.description, usageGuide: product.usageGuide, warrantyInfo: product.warrantyInfo, categoryName: product.category.name, fulfillment: product.fulfillment, variants: product.variants.map((v) => ({ name: v.name, warrantyDays: v.warrantyDays })) }} />
        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-extrabold text-slate-900 mb-5">Sản phẩm liên quan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.map((p) => (
                <Link key={p.id} href={`/premium/${p.slug}`} className="card p-5 hover:shadow-lg transition group">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                  <div className="font-bold text-slate-900 mt-3.5 group-hover:text-brand-700">{p.name}</div>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.tagline}</p>
                  {p.variants[0] && <div className="mt-3 text-sm">Chỉ từ <span className="font-extrabold text-brand-700">{vnd(p.variants[0].price)}</span></div>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
