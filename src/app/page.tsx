import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { SiteFooter, PublicHeader } from "@/components/site";
import { HomeModal } from "@/components/gates";
import { I } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { premiumCardsFor } from "@/components/premium-views";
import { PremiumCard, type PremiumCardData } from "@/components/premium-card";
import { FlashBanner } from "@/components/flash-banner";
import { getActiveFlashSale, flashAppliesToProduct } from "@/lib/flash";
import { telegramEnabled } from "@/lib/tg";

export const dynamic = "force-dynamic";

/** Trang chủ = CỬA HÀNG Premium (kiểu shopkey) cho mọi khách — landing đã bỏ
 *  hẳn (lệnh Tín 2026-11-07): không còn chuyển hướng khách đã đăng nhập về
 *  /dashboard; header tự thể hiện phiên đăng nhập. SMM chỉ còn qua menu. */
export default async function HomePage() {
  const s = await getSettings();
  const { L, M } = await getServerI18n();
  const user = await getCurrentUser().catch(() => null);
  const premiumOff = s.module_premium === "0";

  const [cats, products] = premiumOff
    ? [[], []]
    : await Promise.all([
        prisma.premiumCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
        prisma.premiumProduct.findMany({
          where: { active: true, panelId: null },
          orderBy: [{ sort: "asc" }, { id: "asc" }],
          include: { variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true, providerGroup: true } } },
        }),
      ]);
  const cards = await premiumCardsFor(products as any);
  const byCat = new Map<number, PremiumCardData[]>();
  (products as any[]).forEach((p, i) => {
    const arr = byCat.get(p.categoryId) || [];
    arr.push(cards[i]);
    byCat.set(p.categoryId, arr);
  });
  const best = [...cards].sort((a, b) => b.sold - a.sold).filter((c) => c.sold > 0).slice(0, 8);
  const bestShown = best.length >= 4 ? best : cards.slice(0, 8);
  const flashSale = premiumOff ? null : await getActiveFlashSale("PREMIUM");
  const flashCards = flashSale ? cards.filter((c) => flashAppliesToProduct(flashSale, c.productId)).slice(0, 8) : [];
  const tgOn = await telegramEnabled();
  const homeModal = s.home_modal_enabled === "1" && s.home_modal_content?.trim() ? s.home_modal_content : null;

  const Section = ({ title, href, items }: { title: string; href: string; items: PremiumCardData[] }) =>
    items.length === 0 ? null : (
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-xl font-extrabold text-white sm:text-2xl">{title}</h2>
          <Link href={href} className="shrink-0 text-sm font-bold text-cyan-300 hover:text-cyan-200">{L("Xem tất cả")} →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => <PremiumCard key={item.slug} item={item} base="/premium" />)}
        </div>
      </section>
    );

  return (
    <div className="dark pub-dark min-h-screen bg-[#07090d] text-slate-300 flex flex-col">
      <PublicHeader />
      {homeModal && user ? <HomeModal content={homeModal} /> : null}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-4">
        {/* Hero + tìm kiếm nổi bật */}
        <section className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 px-6 py-8 text-white sm:px-10">
          <h1 className="text-2xl font-black leading-tight sm:text-4xl">{L(s.site_name || "")}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">{L(s.site_tagline || "")}</p>
          <form action="/premium" method="get" className="mt-6 flex max-w-xl gap-2">
            <input name="q" className="h-12 min-w-0 flex-1 rounded-full border-0 bg-white px-5 text-[15px] text-slate-900 outline-none ring-cyan-300 focus:ring-4" placeholder={L("Tìm sản phẩm Premium...")} />
            <button className="h-12 shrink-0 rounded-full bg-slate-900 px-4 text-sm font-extrabold text-white transition hover:bg-slate-800 sm:px-6">{L("Tìm kiếm")}</button>
          </form>
          {cats.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {cats.map((c) => (
                <Link key={c.id} href={`/premium?cat=${c.id}`} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/25">{c.name}</Link>
              ))}
            </div>
          )}
        </section>

        {premiumOff ? (
          <div className="card mt-10 p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Mảng Premium đang tạm ngưng")}</div>
            <p className="mt-2 text-sm text-slate-500">{L("Khu vực tài khoản Premium hiện không mở bán. Vui lòng quay lại sau hoặc dùng dịch vụ SMM.")}</p>
          </div>
        ) : (
          <>
            {flashCards.length > 0 && (
              <div className="mt-8">
                <FlashBanner kind="PREMIUM" />
                <Section title={L("Flash Sale đang chạy")} href="/premium" items={flashCards} />
              </div>
            )}
            <Section title={L("Bán chạy nhất")} href="/premium?sort=ban-chay" items={bestShown} />
            {(cats as any[]).map((c) => (
              <Section key={c.id} title={c.name} href={`/premium?cat=${c.id}`} items={(byCat.get(c.id) || []).slice(0, 8)} />
            ))}
          </>
        )}

        {tgOn && (
          <section className="mt-10 flex flex-col items-start gap-4 rounded-3xl border border-violet-500/30 bg-gradient-to-r from-violet-600/15 to-fuchsia-600/10 px-6 py-6 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/25 [&>svg]:h-5 [&>svg]:w-5">{I.send}</span>
            <div className="flex-1">
              <div className="font-extrabold text-white">Telegram Stars & Premium</div>
              <p className="mt-0.5 text-sm text-slate-400">{L("Mua sao và gói Premium Telegram, gửi thẳng vào tài khoản của bạn.")}</p>
            </div>
            <Link href="/dashboard/telegram" className="shrink-0 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-violet-600/25 transition hover:opacity-95">{L("Đặt đơn")}</Link>
          </section>
        )}

        {/* Dải tin cậy */}
        <section className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: I.check, title: L("Giao ngay tự động"), desc: L("Đơn hàng được xử lý và bàn giao tự động 24/7.") },
            { icon: I.shield, title: L("Bảo hành rõ ràng"), desc: L("Mỗi gói ghi rõ thời gian bảo hành trước khi mua.") },
            { icon: I.clock, title: L("Hỗ trợ qua ticket"), desc: L("Đội hỗ trợ xử lý yêu cầu ngay trong khu khách hàng.") },
          ].map((f) => (
            <div key={f.title} className="card flex items-start gap-3.5 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span>
              <div>
                <div className="font-bold text-slate-900">{f.title}</div>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
