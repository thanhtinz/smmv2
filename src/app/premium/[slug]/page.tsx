import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { PremiumBuyForm } from "@/components/client";
import { Flash, I } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { buyPremiumAction } from "@/app/actions/user";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PremiumDetail({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  const product = await prisma.premiumProduct.findUnique({
    where: { slug: params.slug },
    include: { category: true, variants: { where: { active: true }, orderBy: [{ sort: "asc" }, { price: "asc" }] } },
  });
  if (!product || !product.active) notFound();
  const session = await getSession();
  const stocks = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE", variantId: { in: product.variants.map((v) => v.id) } }, _count: true });
  const stockMap = new Map(stocks.map((x) => [x.variantId, x._count]));

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <Link href="/premium" className="text-sm font-medium text-brand-600">← Tất cả sản phẩm Premium</Link>
        <div className="grid lg:grid-cols-5 gap-8 mt-6 items-start">
          <div className="lg:col-span-2">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-white font-black text-3xl" style={{ background: product.color }}>{product.name.charAt(0)}</div>
            <h1 className="text-3xl font-extrabold text-slate-900 mt-5">{product.name}</h1>
            <p className="text-slate-500 mt-2">{product.tagline}</p>
            <div className="mt-5 space-y-2.5 text-sm text-slate-600">
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>{product.fulfillment === "AUTO_STOCK" ? "Giao ngay tự động từ kho sau khi thanh toán" : "Nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email"}</div>
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>Bảo hành theo số ngày ghi trên từng gói — lỗi là đổi mới hoặc hoàn tiền</div>
              <div className="flex gap-2"><span className="text-emerald-600 mt-0.5">{I.check}</span>Thanh toán bằng số dư, xem lại nội dung đã giao bất cứ lúc nào trong mục Đơn Premium</div>
            </div>
            {product.description && <div className="mt-6 text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-white border border-slate-200 rounded-2xl p-5">{product.description}</div>}
            <div className="mt-4 text-sm text-slate-400">Giá tham khảo gói rẻ nhất: {product.variants[0] ? vnd(product.variants[0].price) : "—"}</div>
          </div>
          <div className="card p-6 lg:col-span-3">
            <h2 className="font-bold text-slate-900 mb-4">Chọn gói</h2>
            <Flash msg={searchParams.msg} err={searchParams.err} />
            {session ? (
              <PremiumBuyForm
                slug={product.slug}
                fulfillment={product.fulfillment}
                action={buyPremiumAction}
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
      </main>
      <SiteFooter />
    </div>
  );
}
