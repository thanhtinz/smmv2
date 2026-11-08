import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Flash } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { getTelegramProvider, getTelegramVariants, telegramEnabled } from "@/lib/tg";
import { fzrTelegramStarsQuote, fzrTelegramPremiumPlans, fzrUsdToVnd } from "@/lib/fzr";
import { TelegramOrderForm, type TelegramPlan } from "@/components/telegram-order";

export const dynamic = "force-dynamic";

/** Đặt đơn Telegram Stars & Premium (khu riêng, công tắc ở Admin → Telegram). */
export default async function TelegramOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  if (!(await telegramEnabled())) redirect("/");
  const provider = await getTelegramProvider();
  const variants = provider ? await getTelegramVariants(provider.id) : { stars: null, premium: [] as never[] };

  // Báo giá tươi phía FZR khi lấy được; lỗi thì dùng giá đã đồng bộ trong DB.
  let starPrice = variants.stars?.price || 0;
  let starMin = 50;
  let starMax = 100000;
  let plans: TelegramPlan[] = variants.premium
    .map((v) => ({ months: parseInt(v.providerItemId || "0"), price: v.price }))
    .filter((p) => [3, 6, 12].includes(p.months))
    .sort((a, b) => a.months - b.months);
  if (provider) {
    const quote = await fzrTelegramStarsQuote(provider).catch(() => null);
    if (quote) {
      starPrice = fzrUsdToVnd(quote.pricePerStar, provider.exchangeRate, provider.markupPercent);
      if (quote.minAmount) starMin = quote.minAmount;
      if (quote.maxAmount) starMax = quote.maxAmount;
    }
    const livePlans = await fzrTelegramPremiumPlans(provider).catch(() => null);
    if (livePlans?.length) {
      plans = livePlans
        .filter((p) => [3, 6, 12].includes(p.durationMonths))
        .map((p) => ({ months: p.durationMonths, price: fzrUsdToVnd(p.finalPrice || p.price, provider.exchangeRate, provider.markupPercent) }))
        .sort((a, b) => a.months - b.months);
    }
  }
  const configured = !!provider && (!!variants.stars || plans.length > 0);

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
        <TelegramOrderForm starPrice={starPrice} starMin={starMin} starMax={starMax} plans={plans} balance={user.balance} />
      )}
    </div>
  );
}
