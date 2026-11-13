"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { num, type PremiumCustomField } from "@/lib/format";
import { I, PLATFORM_COLORS, StarIcon } from "@/components/ui";
import { OrderSupportActions } from "@/components/order-support-actions";
import { warrantyAction } from "@/app/actions/user";
import { useLang } from "@/components/lang";
import { addToCart } from "@/components/cart";
export type PremiumPromoPreview = { code: string; type: string; value: number; maxDiscount: number; minOrder: number };

/** Công thức flash sale phía client — khớp hệt applyFlashAmount phía server (lib/flash). */
const applyFlashClient = (amount: number, percent: number) =>
  !percent || percent <= 0 ? amount : Math.max(1, Math.round(amount * (1 - Math.min(90, percent) / 100)));

/** Tiêu đề mục đánh số dùng chung cho các form đặt hàng (PremiumBuyForm). */
function OrderPanelTitle({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[15px] font-extrabold text-brand-700">{n}</span>
      <span className="text-[17px] font-extrabold text-slate-900">{label}</span>
    </div>
  );
}

export function DeliveryBadge({ type, t }: { type: "FAST" | "SLOW"; t: (s: string) => string }) {
  return type === "FAST" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 [&>svg]:h-3 [&>svg]:w-3">
      {I.truck}
      {t("Giao nhanh")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
      {t("Giao chậm")}
    </span>
  );
}

export function PremiumBuyForm({ variants, slug, fulfillment, action, fields, note, maxQty = 50, backBase, layout, productImage, productColor, belowVariants, promos, flashPct, cartProduct }: {
  variants: { id: number; name: string; price: number; warrantyDays: number; stock: number; delivery?: "FAST" | "SLOW"; soldOut?: boolean; stockQty?: number | null }[];
  slug: string;
  fulfillment: string;
  action: (formData: FormData) => void;
  fields?: PremiumCustomField[]; // trường tuỳ chỉnh của sản phẩm — có thì thay ô thông tin bàn giao mặc định
  note?: string | null; // hướng dẫn riêng của sản phẩm (hộp xanh phía trên các ô nhập)
  maxQty?: number; // trần số lượng mỗi đơn — lấy từ cấu hình hệ thống
  backBase?: string; // gốc đường dẫn trang chi tiết (/premium hoặc /dashboard/premium) để trả về đúng khung khi có lỗi
  layout?: "stacked" | "split"; // split = bố cục shopkey 73/27 (hero 31/69, hộp đặt hàng dính cột phải) — lệnh Tín 2026-11-08 khôi phục, thay bố cục một cột kiểu Telegram của fix5 WS4 (đã gỡ); stacked = dạng cũ ở website con
  productImage?: string | null;
  productColor?: string;
  belowVariants?: React.ReactNode; // khối hiển thị dưới danh sách gói ở cột trái (bố cục split): thông tin / bảo hành / hướng dẫn
  promos?: PremiumPromoPreview[]; // mã giảm giá đang hiệu lực (chỉ để XEM TRƯỚC số tiền giảm trong hộp tóm tắt — server vẫn chốt lại khi đặt đơn)
  flashPct?: number; // % flash sale đang áp cho sản phẩm này (0/không truyền = không có) — hiển thị giá đã giảm + xem trước dòng giảm, server chốt lại khi đặt đơn
  cartProduct?: { id: number; name: string; groups: Record<number, string | null> }; // bật nút thêm vào giỏ (nhóm Telegram không vào giỏ)
}) {
  const { t, td, m } = useLang();
  const [variantId, setVariantId] = useState(() => (variants.find((x) => !x.soldOut) || variants[0])?.id);
  const [qty, setQty] = useState(1);
  const [promoCode, setPromoCode] = useState("");
  const v = variants.find((x) => x.id === variantId) || variants[0];
  const formRef = useRef<HTMLFormElement>(null);
  const cartGroup = cartProduct && v ? cartProduct.groups[v.id] : null;
  const cartable = !!cartProduct && !!v && !(cartGroup || "").startsWith("telegram_");
  const addCurrentToCart = () => {
    if (!cartProduct || !v) return;
    const custom: Record<string, string> = {};
    let buyerInfo: string | null = null;
    const form = formRef.current;
    if (form) {
      (fields || []).forEach((f, i) => {
        const el = form.elements.namedItem(`cf_${i}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (el && el.value) custom[f.label] = el.value;
      });
      const bi = form.elements.namedItem("buyerInfo") as HTMLInputElement | null;
      if (bi && bi.value) buyerInfo = bi.value;
    }
    addToCart({
      variantId: v.id, productId: cartProduct.id, productName: cartProduct.name, variantName: v.name,
      image: productImage || null, price: v.price, qty,
      custom, buyerInfo,
      stockCap: fulfillment === "AUTO_STOCK" ? (v.stock || 0) : (v.stockQty ?? null),
      delivery: v.delivery ?? null,
      group: cartGroup,
    });
  };

  const total = (v?.price || 0) * qty;
    // Xem trước số tiền giảm — đúng thứ tự server chốt khi đặt đơn: flash sale
    // giảm TRƯỚC trên Tạm tính, mã giảm giá tính trên số tiền ĐÃ trừ flash
    // (công thức checkPromo). Dòng "Giảm giá" trong hộp tóm tắt = flash + mã.
    const afterFlash = applyFlashClient(total, flashPct || 0);
    const promoRow = (promos || []).find((p) => p.code === promoCode.trim().toUpperCase());
    let promoDiscount = 0;
    if (promoRow && afterFlash > 0 && afterFlash >= promoRow.minOrder) {
      promoDiscount = promoRow.type === "PERCENT" ? Math.floor((afterFlash * promoRow.value) / 100) : promoRow.value;
      if (promoRow.type === "PERCENT" && promoRow.maxDiscount > 0) promoDiscount = Math.min(promoDiscount, promoRow.maxDiscount);
      promoDiscount = Math.max(0, Math.min(promoDiscount, afterFlash - 1));
    }
    const discount = (total - afterFlash) + promoDiscount;
    const grandTotal = afterFlash - promoDiscount;
    const infoFields = (
      <>
        {fields && fields.length > 0 ? (
          <div className="space-y-3.5">
            {fields.map((f, i) => (
              <div key={i}>
                <label className="lbl">{f.label}{f.required ? " *" : ""}</label>
                {f.type === "textarea" ? (
                  <textarea className="inp" name={`cf_${i}`} rows={3} required={f.required} placeholder={f.placeholder || ""} />
                ) : f.type === "select" ? (
                  <select className="inp" name={`cf_${i}`} required={f.required} defaultValue="">
                    <option value="" disabled>{t("-- Chọn --")}</option>
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className="inp" name={`cf_${i}`} required={f.required} placeholder={f.placeholder || ""} />
                )}
              </div>
            ))}
          </div>
        ) : (fulfillment === "MANUAL" || fulfillment === "API") ? (
          <div>
            <label className="lbl">{t("Email / tài khoản của bạn để bàn giao *")}</label>
            <input className="inp" name="buyerInfo" required placeholder={t("Vd: email nhận gói / tài khoản cần nâng cấp")} />
            <p className="mt-1.5 text-xs text-slate-400">{fulfillment === "API" ? t("Thông tin này được gửi kèm đơn sang nhà cung cấp để bàn giao gói.") : t("Gói này được nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email, không cần mật khẩu.")}</p>
          </div>
        ) : (
          <div>
            <label className="lbl">{t("Ghi chú (tuỳ chọn)")}</label>
            <input className="inp" name="buyerInfo" placeholder={t("Email nhận tài khoản (mặc định dùng email tài khoản của bạn)")} />
          </div>
        )}
      </>
    );
  if (layout === "split") {
    return (
      <form ref={formRef} action={action} className="flex flex-col gap-8 lg:contents">
        <input type="hidden" name="slug" value={slug} />
        {backBase ? <input type="hidden" name="returnTo" value={`${backBase}/${slug}`} /> : null}
        <input type="hidden" name="variantId" value={v?.id || ""} />
        <div className="order-1 lg:col-start-1">
          {/* Khối chọn gói dựng lại theo mẫu shopkey (lệnh Tín 2026-11-09):
              một thẻ có hàng tiêu đề riêng, các gói là HÀNG trong cùng thẻ
              ngăn nhau bằng đường kẻ mảnh; gói đang chọn có nền brand nhạt +
              vạch brand ở mép trái + radio đầy; gói hết hàng mờ + nhãn pill
              "Hết hàng" và bị khoá chọn. Tên gói hiện TRỌN (không cắt). */}
          <section className="card overflow-hidden">
            <div className="flex items-center border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-extrabold text-slate-900">{t("Chọn gói sản phẩm")}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {variants.map((x) => {
                const selected = x.id === v?.id;
                return (
                  <button type="button" key={x.id} disabled={!!x.soldOut} onClick={() => setVariantId(x.id)}
                    className={`relative flex w-full items-center gap-3 px-5 py-3.5 text-left transition ${x.soldOut ? "cursor-not-allowed bg-slate-50/70" : selected ? "bg-brand-50/80" : "bg-white hover:bg-slate-50"}`}>
                    {selected && !x.soldOut && <span className="absolute inset-y-0 left-0 w-1 bg-brand-600" />}
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${x.soldOut ? "border-slate-200" : selected ? "border-brand-600" : "border-slate-300"}`}>
                      {selected && !x.soldOut && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block break-words text-[15px] font-bold ${x.soldOut ? "text-slate-400" : "text-slate-900"}`}>{x.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs text-slate-500">
                          {x.warrantyDays ? <>{t("Bảo hành")} {x.warrantyDays} {t("ngày")}</> : t("Không bảo hành")}
                          {fulfillment === "AUTO_STOCK" ? (x.stock > 0 ? <>{t(" · Còn ")}{x.stock}{t(" trong kho")}</> : t(" · Hết kho — giao tay")) : fulfillment === "API" ? t(" · Giao qua nhà cung cấp") : t(" · Giao thủ công")}
                          {x.stockQty != null && fulfillment !== "AUTO_STOCK" && !x.soldOut ? <>{t(" · Còn ")}{x.stockQty}{t(" trong kho")}</> : null}
                        </span>
                        {x.delivery && <DeliveryBadge type={x.delivery} t={t} />}
                      </span>
                    </span>
                    {x.soldOut ? (
                      <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">{t("Hết hàng")}</span>
                    ) : (
                      <span className="shrink-0 text-right">
                        {flashPct ? (
                          <>
                            <span className="block text-xs font-semibold text-slate-400 line-through">{m(x.price)}</span>
                            <span className="block text-base font-extrabold text-rose-600">{m(applyFlashClient(x.price, flashPct))}</span>
                          </>
                        ) : (
                          <span className="block text-base font-extrabold text-rose-600">{m(x.price)}</span>
                        )}
                        {fulfillment === "AUTO_STOCK" && x.stock > 0 && (
                          <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-bold text-brand-600 [&>svg]:h-3.5 [&>svg]:w-3.5">
                            {I.truck}
                            {t("Giao ngay")}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        {belowVariants && <div className="order-2 lg:col-start-1">{belowVariants}</div>}
        <div className="card order-3 space-y-4 p-5 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-24">
          <div>
            <label className="lbl">{t("Số lượng")}</label>
            <div className="flex h-[46px] items-stretch justify-center lg:justify-start">
              <button type="button" aria-label={t("Giảm số lượng")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 rounded-l-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">−</button>
              <input className="w-16 border-y border-slate-300 bg-transparent text-center text-lg font-bold text-slate-900 outline-none" name="quantity" type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
              <button type="button" aria-label={t("Tăng số lượng")} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-11 rounded-r-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">+</button>
            </div>
          </div>
          {note && <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">{note}</div>}
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400">{t("Thông tin đặt hàng")}</div>
            {infoFields}
          </div>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
              {t("Bạn có mã giảm giá?")}
              <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">{I.chevron}</span>
            </summary>
            <input className="inp mt-2 uppercase" name="promoCode" placeholder={t("VD: SALE10")} autoComplete="off" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
          </details>
          <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>{t("Tạm tính")}</span><span className="font-semibold text-slate-700">{m(total)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between font-semibold text-emerald-600"><span>{t("Giảm giá")}</span><span>−{m(discount)}</span></div>
            )}
            <div className="flex items-baseline justify-between border-t border-slate-200/70 pt-2"><span className="font-semibold text-slate-700">{t("Tổng cộng")}</span><span className="text-xl font-extrabold text-rose-600">{m(grandTotal)}</span></div>
          </div>
          <div className="text-xs text-slate-400">
            {fulfillment === "AUTO_STOCK" ? <>{t("Kho hàng:")} {v?.stock || 0} {t("sản phẩm")}</> : fulfillment === "API" ? t("Giao tự động qua nhà cung cấp") : t("Nâng cấp thủ công trên tài khoản của bạn")}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-3">{t("Đặt hàng ngay")}</button>
            {cartable && <CartDetailBtn onAdd={addCurrentToCart} />}
          </div>
        </div>
      </form>
    );
  }
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {backBase ? <input type="hidden" name="returnTo" value={`${backBase}/${slug}`} /> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {variants.map((x) => (
          <button type="button" key={x.id} onClick={() => setVariantId(x.id)}
            className={`text-left rounded-xl border-2 px-3.5 py-3 transition ${x.id === v?.id ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-slate-900 text-[15px]">{x.name}</span>
              <span className="whitespace-nowrap text-right">
                {flashPct ? <span className="mr-1.5 text-xs font-semibold text-slate-400 line-through">{m(x.price)}</span> : null}
                <span className="text-brand-700 font-extrabold">{m(applyFlashClient(x.price, flashPct || 0))}</span>
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {x.warrantyDays ? <>{t("Bảo hành")} {x.warrantyDays} {t("ngày")}</> : t("Không bảo hành")}
              {fulfillment === "AUTO_STOCK" ? (x.stock > 0 ? <>{t(" · Còn ")}{x.stock}{t(" trong kho")}</> : t(" · Hết kho — giao tay")) : fulfillment === "API" ? t(" · Giao qua nhà cung cấp") : t(" · Giao thủ công")}
            </div>
          </button>
        ))}
      </div>
      <input type="hidden" name="variantId" value={v?.id || ""} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full lg:w-auto">
          <label className="lbl">{t("Số lượng")}</label>
          <div className="flex items-stretch h-[46px] justify-center lg:justify-start">
            <button type="button" aria-label={t("Giảm số lượng")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 rounded-l-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">−</button>
            <input className="w-16 border-y border-slate-300 bg-transparent text-center text-lg font-bold text-slate-900 outline-none" name="quantity" type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
            <button type="button" aria-label={t("Tăng số lượng")} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-11 rounded-r-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">+</button>
          </div>
        </div>
        <div className="self-end text-right lg:self-auto">
          <div className="text-xs text-slate-500">{t("Tổng tiền")}</div>
          <div className="text-2xl font-extrabold text-brand-700">{m(applyFlashClient((v?.price || 0) * qty, flashPct || 0))}</div>
        </div>
      </div>
      {note && (
        <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-900 leading-relaxed">{note}</div>
      )}
      {fields && fields.length > 0 ? (
        <div className="space-y-3.5">
          {fields.map((f, i) => (
            <div key={i}>
              <label className="lbl">{f.label}{f.required ? " *" : ""}</label>
              {f.type === "textarea" ? (
                <textarea className="inp" name={`cf_${i}`} rows={3} required={f.required} placeholder={f.placeholder || ""} />
              ) : f.type === "select" ? (
                <select className="inp" name={`cf_${i}`} required={f.required} defaultValue="">
                  <option value="" disabled>{t("-- Chọn --")}</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className="inp" name={`cf_${i}`} required={f.required} placeholder={f.placeholder || ""} />
              )}
            </div>
          ))}
        </div>
      ) : (fulfillment === "MANUAL" || fulfillment === "API") && (
        <div>
          <label className="lbl">{t("Email / tài khoản của bạn để bàn giao *")}</label>
          <input className="inp" name="buyerInfo" required placeholder={t("Vd: email nhận gói / tài khoản cần nâng cấp")} />
          <p className="text-xs text-slate-400 mt-1.5">{fulfillment === "API" ? t("Thông tin này được gửi kèm đơn sang nhà cung cấp để bàn giao gói.") : t("Gói này được nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email, không cần mật khẩu.")}</p>
        </div>
      )}
      {!fields?.length && fulfillment === "AUTO_STOCK" && (
        <div>
          <label className="lbl">{t("Ghi chú (tuỳ chọn)")}</label>
          <input className="inp" name="buyerInfo" placeholder={t("Email nhận tài khoản (mặc định dùng email tài khoản của bạn)")} />
        </div>
      )}
      <div>
        <label className="lbl">{t("Mã giảm giá (nếu có)")}</label>
        <input className="inp uppercase" name="promoCode" placeholder={t("VD: SALE10")} autoComplete="off" />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 !py-3">{t("Mua ngay bằng số dư")}</button>
        {cartable && <CartDetailBtn onAdd={addCurrentToCart} />}
      </div>
    </form>
  );
}

/** Trình soạn TRƯỜNG TUỲ CHỈNH cho sản phẩm premium (admin): mỗi sản phẩm định nghĩa
 *  các ô khách phải điền khi mua — nhãn, kiểu ô, bắt buộc hay không, gợi ý, lựa chọn. */
export function PremiumFieldsEditor({ initial }: { initial: PremiumCustomField[] }) {
  const { t } = useLang();
  const [rows, setRows] = useState<PremiumCustomField[]>(initial);
  const set = (i: number, patch: Partial<PremiumCustomField>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <input type="hidden" name="customFields" value={JSON.stringify(rows.filter((r) => r.label.trim()))} />
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
            <div className="flex gap-2">
              <input className="inp flex-1" placeholder={t("Nhãn trường — vd: Gmail cần nâng cấp")} value={r.label}
                onChange={(e) => set(i, { label: e.target.value })} />
              <button type="button" className="btn-ghost btn-sm !text-rose-600 shrink-0"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{t("Xoá")}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="inp" value={r.type} onChange={(e) => set(i, { type: e.target.value as PremiumCustomField["type"] })}>
                <option value="text">{t("Ô nhập 1 dòng")}</option>
                <option value="textarea">{t("Ô nhập nhiều dòng")}</option>
                <option value="select">{t("Danh sách chọn")}</option>
              </select>
              <input className="inp" placeholder={t("Chữ gợi ý trong ô")} value={r.placeholder || ""}
                onChange={(e) => set(i, { placeholder: e.target.value })} />
            </div>
            {r.type === "select" && (
              <input className="inp" placeholder={t("Các lựa chọn, cách nhau dấu phẩy — vd: Android, iOS, TV")}
                value={(r.options || []).join(", ")}
                onChange={(e) => set(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="w-4 h-4" checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} />
              {t("Bắt buộc khách điền")}
            </label>
          </div>
        ))}
      </div>
      {rows.length < 8 && (
        <button type="button" className="btn-ghost btn-sm mt-3"
          onClick={() => setRows((rs) => [...rs, { label: "", type: "text", required: true }])}>
          {t("+ Thêm trường tuỳ chỉnh")}
        </button>
      )}
    </div>
  );
}

export function CopyBtn({ text, label = "Sao chép" }: { text: string; label?: string }) {
  const { t } = useLang();
  const [ok, setOk] = useState(false);
  return (
    <button type="button" title={t(label)} aria-label={t(label)}
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className={`inline-flex items-center justify-center w-[30px] h-[30px] shrink-0 rounded-lg border transition ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-500 hover:text-brand-600 hover:border-brand-300"}`}>
      {ok ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

/** Ô hiện API key: mặc định che giữa (6 ký tự đầu + 4 ký tự cuối), nút con mắt
 *  để hiện/ẩn toàn bộ + nút sao chép (luôn chép bản đầy đủ). Thuần trình bày. */
export function ApiKeyReveal({ value }: { value: string }) {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  const masked = value.length > 12 ? `${value.slice(0, 6)}••••••••••${value.slice(-4)}` : "••••••••••";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input className="inp min-w-0 flex-1 font-mono" readOnly value={show ? value : masked} onFocus={(e) => e.target.select()} />
      <button type="button" title={show ? t("Ẩn bớt") : t("Hiện toàn bộ key")} aria-label={show ? t("Ẩn bớt") : t("Hiện toàn bộ key")}
        onClick={() => setShow((v) => !v)}
        className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-600">
        {show ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.5 9.5 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-3.79 4.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20M9.88 9.88a3 3 0 1 0 4.24 4.24" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
      <CopyBtn text={value} />
    </div>
  );
}

/* ---------- Thẻ đơn Premium + popup chi tiết (kiểu thatim: Sản phẩm đã mua) ---------- */
export type PremiumOrderCard = {
  id: number; code: string; name: string; variant: string; desc: string;
  total: number; quantity: number; status: string; statusLabel: string; statusCls: string;
  created: string; updated: string; delivery: string; deliveryType: "FAST" | "SLOW"; buyerInfo: string; warrantyUntil: string | null;
};
const dtf = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false });

export function PremiumOrderCards({ orders }: { orders: PremiumOrderCard[] }) {
  const { t, td, m } = useLang();
  const [sel, setSel] = useState<PremiumOrderCard | null>(null);
  return (
    <div className="space-y-3.5">
      {orders.map((o) => (
        <div key={o.id} className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm font-black text-slate-900">{o.code}</span>
              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.statusCls}`}>{t(o.statusLabel)}</span>
              <DeliveryBadge type={o.deliveryType} t={t} />
            </div>
            <div className="font-black text-slate-900">{m(o.total)}</div>
          </div>
          <div className="mt-3.5 border-t border-slate-100 pt-3.5">
            <div className="flex items-center gap-3.5">
              <span className="w-11 h-11 shrink-0 rounded-xl bg-brand-600 text-white flex items-center justify-center font-black">{o.name.charAt(0).toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 truncate">{o.name} ({o.variant})</div>
                {o.desc && <div className="text-[13px] text-slate-500 truncate">{o.desc}</div>}
                <div className="mt-0.5 text-xs text-slate-400">{t("Số lượng")}: {o.quantity}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{dtf(o.created)}</span>
              <button type="button" onClick={() => setSel(o)} className="btn-dark btn-sm shrink-0">{t("Chi tiết")}</button>
            </div>
          </div>
        </div>
      ))}
      {sel && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSel(null)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Thẻ header kiểu Telegram: mã đơn mono + sao chép + trạng thái + ngày tạo */}
            <div className="sticky top-0 z-10 border-b border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{t("Chi tiết đơn hàng")}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-lg font-black leading-tight text-slate-900">{sel.code}</span>
                    <CopyBtn text={sel.code} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${sel.statusCls}`}>{t(sel.statusLabel)}</span>
                    <span className="text-xs text-slate-400">{dtf(sel.created)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setSel(null)} aria-label={t("Đóng")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-rose-600 text-white transition hover:bg-rose-500">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4 sm:p-5 sm:space-y-5">
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <OrderPanelTitle n={1} label={t("Thông tin đơn hàng")} />
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Tên sản phẩm:")}</span><span className="min-w-0 break-words text-right font-bold text-slate-900">{sel.name} ({sel.variant})</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Số lượng")}</span><span className="font-bold text-slate-900">{sel.quantity}</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Số tiền thanh toán:")}</span><span className="font-bold text-slate-900">{m(sel.total)}</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Trạng thái:")}</span><span className="font-bold text-slate-900">{t(sel.statusLabel)}</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Loại giao hàng")}</span><span className="font-bold text-slate-900">{sel.deliveryType === "FAST" ? t("Giao nhanh") : t("Giao chậm")}</span></div>
                  {sel.warrantyUntil && (
                    <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Bảo hành đến")}</span><span className="font-bold text-slate-900">{dtf(sel.warrantyUntil)}</span></div>
                  )}
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Ghi chú:")}</span><span className="min-w-0 whitespace-pre-wrap break-words text-right font-bold text-slate-900">{sel.buyerInfo || "."}</span></div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <OrderPanelTitle n={2} label={t("Thông tin tài khoản:")} />
                <div className="mt-4">
                  {sel.delivery ? (
                    <div>
                      <textarea readOnly value={sel.delivery} rows={Math.min(8, sel.delivery.split("\n").length + 1)} className="inp font-mono !text-[13px] w-full" />
                      <div className="mt-2"><CopyBtn text={sel.delivery} label="Sao chép" /></div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{sel.status === "PENDING" ? t("Đơn đang chờ giao.") : t("Chưa có nội dung giao.")}</p>
                  )}
                  {(sel.status === "DELIVERED" || sel.status === "COMPLETED") && sel.warrantyUntil && new Date(sel.warrantyUntil) > new Date() && (
                    <form action={warrantyAction} className="mt-4 flex flex-wrap gap-2">
                      <input type="hidden" name="orderId" value={sel.id} />
                      <input className="inp flex-1 min-w-[200px]" name="note" placeholder={t("Mô tả lỗi để yêu cầu bảo hành")} />
                      <button className="btn-ghost btn-sm !py-2.5">{t("Yêu cầu bảo hành")}</button>
                    </form>
                  )}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <OrderPanelTitle n={3} label={t("Lịch sử xử lý")} />
                <ol className="relative ml-1.5 mt-4 space-y-4 border-l-2 border-slate-100">
                  {(sel.status === "DELIVERED" || sel.status === "COMPLETED") && (
                    <li className="pl-4 relative"><span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-emerald-500" /><div className="text-sm font-semibold text-slate-800">{t("Đã giao hàng")}</div><div className="text-xs text-slate-400">{dtf(sel.updated)}</div></li>
                  )}
                  <li className="pl-4 relative"><span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-slate-300" /><div className="text-sm font-semibold text-slate-800">{t("Đã tạo đơn hàng")}</div><div className="text-xs text-slate-400">{dtf(sel.created)}</div></li>
                </ol>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="text-[17px] font-extrabold text-slate-900">{t("Hỗ trợ đơn này")}</div>
                <OrderSupportActions code={sel.code} category="premium" />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tabs tài liệu API (kiểu thatim: danh sách action bên trái, Parameters + Example Response bên phải) ---------- */
export type ApiActionDoc = { id: string; label: string; params: [string, string, string][]; response: string; curl?: string; note?: string };
export function ApiTabs({ actions }: { actions: ApiActionDoc[] }) {
  const { t } = useLang();
  const [active, setActive] = useState(actions[0]?.id);
  const cur = actions.find((a) => a.id === active) || actions[0];
  if (!cur) return null;
  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
      <div className="card p-2 flex md:flex-col gap-1 overflow-x-auto min-w-0 max-w-full">
        {actions.map((a) => (
          <button key={a.id} type="button" onClick={() => setActive(a.id)} className={`text-left whitespace-nowrap shrink-0 md:shrink md:whitespace-normal md:leading-snug rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${a.id === cur.id ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{a.label}</button>
        ))}
      </div>
      <div className="card p-5 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t("Tham số")}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead className="border-b border-slate-200"><tr><th className="th !py-2">{t("Tham số")}</th><th className="th !py-2">{t("Kiểu")}</th><th className="th !py-2">{t("Mô tả")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cur.params.map((p) => (
                <tr key={p[0]}><td className="td font-mono text-xs font-bold text-brand-700">{p[0]}</td><td className="td text-slate-500 text-xs">{p[1]}</td><td className="td text-slate-600">{p[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {cur.note && (
          <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-brand-900">
            <span className="font-bold">{t("Lưu ý")}: </span>{cur.note}
          </div>
        )}
        {cur.curl && (
          <>
            <div className="flex items-center justify-between mt-6 mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("Ví dụ curl")}</div>
              <CopyBtn text={cur.curl} label="Sao chép" />
            </div>
            <pre className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs sm:text-[13px] overflow-x-auto">{cur.curl}</pre>
          </>
        )}
        <div className="flex items-center justify-between mt-6 mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("Phản hồi mẫu")}</div>
          <CopyBtn text={cur.response} label="Sao chép" />
        </div>
        <div className="text-xs font-mono text-slate-400 mb-1">response.json</div>
        <pre className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs sm:text-[13px] overflow-x-auto">{cur.response}</pre>
      </div>
    </div>
  );
}

/* ---------- Tabs cấp trang cho tài liệu API (lệnh Tín 2026-11-12: chia tab thay vì
 * kéo dài hết trang; phần chung viết 1 lần ở tab Chung). Tab chọn theo hash
 * (#chung/#smm/#premium/#sanphamso) để dẫn link mở đúng tab; đổi tab cập nhật
 * hash bằng pushState, không tải lại trang. Nội dung các panel do server render
 * sẵn rồi truyền vào — component này chỉ lo chuyển tab. ---------- */
export function ApiDocTabs({ tabs, children }: { tabs: { id: string; label: string }[]; children: ReactNode[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (tabs.some((tb) => tb.id === h)) setActive(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);
  const select = (id: string) => {
    setActive(id);
    try { history.pushState(null, "", `#${id}`); } catch {}
  };
  return (
    <div>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            id={`apidoc-tab-${tb.id}`}
            aria-selected={active === tb.id}
            aria-controls={`apidoc-panel-${tb.id}`}
            onClick={() => select(tb.id)}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${active === tb.id ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {tabs.map((tb, i) => (
        <div key={tb.id} role="tabpanel" id={`apidoc-panel-${tb.id}`} aria-labelledby={`apidoc-tab-${tb.id}`} hidden={active !== tb.id}>
          {children[i]}
        </div>
      ))}
    </div>
  );
}

/** Nút vuông thêm vào giỏ ở hộp đặt hàng trang chi tiết (kiểu shopkey). */
function CartDetailBtn({ onAdd }: { onAdd: () => void }) {
  const { t } = useLang();
  const [added, setAdded] = useState(false);
  return (
    <button type="button" aria-label={t("Thêm vào giỏ")} title={t("Thêm vào giỏ")}
      onClick={() => { onAdd(); setAdded(true); setTimeout(() => setAdded(false), 1400); }}
      className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center self-center rounded-xl border-2 transition ${added ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-slate-300 text-slate-600 hover:border-brand-500 hover:text-brand-600"}`}>
      {added ? I.check : I.cart}
    </button>
  );
}
