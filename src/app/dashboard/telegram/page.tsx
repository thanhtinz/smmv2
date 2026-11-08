import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Flash } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { getTelegramProvider, getTelegramVariants, telegramEnabled, DEFAULT_STAR_PACKAGES } from "@/lib/tg";
import { fzrTelegramStarsQuote, fzrTelegramPremiumPlans, fzrUsdToVnd } from "@/lib/fzr";
import { fzrMarkupFor } from "@/lib/fzr-markup";
import { TelegramOrderForm, type TelegramPlan } from "@/components/telegram-order";
import { ProductReviews } from "@/components/product-reviews";

export const dynamic = "force-dynamic";

/** Đặt đơn Telegram Stars & Premium (khu riêng, công tắc ở Admin → Telegram). */
export default async function TelegramOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  if (!(await telegramEnabled())) redirect("/");
  const provider = await getTelegramProvider();
  const variants = provider ? await getTelegramVariants(provider.id) : { stars: null, starsPackages: [] as { amount: number; active: boolean; outOfStock: boolean }[], premium: [] as never[] };
  // Danh sách gói sao khách chọn = các gói sao trong catalog đang bán (admin
  // quản lý ở Admin → Telegram → Sản phẩm). Catalog chưa có gói nào (chưa
  // đồng bộ bản mới) thì dùng danh sách mặc định để trang vẫn bán được.
  const starPackages = variants.starsPackages.length
    ? variants.starsPackages.filter((p) => p.active && !p.outOfStock).map((p) => p.amount)
    : DEFAULT_STAR_PACKAGES;

  // Báo giá tươi phía FZR khi lấy được; lỗi thì dùng giá đã đồng bộ trong DB.
  let starPrice = variants.stars?.price || 0;
  let starMin = 50;
  let starMax = 100000;
  // Giá bán do SITE quyết: gói đã có trong catalog thì hiển thị đúng giá gói
  // (giá admin đặt ở Admin → Telegram → Sản phẩm, và cũng là giá createPremiumOrder
  // tính tiền — hiển thị và tính tiền không được lệch nhau). Giá tươi phía FZR
  // chỉ lấp vào tháng nào catalog chưa có gói. Stars khác hẳn: giá chốt theo
  // báo giá tại lúc mua nên hiển thị theo báo giá là đúng cả hai phía.
  let plans: TelegramPlan[] = variants.premium
    .map((v) => ({ months: parseInt(v.providerItemId || "0"), price: v.price }))
    .filter((p) => [3, 6, 12].includes(p.months))
    .sort((a, b) => a.months - b.months);
  if (provider) {
    // Markup theo khu Telegram (override ở Admin → Telegram → Sản phẩm) —
    // giá hiển thị phải là giá sẽ tính tiền ở refreshFzrQuotePrice/đơn.
    const starsMarkup = await fzrMarkupFor(provider, "telegram_stars");
    const premiumMarkup = await fzrMarkupFor(provider, "telegram_premium");
    const quote = await fzrTelegramStarsQuote(provider).catch(() => null);
    if (quote) {
      starPrice = fzrUsdToVnd(quote.pricePerStar, provider.exchangeRate, starsMarkup);
      if (quote.minAmount) starMin = quote.minAmount;
      if (quote.maxAmount) starMax = quote.maxAmount;
    }
    const livePlans = await fzrTelegramPremiumPlans(provider).catch(() => null);
    if (livePlans?.length) {
      const have = new Set(plans.map((p) => p.months));
      for (const p of livePlans) {
        if (![3, 6, 12].includes(p.durationMonths) || have.has(p.durationMonths)) continue;
        plans.push({ months: p.durationMonths, price: fzrUsdToVnd(p.finalPrice || p.price, provider.exchangeRate, premiumMarkup) });
      }
      plans.sort((a, b) => a.months - b.months);
    }
  }
  const configured = !!provider && (!!variants.stars || plans.length > 0);
  // Khối đánh giá dùng chung của hệ Premium, gắn theo TAB đang mở: tab
  // Stars → sản phẩm Stars, tab Premium → sản phẩm Telegram Premium (đúng
  // sản phẩm tổng hợp mà đơn của khách tham chiếu tới).
  const starsProduct = variants.stars?.product || null;
  const premiumProduct = variants.premium[0]?.product || null;
  const reviewsStars = configured && starsProduct
    ? <ProductReviews productId={starsProduct.id} slug={starsProduct.slug} userId={user.id} returnTo="/dashboard/telegram" />
    : null;
  const reviewsPremium = configured && premiumProduct
    ? <ProductReviews productId={premiumProduct.id} slug={premiumProduct.slug} userId={user.id} returnTo="/dashboard/telegram" />
    : null;

  return (
    <div className="mx-auto max-w-[600px] space-y-4 sm:space-y-5">
      {/* Thẻ tiêu đề DUY NHẤT ở đầu trang — đúng thẻ header của ảnh mẫu FZR
          (gradient oải hương nhạt, không icon, không nút Lịch sử, không
          PageHead/hero nào khác phía trên). */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[26px] font-black leading-tight text-slate-900">Telegram stars & premium</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">{L("Danh mục sao và Premium Telegram.")}</p>
      </div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      {!configured ? (
        <div className="card p-8 text-center">
          <div className="text-lg font-bold text-slate-900">{L("Dịch vụ chưa được cấu hình")}</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{L("Telegram Stars & Premium chưa mở bán — vui lòng quay lại sau.")}</p>
        </div>
      ) : (
        <TelegramOrderForm starPrice={starPrice} starMin={starMin} starMax={starMax} starPackages={starPackages} plans={plans} balance={user.balance} reviewsStars={reviewsStars} reviewsPremium={reviewsPremium} />
      )}
    </div>
  );
}
