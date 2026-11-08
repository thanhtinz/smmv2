"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { useCartItems, setCartQty, removeCartLine, updateCartLine, type CartItem } from "@/components/cart";
import { PremiumCard, type PremiumCardData } from "@/components/premium-card";
import { checkoutCartAction } from "@/app/actions/cart";

/** Công thức flash phía client — khớp applyFlashAmount phía server (lib/flash). */
const applyFlash = (amount: number, percent: number) =>
  !percent || percent <= 0 ? amount : Math.max(1, Math.round(amount * (1 - Math.min(90, percent) / 100)));

const lineKeyOf = (x: CartItem) => `${x.variantId}|${JSON.stringify(x.custom)}|${x.buyerInfo || ""}`;

/** Trang giỏ hàng: dòng hàng (ảnh, gói, giá flash, stepper, trường tuỳ chỉnh,
 *  xoá), hộp tóm tắt và thanh toán bằng ví qua checkoutCartAction. */
export function CartView({ loggedIn, flash, suggested = [] }: {
  loggedIn: boolean;
  flash: { percent: number; productIds: number[] } | null;
  suggested?: PremiumCardData[];
}) {
  const { t, m } = useLang();
  const items = useCartItems();
  const [promo, setPromo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doneCodes, setDoneCodes] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const flashFor = (x: CartItem) => (flash && (flash.productIds.length === 0 || flash.productIds.includes(x.productId)) ? flash.percent : 0);
  const unitPrice = (x: CartItem) => applyFlash(x.price, flashFor(x));
  const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0);
  const total = items.reduce((a, x) => a + unitPrice(x) * x.qty, 0);
  const flashDiscount = subtotal - total;

  const checkout = () => {
    if (!items.length || pending) return;
    startTransition(async () => {
      const res = await checkoutCartAction(
        items.map((x) => ({ variantId: x.variantId, qty: x.qty, custom: x.custom, buyerInfo: x.buyerInfo || null })),
        promo
      );
      if (res.needLogin) { window.location.href = "/login"; return; }
      const errs: Record<string, string> = {};
      const codes: string[] = [];
      res.results.forEach((r, i) => {
        const line = items[i];
        if (!line) return;
        if (r.ok) { codes.push(r.code || ""); removeCartLine(line.variantId, line.custom, line.buyerInfo); }
        else errs[lineKeyOf(line)] = r.error || t("Đặt đơn thất bại");
      });
      setErrors(errs);
      if (codes.length) setDoneCodes(codes);
    });
  };

  if (items.length === 0) {
    return (
      <div>
        {doneCodes.length > 0 && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <div className="font-bold">{t("Đặt hàng thành công:")} {doneCodes.join(", ")}</div>
            <Link href="/dashboard/don-premium" className="mt-1 inline-block font-bold text-emerald-700 underline">{t("Xem đơn hàng Premium")}</Link>
          </div>
        )}
        <div className="card p-10 text-center">
          <div className="text-lg font-bold text-slate-900">{t("Giỏ hàng đang trống")}</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t("Thêm sản phẩm Premium vào giỏ rồi quay lại đây để thanh toán một lần.")}</p>
          <Link href="/premium" className="btn-primary mt-5 inline-block">{t("Tiếp tục mua sắm")}</Link>
        </div>
        {suggested.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{I.gem}</span>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{t("Sản phẩm gợi ý")}</h2>
                <p className="mt-0.5 text-[13px] text-slate-500">{t("Được khách hàng mua nhiều nhất trên cửa hàng.")}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {suggested.map((item) => <PremiumCard key={item.slug} item={item} base="/premium" />)}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3.5">
        {doneCodes.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <div className="font-bold">{t("Đặt hàng thành công:")} {doneCodes.join(", ")}</div>
            <Link href="/dashboard/don-premium" className="mt-1 inline-block font-bold text-emerald-700 underline">{t("Xem đơn hàng Premium")}</Link>
          </div>
        )}
        {items.map((x) => {
          const key = lineKeyOf(x);
          const err = errors[key];
          const up = unitPrice(x);
          return (
            <div key={key} className="card flex gap-4 p-4">
              {x.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.image} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-xl font-black text-white">{x.productName.charAt(0)}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-900">{x.productName}</div>
                    <div className="text-sm text-slate-500">{x.variantName}</div>
                  </div>
                  <button type="button" aria-label={t("Xoá khỏi giỏ")} onClick={() => removeCartLine(x.variantId, x.custom, x.buyerInfo)} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">{I.trash}</button>
                </div>
                {Object.keys(x.custom).length > 0 && (
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    {Object.entries(x.custom).map(([label, value]) => (
                      <label key={label} className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
                        <input className="inp !py-2" value={value} onChange={(e) => updateCartLine(x.variantId, { custom: x.custom, buyerInfo: x.buyerInfo }, { custom: { ...x.custom, [label]: e.target.value } })} />
                      </label>
                    ))}
                  </div>
                )}
                {x.buyerInfo !== undefined && x.buyerInfo !== null && Object.keys(x.custom).length === 0 && (
                  <label className="mt-2.5 block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">{t("Thông tin bàn giao")}</span>
                    <input className="inp !py-2" value={x.buyerInfo} onChange={(e) => updateCartLine(x.variantId, { custom: x.custom, buyerInfo: x.buyerInfo }, { buyerInfo: e.target.value })} />
                  </label>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="flex h-[38px] items-stretch">
                    <button type="button" aria-label={t("Giảm số lượng")} onClick={() => setCartQty(x.variantId, x.custom, x.qty - 1, x.buyerInfo)} className="w-9 rounded-l-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">−</button>
                    <input className="w-12 border-y border-slate-300 text-center font-bold text-slate-900 outline-none" type="number" min={1} value={x.qty} onChange={(e) => setCartQty(x.variantId, x.custom, parseInt(e.target.value) || 1, x.buyerInfo)} />
                    <button type="button" aria-label={t("Tăng số lượng")} onClick={() => setCartQty(x.variantId, x.custom, x.qty + 1, x.buyerInfo)} className="w-9 rounded-r-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">+</button>
                  </div>
                  {x.stockCap !== null && <span className="text-xs text-slate-400">{t("Còn")} {x.stockCap} {t("trong kho")}</span>}
                  <span className="ml-auto text-right">
                    {flashFor(x) > 0 && <span className="mr-2 text-sm text-slate-400 line-through">{m(x.price * x.qty)}</span>}
                    <span className="text-base font-extrabold text-rose-600">{m(up * x.qty)}</span>
                  </span>
                </div>
                {err && <p className="mt-2 text-sm font-medium text-rose-600">{err}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="card space-y-4 p-5 lg:sticky lg:top-24">
        <div className="font-extrabold text-slate-900">{t("Tóm tắt đơn hàng")}</div>
        <div>
          <label className="lbl">{t("Mã giảm giá")}</label>
          <input className="inp uppercase" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t("VD: SALE10")} autoComplete="off" />
          <p className="mt-1.5 text-xs text-slate-400">{t("Mã áp dụng cho từng đơn khi thanh toán.")}</p>
        </div>
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between text-slate-500"><span>{t("Tạm tính")}</span><span className="font-semibold text-slate-700">{m(subtotal)}</span></div>
          {flashDiscount > 0 && <div className="flex justify-between font-semibold text-emerald-600"><span>{t("Giảm giá Flash Sale")}</span><span>−{m(flashDiscount)}</span></div>}
          <div className="flex items-baseline justify-between border-t border-slate-200/70 pt-2"><span className="font-semibold text-slate-700">{t("Tổng cộng")}</span><span className="text-xl font-extrabold text-rose-600">{m(total)}</span></div>
        </div>
        {loggedIn ? (
          <button onClick={checkout} disabled={pending || items.length === 0} className="btn-primary w-full !py-3 disabled:opacity-50">
            {pending ? t("Đang xử lý...") : t("Thanh toán bằng ví")}
          </button>
        ) : (
          <Link href="/login" className="btn-primary block w-full !py-3 text-center">{t("Đăng nhập để thanh toán")}</Link>
        )}
        <Link href="/premium" className="block text-center text-sm font-bold text-brand-600 hover:text-brand-500">{t("Tiếp tục mua sắm")}</Link>
      </aside>
    </div>
  );
}
