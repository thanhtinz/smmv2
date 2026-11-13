import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PublicFrame } from "@/components/public-frame";
import { getServerI18n } from "@/lib/lang-server";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getPassConfig, passActiveAt, passMonthKey } from "@/lib/pass";
import { claimPassGiftAction } from "@/app/actions/pass";
import { num, dt } from "@/lib/format";
import { Flash, I } from "@/components/ui";
import { RichText } from "@/components/rich-text";
import { PassPricing, type PassTermVM } from "@/components/pass-pricing";

export const dynamic = "force-dynamic";

/** Trang bán PASS (lệnh Tín 2026-11-12, mẫu ldshop.gg/vn/pass; trình bày
 *  dựng lại theo MOCKUP HƯỚNG A đã duyệt — đợt 116, 2026-11-13): hero 2
 *  cột trên gradient brand (trái: nhãn + câu giá trị + CTA + 3 cam kết;
 *  phải: thẻ Pass trực quan vẽ bằng CSS, số % và hạn dùng lấy từ dữ liệu
 *  thật) → 3 thẻ quyền lợi → khối giá 2 cột (thẻ kỳ hạn + tóm tắt bám
 *  phải, component PassPricing) → dải quà tháng → Lưu ý + FAQ 2 cột.
 *  MỌI con số (giá từng kỳ, % hoàn, % giảm, phạm vi, quà) đọc từ Cấu
 *  hình → tab Pass của admin; kỳ nào giá 0đ thì không hiện, quyền lợi
 *  nào 0% thì không dựng thẻ. FAQ từ Bài viết slug "pass-faq".
 *  Pass tắt trong cấu hình -> trang không tồn tại (về trang chủ). */
export default async function PassPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { L, Ld, M } = await getServerI18n();
  const cfg = await getPassConfig();
  if (!cfg.enabled) redirect("/");
  const settings = await getSettings().catch(() => null);

  const user = await getCurrentUser().catch(() => null);
  const active = user ? passActiveAt(user.passExpiresAt) : false;
  // Trạng thái thành viên (đợt 115): kỳ đang dùng / đã huỷ / tự gia hạn —
  // khách còn hạn KHÔNG thấy giao diện mua mới nữa.
  const termMonths = user?.passTermMonths ?? null;
  const cancelled = active && !!user?.passCancelledAt;
  const autoRenew = !!user?.passAutoRenew;

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

  const scopeText = cfg.scope === "PREMIUM" ? L("Sản phẩm Premium") : L("Tất cả sản phẩm");

  // View-model kỳ hạn cho khối giá: tương đương/tháng + % tiết kiệm tính
  // từ GIÁ THẬT (căn cứ kỳ ngắn nhất đang bán — với bộ 1/3/12 tháng thì
  // chính là kỳ 1 tháng như mockup), kỳ rẻ nhất/tháng gắn nhãn Tiết kiệm nhất.
  const shortest = cfg.terms.length ? cfg.terms.reduce((a, b) => (a.months < b.months ? a : b)) : null;
  const basePerMonth = shortest ? shortest.price / shortest.months : 0;
  const cheapestPerMonth = cfg.terms.length > 1 ? Math.min(...cfg.terms.map((t) => t.price / t.months)) : null;
  const termsVM: PassTermVM[] = cfg.terms.map((t) => ({
    months: t.months,
    price: t.price,
    perMonth: Math.round(t.price / t.months),
    savePct: basePerMonth > 0 ? Math.max(0, Math.round((1 - t.price / t.months / basePerMonth) * 100)) : 0,
    isShortest: shortest?.months === t.months,
    isBest: cheapestPerMonth !== null && t.price / t.months === cheapestPerMonth,
  }));

  // Câu mô tả ở hero — ghép từ quyền lợi THẬT đang cấu hình.
  const heroBits: string[] = [];
  if (cfg.discountPercent > 0) heroBits.push(`${L("Giảm thêm")} ${cfg.discountPercent}% ${L("khi thanh toán")}`);
  if (cfg.cashbackPercent > 0) heroBits.push(`${L("hoàn")} ${cfg.cashbackPercent}% ${L("tiền thực trả về ví")}`);
  if (gift) heroBits.push(L("và nhận quà miễn phí mỗi tháng"));
  const heroDescRaw = heroBits.length ? `${heroBits.join(", ")} — ${L("tự động áp dụng trong suốt thời gian còn hạn.")}` : L("Thanh toán bằng số dư ví");
  const heroDesc = heroDescRaw.charAt(0).toUpperCase() + heroDescRaw.slice(1);

  // Dòng quyền lợi + hạn dùng in trên thẻ Pass trực quan: % thật; hạn dùng
  // là hạn THẬT (tháng/năm) của khách còn hạn, khách chưa có thì để dạng
  // mẫu trung tính như mockup đã duyệt.
  const cardBenefitBits: string[] = [];
  if (cfg.cashbackPercent > 0) cardBenefitBits.push(`${L("Hoàn")} ${cfg.cashbackPercent}%`);
  if (cfg.discountPercent > 0) cardBenefitBits.push(`${L("Giảm thêm")} ${cfg.discountPercent}%`);
  const cardBenefitLine = cardBenefitBits.length ? cardBenefitBits.join(" · ") : scopeText;
  const cardExpiry = active && user?.passExpiresAt
    ? `${String(user.passExpiresAt.getMonth() + 1).padStart(2, "0")} / ${user.passExpiresAt.getFullYear()}`
    : "12 / 2027";

  const benefits: { icon: React.ReactNode; title: React.ReactNode; desc: string }[] = [];
  if (cfg.cashbackPercent > 0) benefits.push({
    icon: I.refresh,
    title: <>{L("Hoàn ví")} <b className="text-brand-600">{cfg.cashbackPercent}%</b> {L("mỗi đơn")}</>,
    desc: `${L("Mỗi đơn trong phạm vi áp dụng được hoàn")} ${cfg.cashbackPercent}% ${L("số tiền thực trả về ví.")}`,
  });
  if (cfg.discountPercent > 0) benefits.push({
    icon: I.percent,
    title: <>{L("Giảm thêm")} <b className="text-brand-600">{cfg.discountPercent}%</b> {L("khi thanh toán")}</>,
    desc: `${L("Tự động giảm thêm")} ${cfg.discountPercent}% ${L("khi thanh toán, áp sau flash sale và mã giảm giá.")}`,
  });
  if (gift) benefits.push({
    icon: I.gift,
    title: L("Quà tặng mỗi tháng"),
    desc: `${L("Nhận miễn phí")} ${gift.productName} — ${gift.variantName} ${L("mỗi tháng khi còn hạn.")}`,
  });

  const memberVM = active && user ? {
    currentTermMonths: termMonths,
    termText: termMonths ? `${cfg.name} · ${num(termMonths)} ${L("tháng")}` : cfg.name,
    expiryText: dt(user.passExpiresAt!),
    cancelled,
    autoRenew,
  } : null;

  return (
    <PublicFrame>
      {/* ===== HERO 2 cột + thẻ Pass trực quan ===== */}
      <section className="overflow-hidden bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 text-white">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-11 lg:grid-cols-[1fr_400px]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em]">
              <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{I.star}</span>
              {L("Thành viên")} {cfg.name}
            </span>
            <h1 className="mt-4 text-[27px] font-extrabold leading-[1.2] sm:text-[34px]">
              {L("Một thẻ")} {cfg.name}{L(", mọi đơn đều nhẹ giá hơn")}
            </h1>
            <p className="mt-2.5 max-w-[520px] text-base leading-relaxed text-brand-100">{heroDesc}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#gia" className="btn !px-[22px] !py-3 text-[15px] font-bold bg-white text-brand-700 hover:bg-brand-50">
                {active ? L("Gia hạn và đổi gói") : `${L("Mua")} ${cfg.name} ${L("ngay")}`}
              </a>
              <a href="#quyen-loi" className="btn !px-[22px] !py-3 text-[15px] font-bold border-white/55 text-white hover:bg-white/10">
                {L("Xem quyền lợi")}
              </a>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-[18px] gap-y-2 text-[13.5px] text-brand-100">
              <span className="inline-flex items-center gap-1.5"><span className="shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]">{I.check}</span>{L("Thanh toán bằng số dư ví")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]">{I.check}</span>{L("Kích hoạt ngay sau khi mua")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]">{I.check}</span>{L("Gia hạn cộng dồn, không mất ngày")}</span>
            </div>
            {user && (
              <div className="mt-5 inline-flex rounded-full bg-white/15 px-4 py-2 text-sm">
                {cancelled
                  ? <span>{L("Đã huỷ — dùng tới")} <b>{dt(user.passExpiresAt!)}</b></span>
                  : active
                    ? <span>{L("Đang còn hạn tới")} <b>{dt(user.passExpiresAt!)}</b></span>
                    : <span>{L("Bạn chưa có")} {cfg.name} {L("đang còn hạn")}</span>}
              </div>
            )}
          </div>

          {/* Thẻ Pass vẽ bằng CSS — nghiêng nhẹ + thẻ viền mờ phía sau */}
          <div className="relative h-[218px] max-w-[400px] sm:h-[248px] lg:max-w-none" aria-hidden="true">
            <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-[3.5deg] rounded-[22px] border-[1.5px] border-white/35" />
            <div className="absolute inset-0 -rotate-3 overflow-hidden rounded-[22px] bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 p-[22px_24px] text-white shadow-[0_24px_48px_rgba(15,35,90,0.45)]">
              <div className="absolute -right-[130px] -top-[170px] h-[340px] w-[340px] rounded-full bg-white/[0.07]" />
              <div className="absolute -bottom-[130px] -right-[60px] h-[220px] w-[220px] rounded-full border-[1.5px] border-white/[0.14]" />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-brand-100">{(settings?.site_name || "").toUpperCase()}</span>
                <span className="text-[15px] font-extrabold uppercase tracking-[0.3em]">{cfg.name}</span>
              </div>
              <div className="relative mt-5">
                <svg width="44" height="32" viewBox="0 0 44 32" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="42" height="30" rx="6" stroke="rgba(255,255,255,.65)" strokeWidth="2" />
                  <path d="M1 11h14M1 21h14M43 11H29M43 21H29M15 1v30M29 1v30" stroke="rgba(255,255,255,.65)" strokeWidth="2" />
                </svg>
              </div>
              <div className="relative mt-4 text-[21px] font-extrabold uppercase tracking-[0.06em]">
                {L("Thành viên")} {cfg.name}
              </div>
              <div className="relative mt-3.5 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-brand-200">{L("Quyền lợi")}</div>
                  <div className="mt-0.5 text-[14.5px] font-bold">{cardBenefitLine}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-brand-200">{L("Hạn dùng")}</div>
                  <div className="mt-0.5 text-[14.5px] font-bold">{cardExpiry}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-12">
        {(searchParams.msg || searchParams.err) && (
          <div className="order-0 mt-6">
            <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
          </div>
        )}

        {/* ===== Quyền lợi (mobile: sau khối giá theo đúng mockup) ===== */}
        <section id="quyen-loi" className="order-2 mt-8 scroll-mt-24 lg:order-1">
          <h2 className="text-[21px] font-extrabold text-slate-900">{L("Quyền lợi của")} {cfg.name}</h2>
          <p className="mb-5 mt-1.5 text-[14.5px] text-slate-500">{L("Áp dụng tự động cho mọi đơn thuộc phạm vi trong suốt thời gian Pass còn hạn.")}</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <div key={i} className="card p-[22px]">
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-[23px] [&>svg]:w-[23px]">{b.icon}</span>
                <div className="mt-3.5 text-[16.5px] font-extrabold text-slate-900">{b.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Giá + tóm tắt (PassPricing lo cả 2 trạng thái) ===== */}
        <section id="gia" className="order-1 mt-8 scroll-mt-24 lg:order-2">
          <h2 className="text-[21px] font-extrabold text-slate-900">{active ? L("Gia hạn và đổi gói") : L("Chọn kỳ hạn")}</h2>
          <p className="mb-2 mt-1.5 text-[14.5px] text-slate-500">{L("Giá theo cấu hình của website. Mua và gia hạn đều trừ trực tiếp từ số dư ví.")}</p>
          {cfg.terms.length === 0 ? (
            <div className="card mt-4 p-8 text-center text-[15px] font-medium text-slate-600">{L("Chưa có kỳ hạn nào đang mở bán.")}</div>
          ) : (
            <PassPricing
              name={cfg.name}
              terms={termsVM}
              cashbackPercent={cfg.cashbackPercent}
              discountPercent={cfg.discountPercent}
              hasGift={!!gift}
              loggedIn={!!user}
              balance={user ? user.balance : null}
              member={memberVM}
            />
          )}
        </section>

        {/* ===== Quà tháng ===== */}
        {gift && (
          <div className="card order-3 mt-8 flex flex-col gap-[18px] p-[22px] sm:flex-row sm:items-center">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-[23px] [&>svg]:w-[23px]">{I.gift}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[16.5px] font-extrabold text-slate-900">{L("Quà tặng tháng này")}: {gift.productName} — {gift.variantName}</div>
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
                <button className="btn-ghost !border-brand-600 font-bold text-brand-700">{L("Nhận quà tháng này")}</button>
              </form>
            )}
          </div>
        )}

        {/* ===== Lưu ý + FAQ 2 cột ===== */}
        <div className={`order-4 mt-8 grid items-start gap-6 ${faqPosts.length ? "lg:grid-cols-2" : ""}`}>
          <div className="card p-[22px]">
            <div className="text-[16.5px] font-extrabold text-slate-900">{L("Lưu ý")}</div>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Mua và gia hạn trừ trực tiếp từ số dư ví; gia hạn cộng tiếp vào hạn hiện tại, không mất ngày đã trả.")}</li>
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Quyền lợi chỉ áp dụng trong thời gian còn hạn và cho đơn thuộc phạm vi:")} {scopeText}.</li>
              {cfg.discountPercent > 0 && <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Giảm thêm áp dụng sau flash sale và mã giảm giá, trên số tiền còn phải trả.")}</li>}
              {cfg.cashbackPercent > 0 && <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Hoàn tiền tính trên số tiền thực trả, cộng thẳng vào ví và xem được trong Lịch sử số dư.")}</li>}
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Đơn bị hoàn tiền sẽ bị thu hồi phần hoàn tiền tương ứng theo tỉ lệ số tiền được hoàn.")}</li>
              {gift && <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Quà tháng nhận tối đa 1 lần mỗi tháng dương lịch, giao qua đơn hàng như đơn mua thường.")}</li>}
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Bản thân đơn mua Pass không hưởng giảm thêm và hoàn tiền của Pass.")}</li>
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Đổi gói: trừ ví theo giá kỳ mới tại thời điểm đổi, hạn dùng cộng dồn tiếp từ hạn hiện tại — không mất ngày đã trả.")}</li>
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Tự gia hạn: khi bật, hệ thống tự trừ ví theo giá hiện tại của kỳ đang dùng trước khi hết hạn; số dư không đủ sẽ nhận thông báo và gói hết hạn tự nhiên.")}</li>
              <li className="flex gap-2"><span className="shrink-0 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Huỷ gói: quyền lợi vẫn dùng tiếp tới hết hạn đã trả, không hoàn tiền; tự gia hạn sẽ tắt khi huỷ.")}</li>
            </ul>
          </div>

          {faqPosts.length > 0 && (
            <div>
              <h3 className="mb-[13px] text-[16.5px] font-extrabold text-slate-900">{L("Câu hỏi thường gặp")}</h3>
              <div className="space-y-3">
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
            </div>
          )}
        </div>
      </main>
    </PublicFrame>
  );
}
