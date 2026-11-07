import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { PremiumInfoSections } from "@/components/site";
import { PremiumBuyForm } from "@/components/client";
import { Flash, I } from "@/components/ui";
import { buyPremiumAction } from "@/app/actions/user";
import { vnd, parsePremiumFields, productImages } from "@/lib/format";
import { ProductGallery } from "@/components/rich-editor";

/** Nội dung shop Premium dùng CHUNG cho trang công khai (/premium) và trang trong
 *  khu khách (/dashboard/premium) — chỉ khác đường dẫn gốc (base) của link nội bộ,
 *  để khách đã đăng nhập ở trong đúng một khung giao diện như SMM. */
export async function PremiumShopView({ cat, q, base }: { cat?: string; q?: string; base: string }) {
  const session = await getSession();
  const viewer = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { panelId: true } }) : null;
  const cats = await prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  const catId = cat ? parseInt(cat) : undefined;
  const needle = (q || "").trim().toLowerCase();
  const allProducts = await prisma.premiumProduct.findMany({
    where: { active: true, ...(catId ? { categoryId: catId } : {}), OR: [{ panelId: null }, ...(viewer?.panelId ? [{ panelId: viewer.panelId }] : [])] },
    orderBy: { sort: "asc" },
    include: {
      category: true,
      variants: { where: { active: true }, orderBy: { price: "asc" } },
      _count: { select: { variants: true } },
    },
  });
  const products = needle ? allProducts.filter((p) => (p.name + " " + (p.tagline || "")).toLowerCase().includes(needle)) : allProducts;
  const soldRows = await prisma.premiumOrder.groupBy({ by: ["variantId"], where: { status: { not: "CANCELED" } }, _count: true });
  const variantRows = await prisma.premiumVariant.findMany({ select: { id: true, productId: true } });
  const variantProduct = new Map(variantRows.map((v) => [v.id, v.productId]));
  const soldMap = new Map<number, number>();
  for (const r of soldRows) {
    const pid = variantProduct.get(r.variantId);
    if (pid) soldMap.set(pid, (soldMap.get(pid) || 0) + (typeof r._count === "number" ? r._count : 0));
  }
  const stockByVariant = await prisma.premiumStock.groupBy({
    by: ["variantId"],
    where: { status: "AVAILABLE" },
    _count: true,
  });
  const stockMap = new Map(stockByVariant.map((x) => [x.variantId, x._count]));

  return (
    <>
      <h1 className="text-3xl font-extrabold text-slate-900">Tài khoản Premium</h1>
      <p className="text-slate-500 mt-2 mb-6">Gói có kho được giao ngay tự động sau thanh toán. Gói nâng cấp chính chủ được xử lý tay trên chính tài khoản của bạn, bảo hành rõ ràng từng gói.</p>
      <form method="get" className="flex gap-2 mb-6 max-w-lg">
        {catId && <input type="hidden" name="cat" value={catId} />}
        <input className="inp flex-1" name="q" placeholder="Tìm sản phẩm... (vd: Netflix, Spotify)" defaultValue={q || ""} />
        <button className="btn-primary shrink-0">Tìm</button>
      </form>
      <div className="flex flex-wrap gap-2 mb-8">
        <Link href={base} className={`btn-sm rounded-full font-semibold py-2 px-4 ${!catId ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Tất cả</Link>
        {cats.map((c) => (
          <Link key={c.id} href={`${base}?cat=${c.id}`} className={`btn-sm rounded-full font-semibold py-2 px-4 ${catId === c.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{c.name}</Link>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {products.map((p) => {
          const from = p.variants[0];
          const totalStock = p.variants.reduce((sum, v) => sum + (stockMap.get(v.id) || 0), 0);
          return (
            <Link key={p.id} href={`${base}/${p.slug}`} className="card p-6 hover:shadow-lg transition group flex flex-col">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${p.fulfillment === "AUTO_STOCK" ? "bg-emerald-50 text-emerald-700" : p.fulfillment === "API" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`}>
                  {p.fulfillment === "AUTO_STOCK" ? (totalStock > 0 ? `Giao ngay · còn ${totalStock}` : "Giao tay (hết kho)") : p.fulfillment === "API" ? "Giao tự động qua đối tác" : "Nâng cấp chính chủ"}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <div className="font-bold text-lg text-slate-900 group-hover:text-brand-700">{p.name}</div>
                {(soldMap.get(p.id) || 0) >= 3 && <span className="text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">Bán chạy</span>}
              </div>
              <div className="text-xs text-slate-400">{p.category.name} · {p.variants.length} gói{(soldMap.get(p.id) || 0) > 0 ? ` · Đã bán ${soldMap.get(p.id)}` : ""}</div>
              <p className="text-sm text-slate-500 mt-2 line-clamp-2 flex-1">{p.tagline}</p>
              {from && <div className="mt-4">Chỉ từ <span className="font-extrabold text-brand-700 text-lg">{vnd(from.price)}</span></div>}
            </Link>
          );
        })}
        {products.length === 0 && <p className="text-slate-400">Chưa có sản phẩm nào.</p>}
      </div>
    </>
  );
}

/** Nội dung chi tiết sản phẩm Premium dùng chung — base quyết định link quay lại,
 *  link sản phẩm liên quan và nơi form mua trả về khi có lỗi. */
export async function PremiumDetailView({ slug, searchParams, base }: { slug: string; searchParams: { msg?: string; err?: string }; base: string }) {
  const product = await prisma.premiumProduct.findUnique({
    where: { slug },
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
    <>
      <Link href={base} className="text-sm font-medium text-brand-600">← Tất cả sản phẩm Premium</Link>
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
              backBase={base}
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
              <Link key={p.id} href={`${base}/${p.slug}`} className="card p-5 hover:shadow-lg transition group">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                <div className="font-bold text-slate-900 mt-3.5 group-hover:text-brand-700">{p.name}</div>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.tagline}</p>
                {p.variants[0] && <div className="mt-3 text-sm">Chỉ từ <span className="font-extrabold text-brand-700">{vnd(p.variants[0].price)}</span></div>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
