import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { getTelegramProvider, getTelegramVariants, telegramEnabled } from "@/lib/tg";
import { fzrTelegramStarsQuote, fzrTelegramPremiumPlans, fzrUsdToVnd } from "@/lib/fzr";
import { TelegramOrderForm, type TelegramPlan } from "@/components/telegram-order";

export const dynamic = "force-dynamic";

/** Đặt đơn Telegram Stars & Premium (khu riêng, công tắc ở Admin → Telegram). */
export default async function TelegramOrderPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  if (!(await telegramEnabled())) redirect("/dashboard");
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
    <div className="mx-auto max-w-3xl">
      <div className="card mb-5 flex items-start gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/25 [&>svg]:h-5 [&>svg]:w-5">{I.send}</span>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Telegram Stars & Premium</h1>
          <p className="mt-0.5 text-sm text-slate-500">{L("Mua sao và gói Premium Telegram, gửi thẳng vào tài khoản của bạn.")}</p>
        </div>
        <Link href="/dashboard/telegram/lich-su" className="btn-ghost btn-sm ml-auto shrink-0">{L("Lịch sử")}</Link>
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
