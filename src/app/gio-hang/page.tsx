import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { SiteFooter, PublicHeader } from "@/components/site";
import { getServerI18n } from "@/lib/lang-server";
import { CartView } from "@/components/cart-view";
import { getActiveFlashSale } from "@/lib/flash";
import { premiumCardsFor } from "@/components/premium-views";
import type { PremiumCardData } from "@/components/premium-card";

export const dynamic = "force-dynamic";

/** Giỏ hàng Premium (Workstream D) — trong khung cửa hàng công khai; khách
 *  vãng lai dùng được (giỏ lưu localStorage), thanh toán cần đăng nhập + ví. */
export default async function CartPage() {
  const { L } = await getServerI18n();
  const session = await getSession();
  const s = await getSettings();
  const sale = s.module_premium === "0" ? null : await getActiveFlashSale("PREMIUM");
  const flash = sale ? { percent: sale.percent, productIds: (() => { try { const a = JSON.parse(sale.productIds || "[]"); return Array.isArray(a) ? a.map((x) => Number(x)).filter(Number.isFinite) : []; } catch { return []; } })() } : null;
  // Gợi ý khi giỏ trống: bán chạy nhất theo đã bán thật, chưa có đơn thì mới nhất.
  let suggested: PremiumCardData[] = [];
  if (s.module_premium !== "0") {
    const products = await prisma.premiumProduct.findMany({
      where: { active: true, panelId: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { variants: { where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true, providerGroup: true } } },
    });
    const cards = await premiumCardsFor(products as any);
    const ranked = [...cards].filter((c) => c.sold > 0).sort((a, b) => b.sold - a.sold);
    suggested = (ranked.length > 0 ? ranked : cards).slice(0, 4);
  }
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <h1 className="mb-6 text-2xl font-extrabold text-slate-900 sm:text-3xl">{L("Giỏ hàng")}</h1>
        <CartView loggedIn={!!session} flash={flash} suggested={suggested} />
      </main>
      <SiteFooter />
    </div>
  );
}
