import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { PremiumBuyForm } from "@/components/client";
import { Flash, I } from "@/components/ui";
import { buyPremiumAction, submitPremiumReviewAction, toggleReviewHelpfulAction } from "@/app/actions/user";
import { vnd, parsePremiumFields, productImages } from "@/lib/format";
import { ProductGallery } from "@/components/rich-editor";
import { RichText } from "@/components/rich-text";
import { PremiumCard, Stars, type PremiumCardData } from "@/components/premium-card";
import { PremiumReviewForm, HelpfulButton } from "@/components/premium-review-form";
import { PremiumGrid } from "@/components/premium-grid";

/** Dựng dữ liệu thẻ cho một nhóm sản phẩm: khoảng giá gói, tổng đã bán, còn kho. */
async function buildCardData(
  products: { id: number; slug: string; name: string; color: string; images: string | null; imageUrl: string | null; fulfillment: string; variants: { id: number; price: number }[] }[],
): Promise<PremiumCardData[]> {
  const variantProduct = new Map<number, number>();
  for (const p of products) for (const v of p.variants) variantProduct.set(v.id, p.id);
  const vids = Array.from(variantProduct.keys());
  const [soldRows, stockRows] = vids.length
    ? await Promise.all([
        prisma.premiumOrder.groupBy({ by: ["variantId"], where: { variantId: { in: vids }, status: { not: "CANCELED" } }, _count: true }),
        prisma.premiumStock.groupBy({ by: ["variantId"], where: { variantId: { in: vids }, status: "AVAILABLE" }, _count: true }),
      ])
    : [[], []];
  const soldMap = new Map<number, number>();
  for (const r of soldRows) {
    const pid = variantProduct.get(r.variantId);
    if (pid) soldMap.set(pid, (soldMap.get(pid) || 0) + (typeof r._count === "number" ? r._count : 0));
  }
  const stockByProduct = new Map<number, number>();
  for (const r of stockRows) {
    const pid = variantProduct.get(r.variantId);
    if (pid) stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + (typeof r._count === "number" ? r._count : 0));
  }
  const reviewRows = products.length
    ? await prisma.premiumReview.groupBy({ by: ["productId"], where: { productId: { in: products.map((p) => p.id) } }, _avg: { rating: true }, _count: true })
    : [];
  const reviewMap = new Map(reviewRows.map((r) => [r.productId, { avg: r._avg.rating || 0, count: typeof r._count === "number" ? r._count : 0 }]));
  return products.map((p) => {
    const prices = p.variants.map((v) => v.price).filter((x) => x > 0);
    const rv = reviewMap.get(p.id);
    return {
      slug: p.slug,
      name: p.name,
      image: productImages(p.images, p.imageUrl)[0] || null,
      color: p.color,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      sold: soldMap.get(p.id) || 0,
      instant: p.fulfillment === "AUTO_STOCK",
      hasStock: (stockByProduct.get(p.id) || 0) > 0,
      rating: rv?.avg || 0,
      reviewCount: rv?.count || 0,
    };
  });
}

/** Che tên người đánh giá kiểu shopkey: "admin" -> "ad***n". */
function maskName(u: string): string {
  if (!u) return "***";
  if (u.length <= 3) return u.charAt(0) + "***";
  return u.slice(0, 2) + "***" + u.slice(-1);
}

const SORTS = [
  { key: "mac-dinh", label: "Mặc định" },
  { key: "ban-chay", label: "Bán chạy" },
  { key: "gia-tang", label: "Giá tăng dần" },
  { key: "gia-giam", label: "Giá giảm dần" },
  { key: "moi-nhat", label: "Mới nhất" },
  { key: "ten-az", label: "Tên A-Z" },
  { key: "ten-za", label: "Tên Z-A" },
];

/** Trang TẤT CẢ sản phẩm Premium dùng CHUNG cho trang công khai (/premium) và
 *  trang trong khu khách (/dashboard/premium) — bố cục theo shopkey: hero
 *  gradient + breadcrumb, thẻ lọc (tìm kiếm / danh mục / mức giá / sắp xếp),
 *  lưới thẻ 4 cột và nút "Tải thêm sản phẩm". base = gốc link nội bộ. */
export async function PremiumShopView({ cat, q, sort, from, to, base }: { cat?: string; q?: string; sort?: string; from?: string; to?: string; base: string }) {
  const session = await getSession();
  const viewer = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { panelId: true } }) : null;
  const cats = await prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  const catId = cat ? parseInt(cat) : undefined;
  const needle = (q || "").trim().toLowerCase();
  const allProducts = await prisma.premiumProduct.findMany({
    where: { active: true, ...(catId ? { categoryId: catId } : {}), OR: [{ panelId: null }, ...(viewer?.panelId ? [{ panelId: viewer.panelId }] : [])] },
    orderBy: { sort: "asc" },
    include: { category: true, variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, price: true } } },
  });
  let items = await buildCardData(allProducts);
  const bySlug = new Map(allProducts.map((p) => [p.slug, p]));
  if (needle) items = items.filter((it) => (it.name + " " + (bySlug.get(it.slug)?.tagline || "")).toLowerCase().includes(needle));
  const priceFrom = parseInt(from || "") || 0;
  const priceTo = parseInt(to || "") || 0;
  if (priceFrom > 0) items = items.filter((it) => it.maxPrice >= priceFrom);
  if (priceTo > 0) items = items.filter((it) => it.minPrice > 0 && it.minPrice <= priceTo);
  const sortKey = SORTS.some((s) => s.key === sort) ? sort : "mac-dinh";
  if (sortKey === "ban-chay") items.sort((a, b) => b.sold - a.sold);
  else if (sortKey === "gia-tang") items.sort((a, b) => (a.minPrice || Number.MAX_SAFE_INTEGER) - (b.minPrice || Number.MAX_SAFE_INTEGER));
  else if (sortKey === "gia-giam") items.sort((a, b) => b.minPrice - a.minPrice);
  else if (sortKey === "moi-nhat") items.sort((a, b) => (bySlug.get(b.slug)?.createdAt.getTime() || 0) - (bySlug.get(a.slug)?.createdAt.getTime() || 0));
  else if (sortKey === "ten-az") items.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  else if (sortKey === "ten-za") items.sort((a, b) => b.name.localeCompare(a.name, "vi"));
  const homeHref = base.startsWith("/dashboard") ? "/dashboard" : "/";

  return (
    <>
      <div className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 px-6 py-6 text-white sm:px-8">
        <div className="text-[13px] font-medium text-white/75">
          <Link href={homeHref} className="hover:text-white">Trang chủ</Link>
          <span className="mx-1.5">›</span>
          <span className="text-white">Sản phẩm</span>
        </div>
        <h1 className="mt-3 text-3xl font-extrabold">Tất cả sản phẩm</h1>
        <p className="mt-1.5 max-w-xl text-sm text-white/85">Tài khoản premium chính hãng — giao ngay tự động từ kho, bảo hành rõ ràng theo từng gói.</p>
      </div>

      <form method="get" action={base} className="card mt-6 grid grid-cols-2 items-end gap-4 p-5 lg:grid-cols-[1.15fr_1fr_1.25fr_1fr_auto]">
        <div>
          <label className="lbl">Tìm kiếm</label>
          <input className="inp" name="q" placeholder="Tìm sản phẩm..." defaultValue={q || ""} />
        </div>
        <div>
          <label className="lbl">Danh mục</label>
          <select className="inp" name="cat" defaultValue={catId ? String(catId) : ""}>
            <option value="">Tất cả</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Mức giá</label>
          <div className="flex items-center gap-2">
            <input className="inp" name="from" type="number" min={0} placeholder="Từ" defaultValue={from || ""} />
            <span className="text-slate-400">—</span>
            <input className="inp" name="to" type="number" min={0} placeholder="Đến" defaultValue={to || ""} />
          </div>
        </div>
        <div>
          <label className="lbl">Sắp xếp</label>
          <select className="inp" name="sort" defaultValue={sortKey}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <button className="btn flex-1 !bg-slate-900 !px-5 font-bold text-white hover:!bg-slate-700 lg:flex-none">Lọc</button>
          <Link href={base} title="Đặt lại bộ lọc" className="btn-ghost !px-3" aria-label="Đặt lại bộ lọc">{I.refresh}</Link>
        </div>
      </form>

      <p className="mb-4 mt-8 text-sm text-slate-500"><b className="text-slate-800">{items.length}</b> sản phẩm</p>
      <PremiumGrid items={items} base={base} />
    </>
  );
}

/** Khối gập/mở ở cột trái trang chi tiết (Chi tiết gói / Giới thiệu / ...). */
function DetailSection({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="card mt-6" {...(open ? { open: true } : {})}>
      <summary className="cursor-pointer list-none px-6 py-4 text-sm font-extrabold uppercase tracking-wider text-slate-900 [&::-webkit-details-marker]:hidden">{title}</summary>
      <div className="border-t border-slate-100 px-6 py-5">{children}</div>
    </details>
  );
}

/** Trang CHI TIẾT sản phẩm Premium dùng chung — bố cục theo shopkey: hero
 *  gradient (breadcrumb, ảnh trái, thông tin phải), dưới là cột trái "Chọn gói
 *  sản phẩm" + cột phải hộp đặt hàng dính, các khối gập Chi tiết gói / Giới
 *  thiệu, rồi Sản phẩm liên quan cùng định dạng thẻ. */
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
  const sold = await prisma.premiumOrder.count({ where: { variantId: { in: product.variants.map((v) => v.id) }, status: { not: "CANCELED" } } });
  const maxQty = parseInt((await getSettings()).premium_max_qty) || 50;
  const variantIds = product.variants.map((v) => v.id);
  const [reviewAgg, reviewDist, reviewList] = await Promise.all([
    prisma.premiumReview.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true }),
    prisma.premiumReview.groupBy({ by: ["rating"], where: { productId: product.id }, _count: true }),
    prisma.premiumReview.findMany({ where: { productId: product.id }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { username: true } } } }),
  ]);
  const reviewAvg = reviewAgg._avg.rating || 0;
  const reviewCount = reviewAgg._count || 0;
  const distMap = new Map(reviewDist.map((r) => [r.rating, typeof r._count === "number" ? r._count : 0]));
  const myPurchase = session
    ? await prisma.premiumOrder.findFirst({ where: { userId: session.id, variantId: { in: variantIds }, status: { notIn: ["CANCELED", "REFUNDED"] } }, select: { id: true } })
    : null;
  const myReview = session
    ? await prisma.premiumReview.findUnique({ where: { productId_userId: { productId: product.id, userId: session.id } }, select: { rating: true, content: true } })
    : null;
  const reviewerIds = Array.from(new Set(reviewList.map((r) => r.userId)));
  const reviewerOrders = reviewerIds.length
    ? await prisma.premiumOrder.findMany({ where: { userId: { in: reviewerIds }, variantId: { in: variantIds }, status: { notIn: ["CANCELED", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, select: { userId: true, variant: { select: { name: true } } } })
    : [];
  const variantByUser = new Map<number, string>();
  for (const o of reviewerOrders) if (!variantByUser.has(o.userId)) variantByUser.set(o.userId, o.variant.name);
  const helpfulRows = reviewList.length
    ? await prisma.premiumReviewHelpful.groupBy({ by: ["reviewId"], where: { reviewId: { in: reviewList.map((r) => r.id) } }, _count: true })
    : [];
  const helpfulMap = new Map(helpfulRows.map((r) => [r.reviewId, typeof r._count === "number" ? r._count : 0]));
  const myHelpful = session && reviewList.length
    ? new Set((await prisma.premiumReviewHelpful.findMany({ where: { userId: session.id, reviewId: { in: reviewList.map((r) => r.id) } }, select: { reviewId: true } })).map((x) => x.reviewId))
    : new Set<number>();
  const relatedRaw = await prisma.premiumProduct.findMany({
    where: { active: true, categoryId: product.categoryId, id: { not: product.id }, OR: [{ panelId: null }, ...(viewer?.panelId ? [{ panelId: viewer.panelId }] : [])] },
    orderBy: { sort: "asc" }, take: 4,
    include: { variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, price: true } } },
  });
  const related = await buildCardData(relatedRaw);
  const infoSections = (
    <>
      {product.description && (
        <DetailSection title="Thông tin sản phẩm" open>
          <RichText value={product.description} className="text-sm leading-relaxed text-slate-600" />
        </DetailSection>
      )}
      <DetailSection title="Chi tiết gói">
        <ul className="space-y-2 text-sm text-slate-600">
          {product.variants.map((v) => (
            <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span><b className="text-slate-800">{v.name}</b> — {v.warrantyDays ? `bảo hành ${v.warrantyDays} ngày` : "không bảo hành"}{product.fulfillment === "AUTO_STOCK" ? (stockMap.get(v.id) ? ` · còn ${stockMap.get(v.id)} trong kho` : " · hết kho, giao tay") : ""}</span>
              <span className="font-bold text-rose-600">{vnd(v.price)}</span>
            </li>
          ))}
        </ul>
      </DetailSection>
      {product.warrantyInfo && (
        <DetailSection title="Thông tin bảo hành">
          <RichText value={product.warrantyInfo} className="text-sm leading-relaxed text-slate-600" />
        </DetailSection>
      )}
      {product.usageGuide && (
        <DetailSection title="Hướng dẫn sử dụng">
          <RichText value={product.usageGuide} className="text-sm leading-relaxed text-slate-600" />
        </DetailSection>
      )}
    </>
  );
  const reviewsCard = (
    <div className="card p-6">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#f59e0b"><path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" /></svg>
        <h2 className="text-base font-extrabold text-slate-900">Đánh giá sản phẩm</h2>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{reviewCount} đánh giá</span>
      </div>
      <div className="mt-5 text-center">
        <div className="text-[40px] font-black leading-none text-slate-900">{reviewCount > 0 ? reviewAvg.toFixed(1) : "—"}</div>
        <div className="mt-2.5 flex justify-center"><Stars value={reviewAvg} className="h-5 w-5" /></div>
        <div className="mt-2 text-[13px] text-slate-500">{reviewCount} đánh giá</div>
      </div>
      <div className="mx-auto mt-5 max-w-sm space-y-2">
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="flex items-center gap-2.5 text-[13px] text-slate-600">
            <span className="flex w-8 shrink-0 items-center gap-1 font-semibold">{n}<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#f59e0b"><path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" /></svg></span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-amber-400" style={{ width: `${reviewCount > 0 ? ((distMap.get(n) || 0) / reviewCount) * 100 : 0}%` }} />
            </span>
            <span className="w-5 shrink-0 text-right text-slate-400">{distMap.get(n) || 0}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 border-t border-slate-100 pt-2">
        {reviewList.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Chưa có đánh giá nào cho sản phẩm này.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reviewList.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" /></svg>
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">{maskName(r.user.username)}</div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Đã mua hàng
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Stars value={r.rating} className="h-3.5 w-3.5" />
                  <span className="text-xs text-slate-400">{r.createdAt.toLocaleDateString("vi-VN")}</span>
                </div>
                {variantByUser.get(r.userId) && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 7h15l-1.5 9h-12L6 7z" /><path d="M6 7L5 3H2" /><circle cx="9" cy="20" r="1.6" /><circle cx="17" cy="20" r="1.6" /></svg>
                    {variantByUser.get(r.userId)}
                  </span>
                )}
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{r.content}</p>
                {session ? (
                  <HelpfulButton reviewId={r.id} count={helpfulMap.get(r.id) || 0} marked={myHelpful.has(r.id)} action={toggleReviewHelpfulAction} />
                ) : (
                  <Link href="/login" className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinejoin="round" d="M7 22V11L12.5 2.5c1.6 0 2.7 1.2 2.5 2.8L14.3 9H20a2 2 0 0 1 2 2.4l-1.2 8A2 2 0 0 1 18.8 21H7zm0 0H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3" /></svg>
                    Hữu ích{(helpfulMap.get(r.id) || 0) > 0 ? ` (${helpfulMap.get(r.id)})` : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-100 pt-5">
        <div className="text-sm font-extrabold text-slate-900">{myReview ? "Đánh giá của bạn" : "Viết đánh giá"}</div>
        {session && myPurchase ? (
          <PremiumReviewForm slug={product.slug} returnTo={`${base}/${product.slug}`} action={submitPremiumReviewAction} mine={myReview} />
        ) : session ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Chỉ khách đã mua sản phẩm mới được đánh giá.</p>
        ) : (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Chỉ khách đã mua sản phẩm mới được đánh giá. <Link href="/login" className="font-bold text-brand-700">Đăng nhập</Link></p>
        )}
      </div>
    </div>
  );
  const images = productImages(product.images, product.imageUrl);
  const homeHref = base.startsWith("/dashboard") ? "/dashboard" : "/";
  const fulfillmentTag = product.fulfillment === "AUTO_STOCK" ? "Giao ngay" : product.fulfillment === "API" ? "Giao qua đối tác" : "Nâng cấp chính chủ";

  return (
    <>
      <div className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 px-6 py-6 text-white sm:px-8">
        <div className="text-[13px] font-medium text-white/75">
          <Link href={homeHref} className="hover:text-white">Trang chủ</Link>
          <span className="mx-1.5">›</span>
          <Link href={base} className="hover:text-white">Sản phẩm</Link>
          <span className="mx-1.5">›</span>
          <span className="text-white">{product.name}</span>
        </div>
        <div className="mt-5 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl bg-white/10">
            {images.length > 1 ? (
              <ProductGallery images={images} name={product.name} />
            ) : images.length === 1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} alt={product.name} className="aspect-video max-h-[240px] w-full object-cover" />
            ) : (
              <div className="flex aspect-video max-h-[240px] w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${product.color}, #0ea5e9)` }}>
                <span className="text-7xl font-black text-white/90">{product.name.charAt(0)}</span>
              </div>
            )}
          </div>
          <div>
            <span className="inline-block rounded-full border border-white/40 px-3 py-1 text-xs font-bold text-white">{product.category.name}</span>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight">{product.name}</h1>
            {product.tagline && <p className="mt-2 text-sm leading-relaxed text-white/85">{product.tagline}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {reviewCount > 0 && <span className="inline-flex items-center gap-1.5 font-semibold text-white/95"><Stars value={reviewAvg} /> {reviewAvg.toFixed(1)} ({reviewCount} đánh giá)</span>}
              {sold > 0 && <span className="font-semibold text-white/90">Đã bán {sold.toLocaleString("vi-VN")}</span>}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{fulfillmentTag}</span>
              {session && <Link href="/dashboard/api-docs" className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">API</Link>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6"><Flash msg={searchParams.msg} err={searchParams.err} /></div>

      {session ? (
        <PremiumBuyForm
          layout="split"
          maxQty={maxQty}
          slug={product.slug}
          backBase={base}
          fulfillment={product.fulfillment}
          action={buyPremiumAction}
          fields={parsePremiumFields(product.customFields)}
          note={product.buyNote}
          productImage={images[0] || null}
          productColor={product.color}
          variants={product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, warrantyDays: v.warrantyDays, stock: stockMap.get(v.id) || 0 }))}
          belowVariants={infoSections}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <h2 className="text-lg font-extrabold text-slate-900">Chọn gói sản phẩm</h2>
            <div className="mt-4 space-y-2.5">
              {product.variants.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                  <span className="font-bold text-slate-900">{v.name}</span>
                  <span className="font-extrabold text-rose-600">{vnd(v.price)}</span>
                </div>
              ))}
            </div>
            {infoSections}
          </div>
          <div className="card p-6 text-center lg:col-span-2">
            <p className="mb-4 text-sm text-slate-500">Đăng nhập để mua bằng số dư — nạp tiền bằng chuyển khoản, cộng tự động.</p>
            <Link href="/login" className="btn-primary">Đăng nhập</Link>
            <Link href="/register" className="btn-ghost ml-2">Đăng ký</Link>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3">{reviewsCard}</div>
      </div>

      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-5 text-xl font-extrabold text-slate-900">Sản phẩm liên quan</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {related.map((item) => <PremiumCard key={item.slug} item={item} base={base} />)}
          </div>
        </div>
      )}
    </>
  );
}
