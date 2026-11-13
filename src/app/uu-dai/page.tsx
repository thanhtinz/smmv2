import { prisma } from "@/lib/db";
import { PublicFrame } from "@/components/public-frame";
import { getServerI18n } from "@/lib/lang-server";
import { moduleOn } from "@/lib/modules";
import { num, dt } from "@/lib/format";
import { I } from "@/components/ui";
import { CopyCodeButton } from "@/components/copy-code";

export const dynamic = "force-dynamic";

/** Trang ƯU ĐÃI công khai (lệnh Tín 2026-11-12): tổng hợp các mã giảm giá
 *  DÙNG CHO TẤT CẢ khách — chỉ mã admin chủ động bật "Hiện trên trang Ưu
 *  đãi" (DiscountCode.isPublic, mặc định TẮT = riêng tư) mới hiện ở đây.
 *  Điều kiện hiện đủ bộ: mã của web mẹ (panelId null — mã panel con đã vô
 *  hiệu toàn hệ thống), isPublic, đang bật, đang trong cửa sổ hiệu lực
 *  (startsAt/endsAt null = không giới hạn đầu đó) và chưa hết lượt dùng.
 *  Xếp: hết hạn sớm nhất trước, mã không hạn chót xuống cuối, cùng nhóm thì
 *  mã mới trước. Thẻ chỉ hiện dữ kiện THẬT của mã — trường nào không có thì
 *  không có dòng đó (model không có trường mô tả nên thẻ không có mô tả).
 *  Module mã giảm giá bị tắt ở Cấu hình thì trang hiện trạng thái trống. */
export default async function DealsPage() {
  const { L, M } = await getServerI18n();
  const now = new Date();
  const promoOn = await moduleOn("promo");
  const rows = promoOn
    ? await prisma.discountCode.findMany({
        where: {
          // Mã phạm vi "SMM" đã chết cùng đợt gỡ SMM (không đơn nào áp được) — không quảng bá.
          panelId: null, isPublic: true, active: true, scope: { not: "SMM" },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ endsAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      })
    : [];
  const codes = rows.filter((c) => c.usageLimit === 0 || c.usedCount < c.usageLimit);
  const scopeLabel = (scope: string) => (scope === "PREMIUM" ? L("Sản phẩm Premium") : L("Tất cả đơn hàng"));
  const remaining = (endsAt: Date) => {
    const ms = endsAt.getTime() - now.getTime();
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return `${L("Còn")} ${num(days)} ${L("ngày")}`;
    const hours = Math.floor(ms / 3600000);
    if (hours >= 1) return `${L("Còn")} ${num(hours)} ${L("giờ")}`;
    return `${L("Còn")} ${Math.max(1, Math.floor(ms / 60000))} ${L("phút")}`;
  };
  return (
    <PublicFrame>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-12">
        <div className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-6 text-white sm:px-8">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 [&>svg]:h-6 [&>svg]:w-6">{I.percent}</span>
            <div className="min-w-0">
              <h1 className="text-2xl font-black sm:text-3xl">{L("Ưu đãi")}</h1>
              <p className="mt-1 text-sm text-white/85">{L("Các mã giảm giá đang áp dụng cho mọi khách hàng.")}</p>
            </div>
          </div>
        </div>

        {codes.length === 0 ? (
          <div className="card mt-8 p-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 [&>svg]:h-7 [&>svg]:w-7">{I.ticket}</span>
            <p className="mt-4 text-[15px] font-medium text-slate-600">{L("Hiện chưa có mã ưu đãi nào đang công khai.")}</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {codes.map((c) => (
              <div key={c.id} className="card flex flex-col p-5" data-deal-code={c.code}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[26px] font-black leading-none text-rose-600">{c.type === "PERCENT" ? `-${c.value}%` : `-${M(c.value)}`}</div>
                    <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{L("Giảm giá")}</div>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{I.ticket}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-md border border-dashed border-brand-300 bg-brand-50 px-2.5 py-1.5 font-mono text-sm font-bold tracking-wide text-brand-700">{c.code}</span>
                  <CopyCodeButton code={c.code} />
                </div>
                <dl className="mt-4 space-y-2 border-t border-dashed border-slate-200 pt-4 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-slate-500">{L("Áp dụng cho")}</dt>
                    <dd className="text-right font-semibold text-slate-800">{scopeLabel(c.scope)}</dd>
                  </div>
                  {c.type === "PERCENT" && c.maxDiscount > 0 && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{L("Giảm tối đa")}</dt>
                      <dd className="text-right font-semibold text-slate-800">{M(c.maxDiscount)}</dd>
                    </div>
                  )}
                  {c.minOrder > 0 && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{L("Đơn tối thiểu")}</dt>
                      <dd className="text-right font-semibold text-slate-800">{M(c.minOrder)}</dd>
                    </div>
                  )}
                  {(c.startsAt || c.endsAt) && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{L("Thời hạn")}</dt>
                      <dd className="text-right font-semibold text-slate-800">
                        {c.startsAt && c.endsAt ? `${dt(c.startsAt)} — ${dt(c.endsAt)}` : c.endsAt ? dt(c.endsAt) : `${L("Từ")} ${dt(c.startsAt!)}`}
                      </dd>
                    </div>
                  )}
                  {c.usageLimit > 0 && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-slate-500">{L("Lượt dùng còn lại")}</dt>
                      <dd className="text-right font-semibold text-slate-800">{num(c.usageLimit - c.usedCount)}</dd>
                    </div>
                  )}
                </dl>
                {c.endsAt && (
                  <div className="mt-auto pt-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                      {remaining(c.endsAt)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </PublicFrame>
  );
}
