import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PublicFrame } from "@/components/public-frame";
import { getServerI18n } from "@/lib/lang-server";
import { getCurrentUser } from "@/lib/auth";
import { getPassConfig, passActiveAt, passMonthKey } from "@/lib/pass";
import { buyPassAction, claimPassGiftAction } from "@/app/actions/pass";
import { num, dt } from "@/lib/format";
import { Flash, I } from "@/components/ui";
import { RichText } from "@/components/rich-text";

export const dynamic = "force-dynamic";

/** Trang bán PASS (lệnh Tín 2026-11-12, mẫu ldshop.gg/vn/pass): gói thành
 *  viên trả phí bằng số dư ví — hoàn % tiền đơn về ví + giảm thêm % khi
 *  thanh toán + quà tặng mỗi tháng. MỌI con số trên trang (giá từng kỳ, %
 *  hoàn, % giảm, phạm vi, quà) đọc từ Cấu hình → tab Pass của admin; kỳ nào
 *  giá 0đ thì không hiện, quyền lợi nào 0% thì không dựng thẻ. FAQ lấy từ
 *  Bài viết danh mục slug "pass-faq" (cùng cơ chế FAQ chính của site).
 *  Pass tắt trong cấu hình -> trang không tồn tại (về trang chủ, menu ẩn). */
export default async function PassPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { L, Ld, M } = await getServerI18n();
  const cfg = await getPassConfig();
  if (!cfg.enabled) redirect("/");

  const user = await getCurrentUser().catch(() => null);
  const active = user ? passActiveAt(user.passExpiresAt) : false;

  // Quà tháng: sản phẩm + gói admin chọn sẵn (chỉ hiện khi còn bán thật)
  let gift: { productName: string; variantName: string } | null = null;
  if (cfg.giftProductId && cfg.giftVariantId) {
    const v = await prisma.premiumVariant.findUnique({
      where: { id: cfg.giftVariantId },
      include: { product: { select: { name: true, active: true } } },
    });
    if (v && v.active && v.product.active && v.productId === cfg.giftProductId) {
      gift = { productName: v.product.name, variantName: v.name };
    }
  }
  const claim = user && gift
    ? await prisma.passGiftClaim.findUnique({ where: { userId_monthKey: { userId: user.id, monthKey: passMonthKey() } } })
    : null;

  const faqCat = await prisma.postCategory.findUnique({ where: { slug: "pass-faq" } });
  const faqPosts = faqCat
    ? await prisma.post.findMany({ where: { published: true, categoryId: faqCat.id, panelId: null }, orderBy: [{ pinned: "desc" }, { id: "asc" }], take: 20 })
    : [];

  const scopeText = cfg.scope === "PREMIUM" ? L("Sản phẩm Premium") : cfg.scope === "SMM" ? L("Dịch vụ SMM") : L("Dịch vụ SMM và Sản phẩm Premium");
  const cheapestPerMonth = cfg.terms.length > 1 ? Math.min(...cfg.terms.map((t) => t.price / t.months)) : null;

  const benefits: { icon: React.ReactNode; title: string; desc: string }[] = [];
  if (cfg.cashbackPercent > 0) benefits.push({
    icon: I.wallet,
    title: `${L("Hoàn")} ${cfg.cashbackPercent}% ${L("mỗi đơn")}`,
    desc: `${L("Mỗi đơn trong phạm vi áp dụng được hoàn")} ${cfg.cashbackPercent}% ${L("số tiền thực trả về ví.")}`,
  });
  if (cfg.discountPercent > 0) benefits.push({
    icon: I.percent,
    title: `${L("Giảm thêm")} ${cfg.discountPercent}%`,
    desc: `${L("Tự động giảm thêm")} ${cfg.discountPercent}% ${L("khi thanh toán, áp sau flash sale và mã giảm giá.")}`,
  });
  if (gift) benefits.push({
    icon: I.gift,
    title: L("Quà tặng mỗi tháng"),
    desc: `${L("Nhận miễn phí")} ${gift.productName} — ${gift.variantName} ${L("mỗi tháng khi còn hạn.")}`,
  });
  benefits.push({
    icon: I.layers,
    title: L("Phạm vi áp dụng"),
    desc: `${L("Áp dụng cho")}: ${scopeText}.`,
  });

  return (
    <PublicFrame>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-12">
        <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 [&>svg]:h-6 [&>svg]:w-6">{I.star}</span>
            <div className="min-w-0">
              <h1 className="text-2xl font-black sm:text-3xl">{cfg.name}</h1>
              <p className="mt-1 text-sm text-white/85">
                {cfg.cashbackPercent > 0 && <>{L("Hoàn")} {cfg.cashbackPercent}% {L("tiền mỗi đơn")} · </>}
                {cfg.discountPercent > 0 && <>{L("Giảm thêm")} {cfg.discountPercent}% {L("khi thanh toán")} · </>}
                {L("Thanh toán bằng số dư ví")}
              </p>
            </div>
            {user && (
              <div className="ml-auto rounded-2xl bg-white/15 px-4 py-2.5 text-sm">
                {active
                  ? <span>{L("Đang còn hạn tới")} <b>{dt(user.passExpiresAt!)}</b></span>
                  : <span>{L("Bạn chưa có")} {cfg.name} {L("đang còn hạn")}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Quyền lợi */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {benefits.map((b, i) => (
            <div key={i} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{b.icon}</span>
              <div className="mt-3 font-bold text-slate-900">{b.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{b.desc}</p>
            </div>
          ))}
        </div>

        {/* Giá + mua */}
        <h2 className="mt-10 text-lg font-black text-slate-900">{L("Chọn kỳ hạn")}</h2>
        {cfg.terms.length === 0 ? (
          <div className="card mt-4 p-8 text-center text-[15px] font-medium text-slate-600">{L("Chưa có kỳ hạn nào đang mở bán.")}</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {cfg.terms.map((t) => {
              const perMonth = Math.round(t.price / t.months);
              const best = cheapestPerMonth !== null && t.price / t.months === cheapestPerMonth;
              return (
                <div key={t.months} className={`card relative flex flex-col p-6 ${best ? "ring-2 ring-brand-500" : ""}`}>
                  {best && <span className="absolute -top-2.5 left-5 rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold text-white">{L("Tiết kiệm nhất")}</span>}
                  <div className="text-sm font-bold uppercase tracking-wide text-slate-400">{cfg.name} · {num(t.months)} {L("tháng")}</div>
                  <div className="mt-2 text-3xl font-black text-slate-900">{M(t.price)}</div>
                  <div className="mt-1 text-sm text-slate-500">{L("Tương đương")} {M(perMonth)}/{L("tháng")}</div>
                  {user ? (
                    <form action={buyPassAction} className="mt-5">
                      <input type="hidden" name="months" value={t.months} />
                      <button className="btn-primary w-full">{active ? L("Gia hạn") : L("Mua ngay")}</button>
                    </form>
                  ) : (
                    <Link href="/login" className="btn-primary mt-5 w-full text-center">{L("Đăng nhập để mua")}</Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {user && (
          <p className="mt-3 text-sm text-slate-500">
            {L("Số dư ví của bạn:")} <b className="text-slate-800">{M(user.balance)}</b>
            {" · "}<Link href="/dashboard/nap-tien" className="font-semibold text-brand-600 hover:underline">{L("Nạp thêm tiền")}</Link>
          </p>
        )}

        {/* Quà tháng */}
        {gift && (
          <div className="card mt-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 [&>svg]:h-6 [&>svg]:w-6">{I.gift}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900">{L("Quà tặng tháng này")}: {gift.productName} — {gift.variantName}</div>
              <p className="mt-0.5 text-sm text-slate-500">{L("Thành viên còn hạn được nhận miễn phí 1 lần mỗi tháng.")}</p>
            </div>
            {!user ? (
              <Link href="/login" className="btn-ghost shrink-0">{L("Đăng nhập để nhận quà")}</Link>
            ) : !active ? (
              <span className="shrink-0 text-sm font-medium text-slate-400">{L("Cần")} {cfg.name} {L("đang còn hạn")}</span>
            ) : claim ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                {L("Đã nhận tháng này")}{claim.orderCode ? ` · ${claim.orderCode}` : ""}
              </span>
            ) : (
              <form action={claimPassGiftAction} className="shrink-0">
                <button className="btn-primary">{L("Nhận quà tháng này")}</button>
              </form>
            )}
          </div>
        )}

        {/* Lưu ý / quy định */}
        <div className="card mt-8 p-6">
          <div className="font-bold text-slate-900">{L("Lưu ý")}</div>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Mua và gia hạn trừ trực tiếp từ số dư ví; gia hạn cộng tiếp vào hạn hiện tại, không mất ngày đã trả.")}</li>
            <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Quyền lợi chỉ áp dụng trong thời gian còn hạn và cho đơn thuộc phạm vi:")} {scopeText}.</li>
            {cfg.discountPercent > 0 && <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Giảm thêm áp dụng sau flash sale và mã giảm giá, trên số tiền còn phải trả.")}</li>}
            {cfg.cashbackPercent > 0 && <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Hoàn tiền tính trên số tiền thực trả, cộng thẳng vào ví và xem được trong Lịch sử số dư.")}</li>}
            <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Đơn bị hoàn tiền sẽ bị thu hồi phần hoàn tiền tương ứng theo tỉ lệ số tiền được hoàn.")}</li>
            {gift && <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Quà tháng nhận tối đa 1 lần mỗi tháng dương lịch, giao qua đơn hàng như đơn mua thường.")}</li>}
            <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Bản thân đơn mua Pass không hưởng giảm thêm và hoàn tiền của Pass.")}</li>
          </ul>
        </div>

        {/* FAQ — bài viết admin, danh mục slug "pass-faq" */}
        {faqPosts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-black text-slate-900">{L("Câu hỏi thường gặp")}</h2>
            <div className="mt-4 space-y-3">
              {faqPosts.map((p, i) => (
                <details key={p.id} open={i === 0} className="card group overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="text-[15px] font-bold leading-snug text-slate-900">{p.title}</span>
                    <span className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180">{I.chevron}</span>
                  </summary>
                  <div className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600">
                    <RichText value={p.content} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}
      </main>
    </PublicFrame>
  );
}
