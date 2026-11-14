import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Flash } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { fzrSteamRates } from "@/lib/fzr";
import { SteamTopupForm, type SteamDenom, type SteamRate } from "@/components/steam-topup";
import { ProductReviews } from "@/components/product-reviews";

export const dynamic = "force-dynamic";

/** Nạp Steam Wallet (Top-Up CIS) — trang đặt hàng riêng dựng theo ảnh mẫu
 *  FZR: mệnh giá USD CỐ ĐỊNH từ các gói steam_topup đã đồng bộ (không có
 *  nạp số tự do phía provider), tỉ giá lấy tươi từ /steam-topup/rates khi
 *  có nhà cung cấp FZR. Chưa đồng bộ gói nào → giữ nguyên khung trang +
 *  thẻ "chưa có dữ liệu". Desktop lg+ chia 2 cột 73/27 (Summary dính) như
 *  trang chi tiết Premium; mobile 1 cột. */
export default async function SteamTopupPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { L, Ld } = await getServerI18n();

  const variants = await prisma.premiumVariant.findMany({
    where: { providerGroup: "steam_topup", active: true, product: { active: true, panelId: null } },
    select: { id: true, price: true, providerItemId: true, providerId: true, productId: true },
    orderBy: [{ price: "asc" }, { id: "asc" }],
  });
  const denominations: SteamDenom[] = variants
    .map((v) => ({ variantId: v.id, amount: Number(v.providerItemId || 0), price: v.price }))
    .filter((d) => d.amount > 0 && d.price > 0)
    .sort((a, b) => a.amount - b.amount);

  // Tỉ giá + discount (nếu provider trả): chỉ để HIỂN THỊ — tiền thanh toán
  // luôn theo giá gói đã đồng bộ của site. Lỗi mạng → không hiện affordance.
  let rates: SteamRate[] | null = null;
  let discount: string | null = null;
  const providerId = variants.find((v) => v.providerId)?.providerId;
  if (providerId && denominations.length) {
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (provider?.driver === "FZR") {
      const r: any = await fzrSteamRates(provider).catch(() => null);
      if (r) {
        const rawRates = r.rates && typeof r.rates === "object" ? r.rates : null;
        if (rawRates) {
          rates = Object.entries(rawRates)
            .filter(([, v]) => typeof v === "string" || typeof v === "number")
            .map(([code, v]) => ({ code, rate: String(v) }));
          if (!rates.length) rates = null;
        }
        const dRaw = r.discount ?? r.discountPercent ?? r.commission ?? r.feePercent ?? rawRates?.discount;
        const dNum = Number(dRaw);
        if (dRaw !== undefined && dRaw !== null && !isNaN(dNum) && dNum > 0) {
          discount = `${String(dNum).replace(/\.?0+$/, "")}%`;
        }
      }
    }
  }

  // Khối đánh giá dùng chung của hệ Premium cho sản phẩm giữ chỗ top-up
  // (đơn top-up tham chiếu đúng các variant của sản phẩm này).
  const topupProduct = denominations.length
    ? await prisma.premiumProduct.findUnique({ where: { id: variants[0].productId }, select: { id: true, slug: true } })
    : null;
  const reviewsNode = topupProduct
    ? <ProductReviews productId={topupProduct.id} slug={topupProduct.slug} userId={user.id} returnTo="/dashboard/steam/top-up" />
    : null;

  const headerNode = (
    <>
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[26px] font-black leading-tight text-slate-900">Steam Top-Up (CIS)</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">{L("Nạp Steam bằng tên đăng nhập. Chọn loại tiền và số tiền.")}</p>
      </div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
    </>
  );
  return (
    <div className="mx-auto max-w-[600px] lg:max-w-[1100px]">
      {denominations.length === 0 ? (
        <div className="space-y-4 sm:space-y-5">
          {headerNode}
          <div className="card p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Chưa có dữ liệu Steam")}</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{L("Danh mục Steam chưa được đồng bộ — vui lòng quay lại sau.")}</p>
          </div>
        </div>
      ) : (
        <SteamTopupForm header={headerNode} denominations={denominations} rates={rates} discount={discount} balance={user.balance} reviews={reviewsNode} />
      )}
    </div>
  );
}
