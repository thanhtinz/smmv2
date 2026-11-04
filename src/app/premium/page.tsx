import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PremiumPage({ searchParams }: { searchParams: { cat?: string } }) {
  const cats = await prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  const catId = searchParams.cat ? parseInt(searchParams.cat) : undefined;
  const products = await prisma.premiumProduct.findMany({
    where: { active: true, ...(catId ? { categoryId: catId } : {}) },
    orderBy: { sort: "asc" },
    include: {
      category: true,
      variants: { where: { active: true }, orderBy: { price: "asc" } },
      _count: { select: { variants: true } },
    },
  });
  const stockByVariant = await prisma.premiumStock.groupBy({
    by: ["variantId"],
    where: { status: "AVAILABLE" },
    _count: true,
  });
  const stockMap = new Map(stockByVariant.map((x) => [x.variantId, x._count]));

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-extrabold text-slate-900">Tài khoản Premium</h1>
        <p className="text-slate-500 mt-2 mb-8">Gói có kho được giao ngay tự động sau thanh toán. Gói nâng cấp chính chủ được xử lý tay trên chính tài khoản của bạn, bảo hành rõ ràng từng gói.</p>
        <div className="flex flex-wrap gap-2 mb-8">
          <Link href="/premium" className={`btn-sm rounded-full font-semibold py-2 px-4 ${!catId ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Tất cả</Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/premium?cat=${c.id}`} className={`btn-sm rounded-full font-semibold py-2 px-4 ${catId === c.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{c.name}</Link>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((p) => {
            const from = p.variants[0];
            const totalStock = p.variants.reduce((sum, v) => sum + (stockMap.get(v.id) || 0), 0);
            return (
              <Link key={p.id} href={`/premium/${p.slug}`} className="card p-6 hover:shadow-lg transition group flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${p.fulfillment === "AUTO_STOCK" ? "bg-emerald-50 text-emerald-700" : p.fulfillment === "API" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`}>
                    {p.fulfillment === "AUTO_STOCK" ? (totalStock > 0 ? `Giao ngay · còn ${totalStock}` : "Giao tay (hết kho)") : p.fulfillment === "API" ? "Giao tự động qua đối tác" : "Nâng cấp chính chủ"}
                  </span>
                </div>
                <div className="font-bold text-lg text-slate-900 mt-4 group-hover:text-brand-700">{p.name}</div>
                <div className="text-xs text-slate-400">{p.category.name} · {p.variants.length} gói</div>
                <p className="text-sm text-slate-500 mt-2 line-clamp-2 flex-1">{p.tagline}</p>
                {from && <div className="mt-4">Chỉ từ <span className="font-extrabold text-brand-700 text-lg">{vnd(from.price)}</span></div>}
              </Link>
            );
          })}
          {products.length === 0 && <p className="text-slate-400">Chưa có sản phẩm nào.</p>}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
