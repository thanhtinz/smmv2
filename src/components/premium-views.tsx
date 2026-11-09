import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { PremiumBuyForm } from "@/components/client";
import { Flash, I } from "@/components/ui";
import { buyPremiumAction } from "@/app/actions/user";
import { parsePremiumFields, productImages } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { RichText } from "@/components/rich-text";
import { ProductGallery } from "@/components/rich-editor";
import { PImg } from "@/components/protected-img";
import { PremiumCard, Stars, type PremiumCardData } from "@/components/premium-card";
import { PremiumGrid } from "@/components/premium-grid";
import { ProductReviews } from "@/components/product-reviews";
import { PillStrip } from "@/components/pill-strip";
import { RecordRecentView } from "@/components/recent";
import { moduleOn } from "@/lib/modules";
import { regularCatalogWhere } from "@/lib/order-scope";
import { getActiveFlashSale, flashAppliesToProduct, applyFlashAmount } from "@/lib/flash";
import { siteBaseUrl } from "@/lib/email-verify";
import { resolveDeliveryType, variantSoldOut, isQtyTracked } from "@/lib/variant-stock";
import { FlashBanner } from "@/components/flash-banner";

/** Dựng dữ liệu thẻ cho một nhóm sản phẩm: khoảng giá gói, tổng đã bán, còn kho. */
async function buildCardData(
  products: { id: number; slug: string; name: string; color: string; images: string | null; imageUrl: string | null; fulfillment: string; customFields?: string | null; variants: { id: number; name?: string; price: number; providerGroup?: string | null; deliveryType?: string | null }[] }[],
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
  const stockByVariant = new Map<number, number>();
  for (const r of stockRows) {
    stockByVariant.set(r.variantId, typeof r._count === "number" ? r._count : 0);
    const pid = variantProduct.get(r.variantId);
    if (pid) stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + (typeof r._count === "number" ? r._count : 0));
  }
  const reviewRows = products.length
    ? await prisma.premiumReview.groupBy({ by: ["productId"], where: { productId: { in: products.map((p) => p.id) } }, _avg: { rating: true }, _count: true })
    : [];
  const reviewMap = new Map(reviewRows.map((r) => [r.productId, { avg: r._avg.rating || 0, count: typeof r._count === "number" ? r._count : 0 }]));
  const flashSale = await getActiveFlashSale("PREMIUM");
  return products.map((p) => {
    const prices = p.variants.map((v) => v.price).filter((x) => x > 0);
    const rv = reviewMap.get(p.id);
    const only = p.variants.length === 1 ? p.variants[0] : null;
    const hasRequiredField = parsePremiumFields(p.customFields).some((f) => f.required);
    const cartVariant = only && !hasRequiredField && !(only.providerGroup || "").startsWith("telegram_")
      ? { id: only.id, name: only.name || p.name, price: only.price, stock: stockByVariant.get(only.id) || 0 }
      : null;
    return {
      productId: p.id,
      cartVariant,
      slug: p.slug,
      name: p.name,
      image: productImages(p.images, p.imageUrl)[0] || null,
      color: p.color,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      sold: soldMap.get(p.id) || 0,
      instant: p.fulfillment === "AUTO_STOCK",
      delivery: p.variants.some((v) => resolveDeliveryType(v.deliveryType, p.fulfillment) === "FAST") ? "FAST" as const : "SLOW" as const,
      manual: p.fulfillment === "MANUAL",
      hasStock: (stockByProduct.get(p.id) || 0) > 0,
      rating: rv?.avg || 0,
      reviewCount: rv?.count || 0,
      flashPct: flashAppliesToProduct(flashSale, p.id) ? flashSale!.percent : 0,
    };
  });
}

/** Dữ liệu thẻ cho trang chủ cửa hàng (tái dùng đúng bộ dựng thẻ của trang danh sách). */
export async function premiumCardsFor(products: Parameters<typeof buildCardData>[0]): Promise<PremiumCardData[]> {
  return buildCardData(products);
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
  const { L, Ld } = await getServerI18n();
  const session = await getSession();
  const cats = await prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  // Pill danh mục chỉ hiện danh mục có ÍT NHẤT 1 sản phẩm thường — danh mục
  // chỉ chứa sản phẩm của các khu riêng (đã lọc khỏi lưới bên dưới) không
  // được dẫn khách tới một lưới trống (cùng quy tắc khối danh mục trang chủ).
  const catWithRegular = await prisma.premiumProduct.groupBy({
    by: ["categoryId"],
    where: { active: true, panelId: null, ...regularCatalogWhere() },
  });
  const pillCatIds = new Set(catWithRegular.map((r) => r.categoryId));
  const pillCats = cats.filter((c) => pillCatIds.has(c.id));
  const catId = cat ? parseInt(cat) : undefined;
  const needle = (q || "").trim().toLowerCase();
  const allProducts = await prisma.premiumProduct.findMany({
    // Sản phẩm của TẤT CẢ các khu riêng (8 nhóm FZR) không hiện ở catalog
    // Premium này (cả lưới lẫn lọc theo danh mục) — regularCatalogWhere.
    where: { active: true, ...(catId ? { categoryId: catId } : {}), panelId: null, ...regularCatalogWhere() },
    orderBy: { sort: "asc" },
    include: { category: true, variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true, providerGroup: true, deliveryType: true } } },
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
  const homeHref = "/";

  return (
    <>
      <div className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-6 text-white sm:px-8">
        <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div>
            <div className="text-[13px] font-medium text-white/75">
              <Link href={homeHref} className="hover:text-white">{L("Trang chủ")}</Link>
              <span className="mx-1 inline-flex -rotate-90 align-middle [&_svg]:h-3.5 [&_svg]:w-3.5">{I.chevron}</span>
              <span className="text-white">{L("Sản phẩm")}</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold">{L("Tất cả sản phẩm")}</h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/85">{L("Tài khoản premium chính hãng — giao ngay tự động từ kho, bảo hành rõ ràng theo từng gói.")}</p>
          </div>
          <div className="w-full lg:justify-self-end">
            <form method="get" action={base} className="flex gap-2">
              <input name="q" defaultValue={q || ""} placeholder={L("Tìm sản phẩm...")} className="h-11 min-w-0 flex-1 rounded-full border-0 bg-white px-4 text-sm text-slate-900 outline-none ring-brand-300 focus:ring-4" />
              <button className="h-11 shrink-0 rounded-full bg-slate-900 px-4 text-sm font-extrabold text-white transition hover:bg-slate-800">{L("Tìm kiếm")}</button>
            </form>
            <div className="mt-3 flex lg:justify-end">
              <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white"><b className="mr-1 text-[13px]">{items.length}</b>{Ld("sản phẩm")}</span>
            </div>
          </div>
        </div>
      </div>

      <form method="get" action={base} className="card mt-6 grid grid-cols-2 items-end gap-4 p-5 lg:grid-cols-[1fr_1.25fr_1fr_auto]">
        <input type="hidden" name="q" value={q || ""} />
        <div className="col-span-2 lg:col-span-full">
          <label className="lbl">{L("Danh mục")}</label>
          {/* Dải pill danh mục — CÙNG dạng với trang chủ (lệnh Tín
              2026-11-08 01:51): pill rounded-full CHỈ CÓ TÊN, không icon,
              không số lượng; đang chọn = nền brand chữ trắng. Radio
              name="cat" như cũ — tham số và logic lọc không đổi, áp dụng
              bằng nút Lọc. Vỏ PillStrip: mobile cuộn ngang có nút chevron
              + vệt mờ gợi ý kéo qua; desktop xuống hàng như cũ. */}
          <PillStrip>
            <label className="cursor-pointer">
              <input type="radio" name="cat" value="" defaultChecked={!catId} className="peer sr-only" />
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white hover:border-brand-300">
                {L("Tất cả")}
              </span>
            </label>
            {pillCats.map((c) => (
              <label key={c.id} className="cursor-pointer">
                <input type="radio" name="cat" value={c.id} defaultChecked={catId === c.id} className="peer sr-only" />
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white hover:border-brand-300">
                  {c.name}
                </span>
              </label>
            ))}
          </PillStrip>
        </div>
        <div>
          <label className="lbl">{L("Mức giá")}</label>
          <div className="flex items-center gap-2">
            <input className="inp" name="from" type="number" min={0} placeholder={L("Từ")} defaultValue={from || ""} />
            <span className="text-slate-400">—</span>
            <input className="inp" name="to" type="number" min={0} placeholder={L("Đến")} defaultValue={to || ""} />
          </div>
        </div>
        <div>
          <label className="lbl">{L("Sắp xếp")}</label>
          <select className="inp" name="sort" defaultValue={sortKey}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{L(s.label)}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <button className="btn flex-1 !bg-slate-900 !px-5 font-bold text-white hover:!bg-slate-700 lg:flex-none">{L("Lọc")}</button>
          <Link href={base} className="btn-ghost inline-flex items-center gap-1.5 !px-3.5 font-semibold"><span className="[&>svg]:h-4 [&>svg]:w-4">{I.refresh}</span>{L("Đặt lại bộ lọc")}</Link>
        </div>
      </form>

      <div className="mt-8">
        <PremiumGrid items={items} base={base} />
      </div>
    </>
  );
}

/** Khối gập/mở ở dải thông tin trang chi tiết (Chi tiết gói / Giới thiệu / ...).
 *  Khoảng cách giữa các khối do cột cha (space-y-6) quản lý. */
function DetailSection({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="card group" {...(open ? { open: true } : {})}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm font-extrabold uppercase tracking-wider text-slate-900 [&::-webkit-details-marker]:hidden"><span>{title}</span><span className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180">{I.chevron}</span></summary>
      <div className="border-t border-slate-100 px-6 py-5">{children}</div>
    </details>
  );
}

/** Trang CHI TIẾT sản phẩm Premium dùng chung — bố cục shopkey (lệnh Tín
 *  2026-11-08 khôi phục, thay bố cục một cột kiểu Telegram của fix5 WS4):
 *  hero gradient 31/69 (gallery trái, thông tin phải), khu chính 73/27 —
 *  cột trái chọn gói → khối gập nội dung → đánh giá, cột phải hộp đặt hàng
 *  ghim dính; sản phẩm liên quan full-width bên dưới. */
export async function PremiumDetailView({ slug, searchParams, base }: { slug: string; searchParams: { msg?: string; err?: string }; base: string }) {
  const { L, Ld, M } = await getServerI18n();
  const product = await prisma.premiumProduct.findUnique({
    where: { slug },
    include: { category: true, variants: { where: { active: true }, orderBy: [{ sort: "asc" }, { price: "asc" }] } },
  });
  if (!product || !product.active) notFound();
  const session = await getSession();
  if (product.panelId != null) notFound();
  const stocks = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE", variantId: { in: product.variants.map((v) => v.id) } }, _count: true });
  const stockMap = new Map(stocks.map((x) => [x.variantId, x._count]));
  const sold = await prisma.premiumOrder.count({ where: { variantId: { in: product.variants.map((v) => v.id) }, status: { not: "CANCELED" } } });
  const maxQty = parseInt((await getSettings()).premium_max_qty) || 50;
  // Mã giảm giá đang hiệu lực cho người xem này — chỉ để form XEM TRƯỚC số tiền
  // giảm trong hộp tóm tắt (đúng tiêu chí checkPromo: scope ALL/PREMIUM, mã của
  // của web mẹ, trong khung thời gian, chưa hết lượt).
  // Server vẫn tính lại và chốt khi đặt đơn.
  const promoPreview = session && (await moduleOn("promo"))
    ? (await prisma.discountCode.findMany({
        where: {
          active: true,
          scope: { in: ["ALL", "PREMIUM"] },
          panelId: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          ],
        },
        select: { code: true, type: true, value: true, maxDiscount: true, minOrder: true, usageLimit: true, usedCount: true },
      }))
        .filter((c) => c.usageLimit === 0 || c.usedCount < c.usageLimit)
        .map((c) => ({ code: c.code, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minOrder: c.minOrder }))
    : [];
  // Flash sale (phạm vi có Premium) của site người xem thuộc về — cùng quy tắc
  // server áp khi đặt đơn (lib/flash): một đợt % cao nhất, productIds rỗng =
  // mọi sản phẩm. Chỉ để form hiển thị giá đã giảm + xem trước dòng giảm.
  const flashSale = await getActiveFlashSale("PREMIUM");
  const flashPct = flashAppliesToProduct(flashSale, product.id) ? flashSale!.percent : 0;
  const variantIds = product.variants.map((v) => v.id);
  const reviewAgg = await prisma.premiumReview.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true });
  const reviewAvg = reviewAgg._avg.rating || 0;
  const reviewCount = reviewAgg._count || 0;
  const relatedRaw = await prisma.premiumProduct.findMany({
    where: { active: true, categoryId: product.categoryId, id: { not: product.id }, panelId: null, ...regularCatalogWhere() },
    orderBy: { sort: "asc" }, take: 4,
    include: { variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true, providerGroup: true, deliveryType: true } } },
  });
  const related = await buildCardData(relatedRaw);
  // Các khối gập nội dung: xếp chồng trong cột trái, ngay dưới danh sách gói
  // (truyền vào form qua belowVariants). Khối đầu (Thông tin sản phẩm) mở sẵn.
  const sectionItems: React.ReactNode[] = [];
  if (product.description) {
    sectionItems.push(
      <DetailSection key="desc" title={L("Thông tin sản phẩm")} open>
        <RichText value={product.description} className="text-sm leading-relaxed text-slate-600" />
      </DetailSection>
    );
  }
  sectionItems.push(
    <DetailSection key="variants" title={L("Chi tiết gói")}>
      <ul className="space-y-2 text-sm text-slate-600">
        {product.variants.map((v) => (
          <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <span><b className="text-slate-800">{v.name}</b> — {v.warrantyDays ? <>{L("bảo hành ")}{v.warrantyDays}{L(" ngày")}</> : L("không bảo hành")}{product.fulfillment === "AUTO_STOCK" ? (stockMap.get(v.id) ? <>{L(" · còn ")}{stockMap.get(v.id)}{L(" trong kho")}</> : L(" · hết kho, giao tay")) : ""}</span>
            <span className="font-bold text-rose-600">{M(v.price)}</span>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
  if (product.warrantyInfo) {
    sectionItems.push(
      <DetailSection key="warranty" title={L("Thông tin bảo hành")}>
        <RichText value={product.warrantyInfo} className="text-sm leading-relaxed text-slate-600" />
      </DetailSection>
    );
  }
  if (product.usageGuide) {
    sectionItems.push(
      <DetailSection key="usage" title={L("Hướng dẫn sử dụng")}>
        <RichText value={product.usageGuide} className="text-sm leading-relaxed text-slate-600" />
      </DetailSection>
    );
  }
  const infoSections = <div className="space-y-6">{sectionItems}</div>;
  const reviewsCard = (
    <ProductReviews productId={product.id} slug={product.slug} userId={session?.id ?? null} returnTo={`${base}/${product.slug}`} />
  );
  const images = productImages(product.images, product.imageUrl);
  const homeHref = "/";
  // Dữ liệu có cấu trúc (SEO đợt 2026-11-08) — CHỈ ở trang chi tiết công
  // khai (/premium/<slug>): Product (giá = gói rẻ nhất sau giảm flash như
  // giá đang hiển thị, còn hàng theo đúng logic hết hàng của gói, điểm
  // đánh giá CHỈ khi sản phẩm thật có đánh giá) + BreadcrumbList khớp
  // đúng breadcrumb đang hiển thị (Trang chủ -> Sản phẩm -> tên).
  const seoLd = base === "/premium" ? (() => {
    const sb = (() => { try { return siteBaseUrl(); } catch { return ""; } })();
    const abs = (u: string) => (u.startsWith("http") ? u : sb + u);
    const cheapest = product.variants.length ? Math.min(...product.variants.map((v) => v.price)) : 0;
    const price = flashPct > 0 ? applyFlashAmount(cheapest, flashPct) : cheapest;
    const anyInStock = product.variants.some((v) => !variantSoldOut(v, product.fulfillment));
    const plain = (html: string | null) => (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const prod: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      ...(plain(product.tagline || product.description) ? { description: plain(product.tagline || product.description).slice(0, 300) } : {}),
      ...(images[0] ? { image: abs(images[0]) } : {}),
      offers: {
        "@type": "Offer",
        ...(sb ? { url: `${sb}/premium/${product.slug}` } : {}),
        priceCurrency: "VND",
        price,
        availability: anyInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
      ...(reviewAgg._count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Math.round(reviewAvg * 10) / 10, reviewCount: reviewAgg._count } } : {}),
    };
    const crumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: L("Trang chủ"), item: sb + "/" },
        { "@type": "ListItem", position: 2, name: L("Sản phẩm"), item: sb + "/premium" },
        { "@type": "ListItem", position: 3, name: product.name, item: `${sb}/premium/${product.slug}` },
      ],
    };
    return [prod, crumbs];
  })() : null;
  const fulfillmentTag = product.fulfillment === "AUTO_STOCK" ? L("Giao ngay") : product.fulfillment === "API" ? L("Giao qua đối tác") : L("Nâng cấp chính chủ");
  const prices = product.variants.map((v) => v.price).filter((x) => x > 0);

  return (
    <>
      {seoLd?.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      ))}
      <RecordRecentView item={{ productId: product.id, slug: product.slug, name: product.name, price: prices.length ? Math.min(...prices) : 0, image: images[0] || null }} />
      <div className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-6 text-white sm:px-8">
        <div className="text-[13px] font-medium text-white/75">
          <Link href={homeHref} className="hover:text-white">{L("Trang chủ")}</Link>
          <span className="mx-1 inline-flex -rotate-90 align-middle [&_svg]:h-3.5 [&_svg]:w-3.5">{I.chevron}</span>
          <Link href={base} className="hover:text-white">{L("Sản phẩm")}</Link>
          <span className="mx-1 inline-flex -rotate-90 align-middle [&_svg]:h-3.5 [&_svg]:w-3.5">{I.chevron}</span>
          <span className="text-white">{product.name}</span>
        </div>
        <div className="mt-5 grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,31fr)_minmax(0,69fr)]">
          <div className="overflow-hidden rounded-2xl bg-white/10">
            {images.length > 1 ? (
              <ProductGallery images={images} name={product.name} />
            ) : images.length === 1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <PImg src={images[0]} alt={product.name} className="aspect-video max-h-[240px] w-full select-none object-cover" />
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
            {prices.length > 0 && (
              <div className="mt-4 text-2xl font-black text-white">
                {Math.min(...prices) !== Math.max(...prices) ? <>{M(Math.min(...prices))} – {M(Math.max(...prices))}</> : M(prices[0])}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {reviewCount > 0 && <span className="inline-flex items-center gap-1.5 font-semibold text-white/95"><Stars value={reviewAvg} /> {reviewAvg.toFixed(1)} ({reviewCount}{L(" đánh giá")})</span>}
              {sold > 0 && <span className="font-semibold text-white/90">{L("Đã bán ")}{sold.toLocaleString("vi-VN")}</span>}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{fulfillmentTag}</span>
              {flashPct > 0 && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-extrabold text-white">-{flashPct}%</span>}
              {session && <Link href="/dashboard/api-docs" className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">API</Link>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6"><Flash msg={searchParams.msg} err={searchParams.err} /></div>

      <FlashBanner kind="PREMIUM" />

      {/* Khu chính theo shopkey: 2 cột ~73/27 — cột trái lần lượt chọn gói →
          khối gập → đánh giá; cột phải CHỈ hộp đặt hàng/đăng nhập, ghim dính
          (sticky) trong toàn bộ khu. Nhánh đã đăng nhập: form mua dùng
          lg:contents để các phần của form tham gia thẳng vào lưới này. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,73fr)_minmax(0,27fr)] lg:items-start lg:gap-x-5 lg:gap-y-8">
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
            variants={product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, warrantyDays: v.warrantyDays, stock: stockMap.get(v.id) || 0, delivery: resolveDeliveryType(v.deliveryType, product.fulfillment), soldOut: variantSoldOut(v, product.fulfillment), stockQty: isQtyTracked(product.fulfillment, v.stockQty) ? v.stockQty : null }))}
            belowVariants={infoSections}
            promos={promoPreview}
            flashPct={flashPct}
            cartProduct={{ id: product.id, name: product.name, groups: Object.fromEntries(product.variants.map((v) => [v.id, v.providerGroup ?? null])) }}
          />
        ) : (
          <>
            <div className="lg:col-start-1">
              <h2 className="text-lg font-extrabold text-slate-900">{L("Chọn gói sản phẩm")}</h2>
              <div className="mt-4 space-y-2.5">
                {product.variants.map((v) => {
                  const soldOut = variantSoldOut(v, product.fulfillment);
                  const delivery = resolveDeliveryType(v.deliveryType, product.fulfillment);
                  return (
                    <div key={v.id} className={`flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 px-4 py-3.5 ${soldOut ? "bg-slate-50 opacity-70" : "bg-white"}`}>
                      <span className="min-w-0">
                        <span className="block break-words font-bold text-slate-900">{v.name}</span>
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold [&>svg]:h-3 [&>svg]:w-3 ${delivery === "FAST" ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                          {delivery === "FAST"
                            ? I.truck
                            : <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>}
                          {delivery === "FAST" ? L("Giao nhanh") : L("Giao chậm")}
                        </span>
                      </span>
                      {soldOut
                        ? <span className="shrink-0 font-extrabold text-rose-600">{L("Hết hàng")}</span>
                        : <span className="shrink-0 font-extrabold text-rose-600">{M(v.price)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="lg:col-start-1">{infoSections}</div>
            <div className="card p-6 text-center lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-24">
              <p className="mb-4 text-sm text-slate-500">{L("Đăng nhập để mua bằng số dư — nạp tiền bằng chuyển khoản, cộng tự động.")}</p>
              <Link href="/login" className="btn-primary">{L("Đăng nhập")}</Link>
              <Link href="/register" className="btn-ghost ml-2">{L("Đăng ký")}</Link>
            </div>
          </>
        )}
        <div className="order-4 lg:col-start-1">{reviewsCard}</div>
      </div>

      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-5 text-xl font-extrabold text-slate-900">{L("Sản phẩm liên quan")}</h2>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto py-1 -my-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5 lg:grid lg:grid-cols-3 lg:overflow-visible xl:grid-cols-4">
            {related.map((item) => <PremiumCard key={item.slug} item={item} base={base} className="w-[72%] shrink-0 snap-start sm:w-[54%] md:w-[44%] lg:w-auto" />)}
          </div>
        </div>
      )}
    </>
  );
}
