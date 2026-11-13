import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { PublicFrame } from "@/components/public-frame";
import { HomeModal } from "@/components/gates";
import { getServerI18n } from "@/lib/lang-server";
import { premiumCardsFor } from "@/components/premium-views";
import { HeroSlider, HomeShop, type HomeCard, type HomeCat, type HomeSlide } from "@/components/home-shop";
import { HomeStripRow, type StripTile } from "@/components/home-strip";
import { HomeFlashSale } from "@/components/home-flash";
import { getActiveFlashSale } from "@/lib/flash";
import { type HomeGift } from "@/components/home-gifts";
import { type HomeTopup } from "@/components/home-topups";
import { regularCatalogWhere } from "@/lib/order-scope";
import { productImages } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Trang chủ = CỬA HÀNG Premium theo cấu trúc shopkey (lệnh Tín 2026-11-07):
 *  slider hero → khối danh mục → Sản phẩm nổi bật → Sản phẩm bán chạy → Đã xem
 *  gần đây. Trang tổng quan khách đã bỏ hẳn — trang chủ là nhà của site, /dashboard
 *  chỉ còn chuyển hướng về đây. Màu theo hệ theme chung (sáng mặc định / tối khi
 *  khách bật), không còn da đen riêng của storefront hay tàn dư landing nào. */
export default async function HomePage() {
  const s = await getSettings();
  const { L, Ld, lang } = await getServerI18n();
  const user = await getCurrentUser().catch(() => null);
  const premiumOff = s.module_premium === "0";
  // Dải icon lối tắt dưới hero (lệnh Tín 2026-11-08 21:08): ẩn/hiện từng ô
  // THEO ĐÚNG điều kiện của buildCustomerNav để dải và menu khách không bao
  // giờ lệch nhau — 2 ô Telegram theo telegram_enabled (như nhóm Telegram);
  // Steam / Game Key / Gift Card / Top-Up luôn hiện như các nhóm menu tương
  // ứng (menu luôn hiện vô điều kiện). Ô "Tất cả sản phẩm" đã BỎ khỏi dải
  // theo lệnh Tín 2026-11-08 21:42; ô "Mạng xã hội" (SMM) đã GỠ theo lệnh
  // Tín 2026-11-12 (web tách thành Digital Shop thuần).
  const stripTiles: StripTile[] = [
    { href: "/dashboard/steam/top-up", label: L("Steam Top-Up"), img: "/home-strip/steam-topup.jpg" },
    { href: "/dashboard/steam/gift-games", label: L("Steam Gift"), img: "/home-strip/steam-gift.jpg" },
    ...(s.telegram_enabled !== "0"
      ? [
          { href: "/dashboard/telegram?tab=stars", label: L("Telegram Stars"), img: "/home-strip/telegram-stars.jpg" },
          { href: "/dashboard/telegram?tab=premium", label: L("Telegram Premium"), img: "/home-strip/telegram-premium.jpg" },
        ]
      : []),
    { href: "/dashboard/game-key", label: L("Game Key"), img: "/home-strip/game-key.jpg" },
    { href: "/dashboard/gift-card", label: L("Gift Card"), img: "/home-strip/gift-card.jpg" },
    { href: "/dashboard/top-up", label: L("Top-Up Game"), img: "/home-strip/top-up.jpg" },
  ];
  const homeModal = s.home_modal_enabled === "1" && s.home_modal_content?.trim() ? s.home_modal_content : null;

  let cats: HomeCat[] = [];
  let all: HomeCard[] = [];
  let best: HomeCard[] = [];
  let slides: HomeSlide[] = [];
  let gifts: HomeGift[] = [];
  let topups: HomeTopup[] = [];
  let flash: { name: string; percent: number; endsAt: string; items: HomeCard[] } | null = null;

  if (!premiumOff) {
    const [catRows, products] = await Promise.all([
      prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
      prisma.premiumProduct.findMany({
        // Sản phẩm của TẤT CẢ các khu riêng (8 nhóm FZR) — không lẫn vào
        // các mục Premium của trang chủ (nổi bật / bán chạy / đã xem /
        // danh mục). Mục Steam Gift Games riêng bên dưới là ngoại lệ có
        // chủ đích (khu riêng của Steam trên trang chủ, lệnh fix9).
        where: { active: true, panelId: null, ...regularCatalogWhere() },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true, providerGroup: true, deliveryType: true } } },
      }),
    ]);
    // Mục Steam Gift Games riêng: tối đa 15 game mới nhất còn bán, giá =
    // giá gói gift thấp nhất, sao = điểm đánh giá thật của sản phẩm.
    const giftRows = await prisma.premiumProduct.findMany({
      where: { active: true, panelId: null, variants: { some: { providerGroup: "steam_gift", active: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 15,
      select: {
        id: true, name: true, images: true, imageUrl: true,
        variants: { where: { providerGroup: "steam_gift", active: true }, select: { price: true } },
      },
    });
    const giftReviewRows = giftRows.length
      ? await prisma.premiumReview.groupBy({ by: ["productId"], where: { productId: { in: giftRows.map((p) => p.id) } }, _avg: { rating: true }, _count: true })
      : [];
    const giftReviewMap = new Map(giftReviewRows.map((r) => [r.productId, { avg: r._avg.rating || 0, count: typeof r._count === "number" ? r._count : 0 }]));
    gifts = giftRows
      .filter((p) => p.variants.length > 0)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        image: productImages(p.images, p.imageUrl)[0] || null,
        price: Math.min(...p.variants.map((v) => v.price)),
        rating: giftReviewMap.get(p.id)?.avg || 0,
        reviewCount: giftReviewMap.get(p.id)?.count || 0,
      }));
    // Mục Top-Up Game riêng (lệnh Tín 2026-11-12 21:01): pool = sản phẩm
    // nhóm topups đang bán (đúng điều kiện nhận diện của trang danh sách
    // Top-Up), sắp BÁN CHẠY NHẤT trước, tối đa 50 game. Số "Đã bán" và
    // điểm đánh giá gộp bằng ĐÚNG định nghĩa của buildCardData (đơn
    // PremiumOrder khác CANCELED gộp theo variant; review gộp theo
    // product) — 2 truy vấn groupBy cho cả pool, không N+1 — để số trên
    // ô game khớp tuyệt đối số trên thẻ sản phẩm của cùng game đó.
    const topupRows = await prisma.premiumProduct.findMany({
      where: { active: true, panelId: null, variants: { some: { providerGroup: "topups", active: true } } },
      select: {
        id: true, name: true, images: true, imageUrl: true, color: true,
        variants: { where: { providerGroup: "topups", active: true }, select: { id: true } },
      },
    });
    if (topupRows.length) {
      const variantProduct = new Map<number, number>();
      for (const p of topupRows) for (const v of p.variants) variantProduct.set(v.id, p.id);
      const vids = Array.from(variantProduct.keys());
      const [soldRows, reviewRows] = await Promise.all([
        vids.length
          ? prisma.premiumOrder.groupBy({ by: ["variantId"], where: { variantId: { in: vids }, status: { not: "CANCELED" } }, _count: true })
          : Promise.resolve([] as { variantId: number; _count: number }[]),
        prisma.premiumReview.groupBy({ by: ["productId"], where: { productId: { in: topupRows.map((p) => p.id) } }, _avg: { rating: true }, _count: true }),
      ]);
      const soldMap = new Map<number, number>();
      for (const r of soldRows) {
        const pid = variantProduct.get(r.variantId);
        if (pid) soldMap.set(pid, (soldMap.get(pid) || 0) + (typeof r._count === "number" ? r._count : 0));
      }
      const reviewMap = new Map(reviewRows.map((r) => [r.productId, { avg: r._avg.rating || 0, count: typeof r._count === "number" ? r._count : 0 }]));
      topups = topupRows
        .map((p) => ({
          productId: p.id,
          name: p.name,
          image: productImages(p.images, p.imageUrl)[0] || null,
          color: p.color,
          sold: soldMap.get(p.id) || 0,
          rating: reviewMap.get(p.id)?.avg || 0,
          reviewCount: reviewMap.get(p.id)?.count || 0,
        }))
        .sort((a, b) => b.sold - a.sold || b.productId - a.productId)
        .slice(0, 50);
    }
    const cards = await premiumCardsFor(products as any);
    all = (products as any[]).map((p, i) => ({ ...cards[i], categoryId: p.categoryId }));
    // Khung Flash Sale trang chủ (lệnh Tín 2026-11-12): chỉ dựng khi có đợt
    // phạm vi PREMIUM/ALL đang chạy (getActiveFlashSale đã kẹp trần %) VÀ có
    // sản phẩm catalog thường THẬT SỰ được giảm — flashPct trên thẻ do chính
    // buildCardData tính từ cùng đợt đó (flashAppliesToProduct), minPrice > 0
    // mới có giá để giảm. Xếp đã bán giảm dần, tối đa 10 thẻ.
    const flashSale = await getActiveFlashSale("PREMIUM");
    if (flashSale) {
      const flashItems = [...all].filter((c) => c.flashPct > 0 && c.minPrice > 0).sort((a, b) => b.sold - a.sold).slice(0, 10);
      if (flashItems.length > 0) flash = { name: flashSale.name, percent: flashSale.percent, endsAt: flashSale.endsAt.toISOString(), items: flashItems };
    }
    // Bán chạy: xếp theo tổng đã bán thật (PremiumOrder); chưa có đơn nào thì
    // lấy các sản phẩm mới nhất để mục không trống.
    const soldRanked = [...all].filter((c) => c.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 8);
    best = soldRanked.length > 0 ? soldRanked : all.slice(0, 8);
    // Khối danh mục: chỉ danh mục có sản phẩm thật; ảnh/màu lấy từ sản phẩm đầu.
    cats = (catRows as any[])
      .map((c) => {
        const first = all.find((x) => x.categoryId === c.id);
        return first ? { id: c.id, name: c.name, color: first.color, image: first.image, count: all.filter((x) => x.categoryId === c.id).length } : null;
      })
      .filter((x): x is HomeCat => !!x);
    // Slide hero từ dữ liệu thật: slide mở đầu của cửa hàng + tối đa 3 danh mục.
    const firstImage = all.find((c) => c.image)?.image || null;
    slides = [
      { title: L(s.site_name || ""), subtitle: L(s.site_tagline || ""), href: "/premium", cta: L("Xem tất cả"), image: firstImage, color: "#1d4ed8" },
      ...cats
        .filter((c) => c.image)
        .concat(cats.filter((c) => !c.image))
        .slice(0, 3)
        .map((c) => ({
          title: c.name,
          subtitle: `${all.filter((x) => x.categoryId === c.id).length} ${Ld("sản phẩm")}`,
          href: `/premium?cat=${c.id}`,
          cta: L("Mua ngay"),
          image: c.image,
          color: c.color,
        })),
    ];
    // Banner admin (lệnh Tín 2026-11-08 21:46): khi admin đã tải banner lên
    // thì hero chạy BANNER THẬT thay slide tự tạo — chỉ banner đúng ngôn ngữ
    // khách đang chọn (lang đã resolve vi/en); ngôn ngữ đó chưa có banner
    // thì tạm dùng bộ banner của ngôn ngữ còn lại để hero không bao giờ trống.
    const bannerRows = await prisma.homeBanner.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { id: "asc" }] });
    if (bannerRows.length) {
      const mine = bannerRows.filter((b) => b.lang === lang);
      const chosen = mine.length ? mine : bannerRows;
      slides = chosen.map((b) => ({ title: "", subtitle: "", href: b.href || "", cta: "", image: b.image, color: "#1d4ed8", bare: true }));
    }
  }

  return (
    <PublicFrame>
      {homeModal && user ? <HomeModal content={homeModal} /> : null}
      {premiumOff ? (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-4 pt-5 sm:pt-6">
          <HomeStripRow tiles={stripTiles} />
          <div className="card mt-10 p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Mảng Premium đang tạm ngưng")}</div>
            <p className="mt-2 text-sm text-slate-500">{L("Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau.")}</p>
          </div>
        </main>
      ) : all.length === 0 && gifts.length === 0 && topups.length === 0 ? (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-4 pt-5 sm:pt-6">
          <HomeStripRow tiles={stripTiles} />
          <div className="card mt-10 p-8 text-center">
            <p className="text-sm text-slate-500">{L("Chưa có sản phẩm nào phù hợp.")}</p>
          </div>
        </main>
      ) : (
        <>
          {/* Hero FULL-BLEED: render ngoài <main> để tràn hết bề ngang
              viewport (lệnh Tín 2026-11-08 "banner bự ra hết cỡ"). Cách
              header một khoảng trống bằng khoảng nội dung chuẩn của trang
              (20px mobile / 24px desktop — Tín 2026-11-08 14:09 "vẫn sát
              header, thấp xuống nữa cái banner"): hero hạ xuống, khoảng
              trống hiện nền trang chứ không dính sát topbar. Chỉ gói ở
              trang chủ — các trang khác dùng chung PublicFrame không đổi. */}
          <div className="mt-10 sm:mt-12">
            <HeroSlider slides={slides} />
          </div>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-4 pt-5 sm:pt-6">
            {/* Dải icon lối tắt NGAY DƯỚI hero, trên nền thường của trang
                (đính chính Tín 2026-11-08 21:10: không dải nền màu). */}
            <HomeStripRow tiles={stripTiles} />
            {/* Khung Flash Sale: NGAY DƯỚI dải icon, TRÊN khối Danh mục
                (trong HomeShop) — không có đợt chạy thì flash = null, trang
                không thêm một dòng DOM nào (lệnh Tín 2026-11-12). */}
            {flash && <HomeFlashSale name={flash.name} percent={flash.percent} endsAt={flash.endsAt} items={flash.items} />}
            <HomeShop slides={slides} cats={cats} all={all} best={best} gifts={gifts} topups={topups} hero={false} />
          </main>
        </>
      )}
    </PublicFrame>
  );
}
