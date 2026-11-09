"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/lang";
import { I, StarIcon } from "@/components/ui";
import { placeManualAction } from "@/app/actions/manual-services";
import type { PremiumCustomField } from "@/lib/format";

/** Manual Services phía khách — yêu thích lưu phía khách (localStorage,
 *  cùng kiểu Game Key / Gift Card / Top-Up): mảng id sản phẩm (category
 *  dịch vụ thủ công phía FZR). */
export const MS_FAV_KEY = "smmv2-ms-fav-v1";

export function readMsFavs(): number[] {
  try {
    const arr = JSON.parse(localStorage.getItem(MS_FAV_KEY) || "[]");
    return Array.isArray(arr) ? arr.map((x) => parseInt(String(x)) || 0).filter((x) => x > 0) : [];
  } catch { return []; }
}

function writeMsFavs(ids: number[]) {
  try { localStorage.setItem(MS_FAV_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
}

/** Nút sao ở trang danh mục: bật = chỉ hiện dịch vụ yêu thích. */
export function MsFavFilterButton({ active, basePath }: { active: boolean; basePath: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [hasFav, setHasFav] = useState(false);
  useEffect(() => { setHasFav(readMsFavs().length > 0); }, []);
  const toggle = () => {
    if (active) { router.push(basePath); return; }
    const ids = readMsFavs();
    const sep = basePath.includes("?") ? "&" : "?";
    router.push(`${basePath}${sep}fav=1&ids=${ids.join(",")}`);
  };
  return (
    <button
      type="button" onClick={toggle} title={t("Chỉ hiện dịch vụ yêu thích")}
      className={`flex h-[42px] w-[46px] shrink-0 items-center justify-center rounded-xl border transition ${active ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 bg-white text-slate-400 hover:text-amber-500"} ${!active && !hasFav ? "opacity-60" : ""}`}
    >
      <StarIcon filled={active} />
    </button>
  );
}

export type MsOffer = { variantId: number; name: string; price: number; minutes: number | null; note: string | null };
export type MsProduct = {
  id: number; name: string; image: string | null; info: string | null; kind: string | null;
  offers: MsOffer[]; fields: PremiumCustomField[];
};

/** Trang mua Manual Services — cùng khung trang mua Top-Up (ảnh mẫu FZR):
 *  cột trái = hàng sản phẩm (bìa + tên + yêu thích / quay lại) -> thẻ chọn
 *  gói (mỗi offer hiện tên + giá + delivery_minutes và note_product THẬT
 *  của NCC khi có) -> thẻ NOTE hổ phách (info của category phía NCC);
 *  cột phải = tóm tắt đơn DÍNH: các trường replenishment (key của NCC,
 *  nhãn admin đặt) hiện trong tóm tắt như Top-Up. Đơn manual theo tài
 *  liệu KHÔNG có số lượng — mỗi đơn 1 gói, nhà cung cấp xử lý thủ công. */
export function ManualBuyForm({ product, balance }: { product: MsProduct; balance: number }) {
  const { t, m } = useLang();
  const [offerId, setOfferId] = useState<number>(() => product.offers[0]?.variantId || 0);
  const [vals, setVals] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    product.fields.forEach((f, i) => { if (f.type === "select" && f.options?.length) init[i] = f.options[0]; });
    return init;
  });
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(readMsFavs().includes(product.id)); }, [product.id]);
  const offer = useMemo(() => product.offers.find((o) => o.variantId === offerId) || product.offers[0], [product.offers, offerId]);
  const total = offer?.price || 0;
  const enough = balance >= total;
  const noOffer = !offer;
  const fieldsFilled = product.fields.every((f, i) => !f.required || (vals[i] || "").trim() !== "");

  const toggleFav = () => {
    const ids = readMsFavs();
    const next = ids.includes(product.id) ? ids.filter((x) => x !== product.id) : [...ids, product.id];
    writeMsFavs(next);
    setFav(next.includes(product.id));
  };

  return (
    <form action={placeManualAction}>
      <input type="hidden" name="variantId" value={offer?.variantId || 0} />
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        {/* Cột trái: sản phẩm + gói + ghi chú nguồn */}
        <div className="space-y-4 sm:space-y-5">
          <section className="card flex gap-4 p-5 sm:p-6">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white sm:h-28 sm:w-28">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white [&>svg]:h-10 [&>svg]:w-10">{I.box}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[19px] font-black leading-snug text-slate-900">{product.name}</h1>
              <button
                type="button" onClick={toggleFav}
                className={`mt-3 flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition ${fav ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
              >
                <StarIcon filled={fav} size={18} />
                {fav ? t("Đã lưu yêu thích") : t("Thêm vào yêu thích")}
              </button>
              <Link href="/dashboard/manual-services" className="mt-2 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300">
                <span className="-scale-x-100 [&>svg]:h-[18px] [&>svg]:w-[18px]">{I.arrowRight}</span>
                {t("Quay lại danh mục")}
              </Link>
            </div>
          </section>

          {/* Chọn gói dịch vụ — danh sách cuộn khi dài */}
          <section className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-slate-900">{t("Gói dịch vụ")}</h2>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{I.box}</span>
            </div>
            <div className="mt-3.5 max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
              {product.offers.map((o) => {
                const selected = offer?.variantId === o.variantId;
                return (
                  <button
                    key={o.variantId} type="button"
                    onClick={() => setOfferId(o.variantId)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition ${selected ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-slate-900">{o.name}</span>
                      {o.minutes != null && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                          <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{I.clock}</span>
                          {t("Giao khoảng")} {o.minutes} {t("phút")}
                        </span>
                      )}
                      {o.note && <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{o.note}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[16px] font-black text-brand-700">{m(o.price)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {product.offers.length > 5 && (
              <p className="mt-3 text-center text-[13px] font-semibold text-slate-500">{t("Cuộn xuống để xem tất cả lựa chọn.")}</p>
            )}
          </section>

          {/* NOTE — info thật phía NCC của category, có mới hiện */}
          {product.info ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-amber-700">
                <span className="[&>svg]:h-5 [&>svg]:w-5">{I.alert}</span>
                <h2 className="text-[13px] font-black uppercase tracking-wider">{t("Lưu ý")}</h2>
              </div>
              <p className="mt-2.5 whitespace-pre-line text-sm font-medium leading-relaxed text-amber-900">{product.info}</p>
            </section>
          ) : null}
        </div>

        {/* Cột phải: tóm tắt đơn (dính trên PC) — trường replenishment nằm trong thẻ này */}
        <section className="card p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="text-[17px] font-extrabold text-slate-900">{t("Tóm tắt đơn")}</h2>
          <div className="mt-3.5 space-y-2">
            {[
              [t("Dịch vụ"), product.name],
              [t("Sản phẩm"), offer?.name || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5 text-sm">
                <span className="shrink-0 text-slate-500">{k}</span>
                <span className="min-w-0 truncate text-right font-bold text-slate-900">{v}</span>
              </div>
            ))}
            {product.fields.map((f, i) => (
              <div key={i} className="rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-2.5">
                {f.type === "textarea" ? (
                  <>
                    <label htmlFor={`cf_${i}`} className="text-sm font-bold text-slate-900">
                      {f.label}{f.required && <span className="text-brand-600"> *</span>}
                    </label>
                    <textarea
                      id={`cf_${i}`} name={`cf_${i}`} rows={2} required={f.required}
                      placeholder={f.placeholder || f.label}
                      value={vals[i] || ""} onChange={(e) => setVals((s) => ({ ...s, [i]: e.target.value }))}
                      className="inp mt-1.5 bg-white"
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <label htmlFor={`cf_${i}`} className="w-[38%] shrink-0 text-sm font-bold leading-snug text-slate-900">
                      {f.label}{f.required && <span className="text-brand-600"> *</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        id={`cf_${i}`} name={`cf_${i}`} required={f.required}
                        value={vals[i] || ""} onChange={(e) => setVals((s) => ({ ...s, [i]: e.target.value }))}
                        className="inp min-w-0 flex-1 bg-white"
                      >
                        {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        id={`cf_${i}`} name={`cf_${i}`} required={f.required}
                        placeholder={f.placeholder || f.label}
                        value={vals[i] || ""} onChange={(e) => setVals((s) => ({ ...s, [i]: e.target.value }))}
                        className="inp min-w-0 flex-1 bg-white"
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5 text-sm">
              <span className="shrink-0 text-slate-500">{t("Giá")}</span>
              <span className="min-w-0 truncate text-right font-bold text-slate-900">{offer ? m(offer.price) : "—"}</span>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-dashed border-slate-200 pt-4">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Tổng trả")}</span>
            <span className="text-[22px] font-black leading-none text-brand-700">{m(total)}</span>
          </div>
          {!enough && !noOffer && <p className="mt-2.5 text-sm font-medium text-rose-600">{t("Số dư không đủ, vui lòng nạp thêm tiền")}</p>}
          <button disabled={noOffer || !enough || !fieldsFilled} className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:opacity-95 disabled:opacity-50">
            {t("Tiếp tục")}
          </button>
        </section>
      </div>
    </form>
  );
}
