import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { SiteFooter, PublicHeader } from "@/components/site";
import { HomeModal } from "@/components/gates";
import { getServerI18n } from "@/lib/lang-server";
import { premiumCardsFor } from "@/components/premium-views";
import { HomeShop, type HomeCard, type HomeCat, type HomeSlide } from "@/components/home-shop";

export const dynamic = "force-dynamic";

/** Trang chủ = CỬA HÀNG Premium theo cấu trúc shopkey (lệnh Tín 2026-11-07):
 *  slider hero → khối danh mục → Sản phẩm nổi bật → Sản phẩm bán chạy → Đã xem
 *  gần đây. CHỈ nội dung trang chủ thay đổi — header/menu/footer giữ nguyên
 *  khung cũ; landing đã bỏ hẳn; không còn chuyển hướng khách đã đăng nhập. */
export default async function HomePage() {
  const s = await getSettings();
  const { L, Ld } = await getServerI18n();
  const user = await getCurrentUser().catch(() => null);
  const premiumOff = s.module_premium === "0";
  const homeModal = s.home_modal_enabled === "1" && s.home_modal_content?.trim() ? s.home_modal_content : null;

  let cats: HomeCat[] = [];
  let all: HomeCard[] = [];
  let best: HomeCard[] = [];
  let slides: HomeSlide[] = [];

  if (!premiumOff) {
    const [catRows, products] = await Promise.all([
      prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
      prisma.premiumProduct.findMany({
        where: { active: true, panelId: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true, providerGroup: true } } },
      }),
    ]);
    const cards = await premiumCardsFor(products as any);
    all = (products as any[]).map((p, i) => ({ ...cards[i], categoryId: p.categoryId }));
    // Bán chạy: xếp theo tổng đã bán thật (PremiumOrder); chưa có đơn nào thì
    // lấy các sản phẩm mới nhất để mục không trống.
    const soldRanked = [...all].filter((c) => c.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 8);
    best = soldRanked.length > 0 ? soldRanked : all.slice(0, 8);
    // Khối danh mục: chỉ danh mục có sản phẩm thật; ảnh/màu lấy từ sản phẩm đầu.
    cats = (catRows as any[])
      .map((c) => {
        const first = all.find((x) => x.categoryId === c.id);
        return first ? { id: c.id, name: c.name, color: first.color, image: first.image } : null;
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
  }

  return (
    <div className="dark pub-dark min-h-screen bg-[#07090d] text-slate-300 flex flex-col">
      <PublicHeader />
      {homeModal && user ? <HomeModal content={homeModal} /> : null}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-4">
        {premiumOff ? (
          <div className="card mt-10 p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Mảng Premium đang tạm ngưng")}</div>
            <p className="mt-2 text-sm text-slate-500">{L("Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau hoặc dùng dịch vụ SMM.")}</p>
          </div>
        ) : all.length === 0 ? (
          <div className="card mt-10 p-8 text-center">
            <p className="text-sm text-slate-500">{L("Chưa có sản phẩm nào phù hợp.")}</p>
          </div>
        ) : (
          <HomeShop slides={slides} cats={cats} all={all} best={best} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
