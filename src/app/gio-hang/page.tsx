import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { SiteFooter, PublicHeader } from "@/components/site";
import { getServerI18n } from "@/lib/lang-server";
import { CartView } from "@/components/cart-view";
import { getActiveFlashSale } from "@/lib/flash";

export const dynamic = "force-dynamic";

/** Giỏ hàng Premium (Workstream D) — trong khung cửa hàng công khai; khách
 *  vãng lai dùng được (giỏ lưu localStorage), thanh toán cần đăng nhập + ví. */
export default async function CartPage() {
  const { L } = await getServerI18n();
  const session = await getSession();
  const s = await getSettings();
  const sale = s.module_premium === "0" ? null : await getActiveFlashSale("PREMIUM");
  const flash = sale ? { percent: sale.percent, productIds: (() => { try { const a = JSON.parse(sale.productIds || "[]"); return Array.isArray(a) ? a.map((x) => Number(x)).filter(Number.isFinite) : []; } catch { return []; } })() } : null;
  return (
    <div className="dark pub-dark min-h-screen bg-[#07090d] text-slate-300 flex flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        <h1 className="mb-6 text-2xl font-extrabold text-white sm:text-3xl">{L("Giỏ hàng")}</h1>
        <CartView loggedIn={!!session} flash={flash} />
      </main>
      <SiteFooter />
    </div>
  );
}
