"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useLang } from "@/components/lang";
import { useCartItems, setCartQty, removeCartLine, updateCartLine, patchCartLine, clearCart, type CartItem } from "@/components/cart";
import { DeliveryBadge } from "@/components/client";
import { checkoutCartAction, refreshCartPricesAction } from "@/app/actions/cart";

/** Công thức flash phía client — khớp applyFlashAmount phía server (lib/flash). */
const applyFlash = (amount: number, percent: number) =>
  !percent || percent <= 0 ? amount : Math.max(1, Math.round(amount * (1 - Math.min(90, percent) / 100)));

const lineKeyOf = (x: CartItem) => `${x.variantId}|${JSON.stringify(x.custom)}|${x.buyerInfo || ""}`;

type DoneLine = { name: string; variantName: string; code?: string; error?: string };

const ico = {
  cart: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M2.5 3.5h2l2.6 12h10.2l2.2-9.5H6" /></svg>,
  clipboard: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4.5" width="14" height="17" rx="2" /><path d="M9 4.5a3 3 0 0 1 6 0" /><path d="m9.5 14.5 2 2 3.5-4" /></svg>,
  check: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 12.5 5 5 10-11" /></svg>,
  box: <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8.2v7.6a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 15.8V8.2a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4a2 2 0 0 1 1 1.73Z" /><path d="m3.3 7.3 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>,
  receipt: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21Z" /><path d="M9 8h6M9 12h6" /></svg>,
  ticket: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-5Z" /><path d="M13 5v2M13 11v2M13 17v2" /></svg>,
  refresh: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>,
  trash: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" /></svg>,
  search: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>,
  list: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M8.5 6h12M8.5 12h12M8.5 18h12" /><circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none" /></svg>,
};

/** Thanh bước 1-2-3 trên đầu trang giỏ (theo ảnh mẫu Tín gửi 23:44): huy
 *  chương tròn nối bằng vạch — bước xong hiện dấu tick, bước hiện tại lên
 *  gradient thương hiệu, bước chưa tới xám. */
function Stepper({ step, t }: { step: number; t: (s: string) => string }) {
  const steps = [
    { icon: ico.cart, label: t("Giỏ hàng") },
    { icon: ico.clipboard, label: t("Xác nhận") },
    { icon: ico.check, label: t("Hoàn tất") },
  ];
  return (
    <div className="card px-5 py-5 sm:px-8">
      <div className="relative flex">
        <div className="absolute left-[18%] right-[18%] top-6 h-[3px] -translate-y-1/2 rounded bg-slate-200" />
        <div className="absolute left-[18%] top-6 h-[3px] -translate-y-1/2 rounded bg-gradient-to-r from-brand-600 to-cyan-500 transition-all duration-500" style={{ width: `${((step - 1) / 2) * 64}%` }} />
        {steps.map((s, i) => {
          const state = i + 1 < step ? "done" : i + 1 === step ? "active" : "todo";
          return (
            <div key={s.label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
              <span className={`flex h-12 w-12 items-center justify-center rounded-full ${state === "todo" ? "border border-slate-200 bg-slate-100 text-slate-400" : "bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 text-white shadow-lg shadow-brand-600/25"}`}>
                {state === "done" ? ico.check : s.icon}
              </span>
              <span className={`text-[13px] font-extrabold uppercase tracking-wide ${state === "todo" ? "text-slate-400" : "text-slate-900"}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Trang giỏ hàng 3 BƯỚC (lệnh Tín 2026-11-07 23:44 theo ảnh mẫu):
 *  1 Giỏ hàng (bước tiến, thẻ đầu giỏ + tìm trong giỏ, danh sách, tóm tắt,
 *  mã giảm giá, nút chính theo ngữ cảnh số dư) → 2 Xác nhận (xem lại + số dư
 *  sau thanh toán) → 3 Hoàn tất (mã đơn đã tạo + dòng lỗi giữ lại trong giỏ).
 *  Mọi cơ chế giữ nguyên: giỏ localStorage, thanh toán chạy từng dòng qua
 *  checkoutCartAction → createPremiumOrder, dòng lỗi ở lại giỏ kèm lý do. */
export function CartView({ loggedIn, balance, flash }: {
  loggedIn: boolean;
  balance: number | null;
  flash: { percent: number; productIds: number[] } | null;
}) {
  const { t, m } = useLang();
  const items = useCartItems();
  const [step, setStep] = useState(1);
  const [promo, setPromo] = useState("");
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doneOk, setDoneOk] = useState<DoneLine[]>([]);
  const [doneFail, setDoneFail] = useState<DoneLine[]>([]);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const flashFor = (x: CartItem) => (flash && (flash.productIds.length === 0 || flash.productIds.includes(x.productId)) ? flash.percent : 0);
  const unitPrice = (x: CartItem) => applyFlash(x.price, flashFor(x));
  const count = items.reduce((a, x) => a + x.qty, 0);
  const subtotal = items.reduce((a, x) => a + x.price * x.qty, 0);
  const total = items.reduce((a, x) => a + unitPrice(x) * x.qty, 0);
  const flashDiscount = subtotal - total;
  const enough = balance != null && balance >= total;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((x) => `${x.productName} ${x.variantName}`.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const checkout = () => {
    if (!items.length || pending) return;
    startTransition(async () => {
      const res = await checkoutCartAction(
        items.map((x) => ({ variantId: x.variantId, qty: x.qty, custom: x.custom, buyerInfo: x.buyerInfo || null })),
        promo
      );
      if (res.needLogin) { window.location.href = "/login"; return; }
      const oks: DoneLine[] = [];
      const fails: DoneLine[] = [];
      const errs: Record<string, string> = {};
      const toRemove: CartItem[] = [];
      res.results.forEach((r, i) => {
        const line = items[i];
        if (!line) return;
        if (r.ok) { oks.push({ name: line.productName, variantName: line.variantName, code: r.code || "" }); toRemove.push(line); }
        else { const msg = r.error || t("Đặt đơn thất bại"); fails.push({ name: line.productName, variantName: line.variantName, error: msg }); errs[lineKeyOf(line)] = msg; }
      });
      toRemove.forEach((line) => removeCartLine(line.variantId, line.custom, line.buyerInfo));
      setErrors(errs);
      setDoneOk(oks);
      setDoneFail(fails);
      setStep(3);
    });
  };

  const refreshPrices = () => {
    if (!items.length || pending) return;
    startTransition(async () => {
      const infos = await refreshCartPricesAction(items.map((x) => x.variantId));
      const byId = new Map(infos.map((i) => [i.variantId, i]));
      let removed = 0;
      for (const line of items) {
        const info = byId.get(line.variantId);
        if (!info) continue;
        if (info.gone) { removeCartLine(line.variantId, line.custom, line.buyerInfo); removed++; }
        else patchCartLine(line.variantId, { custom: line.custom, buyerInfo: line.buyerInfo }, { price: info.price, stockCap: info.stockCap, productName: info.productName, variantName: info.variantName });
      }
      setNote(t("Đã cập nhật giá mới nhất cho giỏ hàng") + (removed > 0 ? ` · ${removed} ${t("gói đã ngưng bán, đã xoá khỏi giỏ")}` : ""));
    });
  };

  const clearAll = () => {
    if (!items.length) return;
    if (window.confirm(t("Bạn có chắc muốn xoá toàn bộ giỏ hàng?"))) { clearCart(); setErrors({}); setNote(""); }
  };

  /* ---------- Giỏ trống: không bước tiến, thẻ trống sạch (bỏ gợi ý) ---------- */
  if (items.length === 0 && step === 1) {
    return (
      <div className="card p-10 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&>svg]:h-7 [&>svg]:w-7">{ico.cart}</span>
        <div className="mt-4 text-lg font-bold text-slate-900">{t("Giỏ hàng đang trống")}</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t("Thêm sản phẩm Premium vào giỏ rồi quay lại đây để thanh toán một lần.")}</p>
        <Link href="/premium" className="btn-primary mt-5 inline-block">{t("Tiếp tục mua sắm")}</Link>
      </div>
    );
  }

  /* ---------- Bước 3: Hoàn tất ---------- */
  if (step === 3) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <Stepper step={3} t={t} />
        <div className="card p-6 text-center sm:p-8">
          {doneOk.length > 0 ? (
            <>
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 [&>svg]:h-8 [&>svg]:w-8">{ico.check}</span>
              <div className="mt-4 text-xl font-extrabold text-slate-900">{t("Đặt hàng thành công")}</div>
              <p className="mt-1.5 text-sm text-slate-500">{doneOk.length} {t("sản phẩm")} · {doneOk.map((d) => d.code).join(", ")}</p>
            </>
          ) : (
            <>
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </span>
              <div className="mt-4 text-xl font-extrabold text-slate-900">{t("Đặt đơn thất bại")}</div>
              <p className="mt-1.5 text-sm text-slate-500">{t("Không có đơn nào được tạo — các dòng dưới đây vẫn còn trong giỏ để bạn thử lại.")}</p>
            </>
          )}
        </div>
        {doneOk.length > 0 && (
          <div className="card divide-y divide-slate-100">
            {doneOk.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-900">{d.name}</div>
                  <div className="text-sm text-slate-500">{d.variantName}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">{d.code}</span>
                  <Link href="/dashboard/don-premium" className="font-bold text-brand-600 hover:text-brand-500">{t("Xem chi tiết")}</Link>
                </div>
              </div>
            ))}
          </div>
        )}
        {doneFail.length > 0 && (
          <div className="card p-5">
            <div className="mb-3 font-extrabold text-rose-600">{t("Chưa đặt được")}</div>
            <div className="space-y-2.5">
              {doneFail.map((d, i) => (
                <div key={i} className="rounded-xl bg-rose-50 px-4 py-3 text-sm">
                  <span className="font-bold text-slate-900">{d.name} — {d.variantName}</span>
                  <span className="block text-rose-600">{d.error}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="btn-ghost mt-4 w-full !py-3">{t("Quay lại giỏ hàng")}</button>
          </div>
        )}
        {doneOk.length > 0 && doneFail.length === 0 && (
          <Link href="/dashboard/don-premium" className="btn-primary block w-full !py-3.5 text-center">{t("Xem đơn hàng đã đặt")}</Link>
        )}
      </div>
    );
  }

  /* ---------- Bước 2: Xác nhận ---------- */
  if (step === 2) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <Stepper step={2} t={t} />
        <div className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5 font-extrabold text-slate-900"><span className="text-brand-600">{ico.clipboard}</span>{t("Xác nhận")}</div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((x) => (
              <div key={lineKeyOf(x)} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-slate-900">{x.productName}</div>
                  <div className="truncate text-[13px] text-slate-500">{x.variantName} × {x.qty}</div>
                </div>
                <span className="shrink-0 font-extrabold text-slate-900">{m(unitPrice(x) * x.qty)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 px-4 py-3.5 text-[15px]">
            <div className="flex justify-between"><span className="text-slate-500">{t("Tạm tính")}</span><span className="font-bold text-slate-900">{m(subtotal)}</span></div>
            {flashDiscount > 0 && <div className="flex justify-between font-semibold text-emerald-600"><span>{t("Giảm giá")}</span><span>−{m(flashDiscount)}</span></div>}
            <div className="flex justify-between border-t border-dashed border-slate-200 pt-2.5"><span className="font-bold text-slate-900">{t("Tổng cộng")}</span><span className="text-lg font-extrabold text-rose-600">{m(total)}</span></div>
            {balance != null && (
              <>
                <div className="flex justify-between"><span className="text-slate-500">{t("Số dư ví")}</span><span className="font-bold text-slate-900">{m(balance)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">{t("Sau thanh toán còn")}</span><span className={`font-bold ${balance - total < 0 ? "text-rose-600" : "text-slate-900"}`}>{m(balance - total)}</span></div>
              </>
            )}
          </div>
          {balance != null && !enough && <p className="mt-3 text-sm font-medium text-rose-600">{t("Số dư không đủ, vui lòng nạp thêm tiền")}</p>}
          <div className="mt-5 flex gap-2.5">
            <button onClick={() => setStep(1)} className="btn-ghost !px-5 !py-3.5">{t("Quay lại")}</button>
            {loggedIn ? (
              <button onClick={checkout} disabled={pending || !enough} className="flex-1 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:opacity-95 disabled:opacity-50">
                {pending ? t("Đang xử lý...") : t("Thanh toán bằng ví")}
              </button>
            ) : (
              <Link href="/login" className="flex-1 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-3.5 text-center text-base font-extrabold text-white shadow-lg shadow-brand-600/25">{t("Đăng nhập để thanh toán")}</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Bước 1: Giỏ hàng ---------- */
  return (
    <div className="space-y-4 sm:space-y-5">
      <Stepper step={1} t={t} />

      {/* Thẻ đầu giỏ */}
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-brand-600 to-cyan-500 opacity-90 sm:w-36" />
        <div className="relative flex items-center gap-3.5">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-700 to-cyan-500 text-white shadow-lg shadow-brand-600/25 [&>svg]:h-6 [&>svg]:w-6">
            {ico.cart}
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">{count}</span>
          </span>
          <div>
            <div className="text-xl font-extrabold text-slate-900">{t("Giỏ hàng")}</div>
            <div className="text-sm text-slate-500">{count} {t("sản phẩm")}</div>
          </div>
        </div>
        <label className="relative mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-400 transition focus-within:border-brand-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-100">
          {ico.search}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Tìm trong giỏ hàng...")} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
        </label>
      </div>

      {/* Danh sách sản phẩm */}
      <div className="card p-3.5 sm:p-5">
        <div className="mb-1 flex items-center gap-2.5 px-1 font-extrabold text-slate-900"><span className="text-brand-600">{ico.list}</span>{t("Danh sách sản phẩm")} ({items.length})</div>
        <div className="divide-y divide-slate-100">
          {visible.map((x) => {
            const key = lineKeyOf(x);
            const err = errors[key];
            const up = unitPrice(x);
            return (
              <div key={key} className="relative py-4">
                <button type="button" aria-label={t("Xoá khỏi giỏ")} onClick={() => removeCartLine(x.variantId, x.custom, x.buyerInfo)} className="absolute right-0 top-3.5 flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
                <div className="flex gap-3.5">
                  {x.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.image} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-xl font-black text-white">{x.productName.charAt(0)}</div>
                  )}
                  <div className="min-w-0 flex-1 pr-8">
                    <div className="line-clamp-2 font-bold leading-snug text-slate-900">{x.productName}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">{ico.box}<span className="min-w-0 break-words">{x.variantName}</span></div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {x.delivery && <DeliveryBadge type={x.delivery === "FAST" ? "FAST" : "SLOW"} t={t} />}
                      {x.stockCap !== null && <span className="text-xs text-slate-400">{t("Còn")} {x.stockCap} {t("trong kho")}</span>}
                    </div>
                  </div>
                </div>
                {Object.keys(x.custom).length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.entries(x.custom).map(([label, value]) => (
                      <label key={label} className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
                        <input className="inp !py-2" value={value} onChange={(e) => updateCartLine(x.variantId, { custom: x.custom, buyerInfo: x.buyerInfo }, { custom: { ...x.custom, [label]: e.target.value } })} />
                      </label>
                    ))}
                  </div>
                )}
                {x.buyerInfo !== undefined && x.buyerInfo !== null && Object.keys(x.custom).length === 0 && (
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">{t("Thông tin bàn giao")}</span>
                    <input className="inp !py-2" value={x.buyerInfo} onChange={(e) => updateCartLine(x.variantId, { custom: x.custom, buyerInfo: x.buyerInfo }, { buyerInfo: e.target.value })} />
                  </label>
                )}
                <div className="mt-3 flex items-end justify-between gap-3">
                  <span>
                    {flashFor(x) > 0 && <span className="mr-2 text-sm text-slate-400 line-through">{m(x.price)}</span>}
                    <span className="text-lg font-extrabold text-rose-600">{m(up)}</span>
                  </span>
                  <div className="flex items-center rounded-full bg-slate-100 p-1">
                    <button type="button" aria-label={t("Giảm số lượng")} onClick={() => setCartQty(x.variantId, x.custom, x.qty - 1, x.buyerInfo)} className="flex h-8 w-9 items-center justify-center rounded-full font-bold text-slate-600 transition hover:bg-white">−</button>
                    <span className="w-10 text-center font-extrabold text-slate-900">{x.qty}</span>
                    <button type="button" aria-label={t("Tăng số lượng")} onClick={() => setCartQty(x.variantId, x.custom, x.qty + 1, x.buyerInfo)} className="flex h-8 w-9 items-center justify-center rounded-full font-bold text-slate-600 transition hover:bg-white">+</button>
                  </div>
                </div>
                {err && <p className="mt-2 text-sm font-medium text-rose-600">{err}</p>}
              </div>
            );
          })}
          {visible.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("Không tìm thấy sản phẩm trong giỏ")}</p>}
        </div>
      </div>

      {/* Tóm tắt đơn hàng */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2.5 bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 px-5 py-3.5 font-extrabold text-white"><span className="[&>svg]:h-5 [&>svg]:w-5">{ico.receipt}</span>{t("Tóm tắt đơn hàng")}</div>
        <div className="space-y-2 px-5 py-5 text-[15px]">
          <div className="flex justify-between"><span className="text-slate-500">{t("Tạm tính")} ({count} {t("sản phẩm")})</span><span className="font-bold text-slate-900">{m(subtotal)}</span></div>
          {flashDiscount > 0 && <div className="flex justify-between font-semibold text-emerald-600"><span>{t("Giảm giá")}</span><span>−{m(flashDiscount)}</span></div>}
          <div className="flex items-baseline justify-between border-t border-dashed border-slate-200 pt-3"><span className="font-bold text-slate-900">{t("Tổng cộng")}</span><span className="text-xl font-extrabold text-rose-600">{m(total)}</span></div>
        </div>
      </div>

      {/* Mã giảm giá */}
      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-4 font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
          <span className="text-brand-600">{ico.ticket}</span>{t("Mã giảm giá")}
          <svg viewBox="0 0 24 24" className="ml-auto h-5 w-5 text-slate-400 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9.5 6 6 6-6" /></svg>
        </summary>
        <div className="px-5 pb-5">
          <input className="inp uppercase" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t("VD: SALE10")} autoComplete="off" />
          <p className="mt-1.5 text-xs text-slate-400">{t("Mã áp dụng cho từng đơn khi thanh toán.")}</p>
        </div>
      </details>

      {/* Hành động */}
      <div className="space-y-2.5">
        {!loggedIn ? (
          <Link href="/login" className="block rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-4 text-center text-base font-extrabold text-white shadow-lg shadow-brand-600/25">{t("Đăng nhập để thanh toán")}</Link>
        ) : !enough ? (
          <Link href="/dashboard/nap-tien" className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-4 text-base font-extrabold text-white shadow-lg shadow-brand-600/25">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {t("Nạp thêm tiền")}
          </Link>
        ) : (
          <button onClick={() => setStep(2)} className="w-full rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-4 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:opacity-95">{t("Xác nhận đơn hàng")}</button>
        )}
        {note && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-700">{note}</p>}
        <div className="card space-y-2.5 p-3">
          <Link href="/dashboard/don-premium" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 font-bold text-brand-600 transition hover:bg-brand-50">{ico.receipt}{t("Xem đơn hàng đã đặt")}</Link>
          <button onClick={refreshPrices} disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 py-3 font-bold text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50">{ico.refresh}{t("Cập nhật giá")}</button>
          <button onClick={clearAll} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 font-bold text-slate-500 transition hover:bg-slate-50">{ico.trash}{t("Xóa tất cả")}</button>
        </div>
      </div>
    </div>
  );
}
