import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { PublicFrame } from "@/components/public-frame";
import { CartView } from "@/components/cart-view";
import { getActiveFlashSale } from "@/lib/flash";

export const dynamic = "force-dynamic";

/** Giỏ hàng Premium 3 bước (Workstream D + dựng lại theo ảnh mẫu WS13) —
 *  trong khung cửa hàng công khai; khách vãng lai dùng được (giỏ lưu
 *  localStorage), thanh toán cần đăng nhập + ví. Giỏ trống KHÔNG còn mục
 *  "Sản phẩm gợi ý" (lệnh Tín 23:40 — bỏ hẳn, kể cả truy vấn dữ liệu gợi ý). */
export default async function CartPage({ searchParams }: { searchParams?: { purchase?: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const s = await getSettings();
  const sale = s.module_premium === "0" ? null : await getActiveFlashSale("PREMIUM");
  const flash = sale ? { percent: sale.percent, productIds: (() => { try { const a = JSON.parse(sale.productIds || "[]"); return Array.isArray(a) ? a.map((x) => Number(x)).filter(Number.isFinite) : []; } catch { return []; } })() } : null;
  const { availableDirectMethods } = await import("@/lib/purchase");
  const directMethods = user ? await availableDirectMethods().catch(() => []) : [];
  return (
    <PublicFrame>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6 sm:py-8">
        <CartView loggedIn={!!user} balance={user ? user.balance : null} flash={flash} directMethods={directMethods} initialPurchase={searchParams?.purchase || null} />
      </main>
    </PublicFrame>
  );
}
