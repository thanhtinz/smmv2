"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/lang";
import { I, StarIcon } from "@/components/ui";
import { placeGiftCardAction } from "@/app/actions/gift-card";

/** Gift Card — yêu thích lưu phía khách (localStorage, cùng kiểu Game Key):
 *  mảng id sản phẩm (category). Nút sao ở trang chi tiết bật/tắt; nút sao ở
 *  thẻ tìm kiếm của trang danh mục lọc về đúng các danh mục đó (đưa id lên
 *  query để máy chủ phân trang như thường). */
export const GC_FAV_KEY = "smmv2-gc-fav-v1";

export function readGcFavs(): number[] {
  try {
    const arr = JSON.parse(localStorage.getItem(GC_FAV_KEY) || "[]");
    return Array.isArray(arr) ? arr.map((x) => parseInt(String(x)) || 0).filter((x) => x > 0) : [];
  } catch { return []; }
}

function writeGcFavs(ids: number[]) {
  try { localStorage.setItem(GC_FAV_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
}

/** Nút sao ở trang danh mục: bật = chỉ hiện danh mục yêu thích (điều hướng
 *  kèm danh sách id); tắt = bỏ lọc. */
export function GcFavFilterButton({ active, basePath }: { active: boolean; basePath: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [hasFav, setHasFav] = useState(false);
  useEffect(() => { setHasFav(readGcFavs().length > 0); }, []);
  const toggle = () => {
    if (active) { router.push(basePath); return; }
    const ids = readGcFavs();
    const sep = basePath.includes("?") ? "&" : "?";
    router.push(`${basePath}${sep}fav=1&ids=${ids.join(",")}`);
  };
  return (
    <button
      type="button" onClick={toggle} title={t("Chỉ hiện danh mục yêu thích")}
      className={`flex h-[42px] w-[46px] shrink-0 items-center justify-center gap-2 rounded-xl border transition lg:w-auto lg:px-4 ${active ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 bg-white text-slate-400 hover:text-amber-500"} ${!active && !hasFav ? "opacity-60" : ""}`}
    >
      <StarIcon filled={active} />
      {/* PC (lg+): hiện thêm chữ "Yêu thích" trong nút; mobile chỉ icon */}
      <span className="hidden text-sm font-bold lg:inline">{t("Yêu thích")}</span>
    </button>
  );
}

export type GcDenom = { variantId: number; name: string; price: number; stock: number | null };
export type GcProduct = {
  id: number; name: string; image: string | null; note: string | null;
  denoms: GcDenom[];
};

/** Trang mua Gift Card dựng theo ảnh mẫu FZR của chủ site: hàng sản phẩm
 *  (ô logo vuông + tên + nút Thêm vào yêu thích / Quay lại danh mục) -> thẻ
 *  "Gift cards" (các mệnh giá dạng hàng, danh sách CUỘN được khi dài, giá
 *  bằng tiền web) -> thẻ NOTE hổ phách (ghi chú thật của NCC, có mới hiện)
 *  -> thẻ Tóm tắt đơn (Dịch vụ / Sản phẩm / Giá, TỔNG TRẢ, tăng giảm số
 *  lượng + Tiếp tục trong cùng thẻ) đặt qua createPremiumOrder. */
export function GiftCardBuyForm({ product, balance }: { product: GcProduct; balance: number }) {
  const { t, m } = useLang();
  const [denomId, setDenomId] = useState<number>(() => {
    const first = product.denoms.find((d) => d.stock !== 0) || product.denoms[0];
    return first?.variantId || 0;
  });
  const [qty, setQty] = useState(1);
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(readGcFavs().includes(product.id)); }, [product.id]);
  const denom = useMemo(() => product.denoms.find((d) => d.variantId === denomId) || product.denoms[0], [product.denoms, denomId]);
  const total = (denom?.price || 0) * qty;
  const enough = balance >= total;
  const soldOut = !denom || denom.stock === 0;

  const toggleFav = () => {
    const ids = readGcFavs();
    const next = ids.includes(product.id) ? ids.filter((x) => x !== product.id) : [...ids, product.id];
    writeGcFavs(next);
    setFav(next.includes(product.id));
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hàng sản phẩm: logo vuông + tên + yêu thích / quay lại */}
      <section className="card flex gap-4 p-5 sm:p-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white sm:h-28 sm:w-28">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt={product.name} className="h-full w-full object-contain p-2" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white [&>svg]:h-10 [&>svg]:w-10">{I.gift}</span>
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
          <Link href="/dashboard/gift-card" className="mt-2 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300">
            <span className="-scale-x-100 [&>svg]:h-[18px] [&>svg]:w-[18px]">{I.arrowRight}</span>
            {t("Quay lại danh mục")}
          </Link>
        </div>
      </section>

      <form action={placeGiftCardAction}>
        <input type="hidden" name="variantId" value={denom?.variantId || 0} />
        <input type="hidden" name="quantity" value={qty} />
        {/* Chọn mệnh giá — danh sách cuộn khi dài */}
        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-extrabold text-slate-900">Gift cards</h2>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{I.gift}</span>
          </div>
          <div className="mt-3.5 max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
            {product.denoms.map((d) => {
              const out = d.stock === 0;
              const selected = denom?.variantId === d.variantId;
              return (
                <button
                  key={d.variantId} type="button" disabled={out}
                  onClick={() => setDenomId(d.variantId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition ${selected ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"} ${out ? "cursor-not-allowed opacity-55" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold text-slate-900">{d.name}</span>
                    {out && <span className="mt-0.5 block text-xs font-semibold text-rose-600">{t("Hết hàng")}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[16px] font-black text-brand-700">{m(d.price)}</span>
                    {d.stock != null && !out && <span className="mt-0.5 block text-xs text-slate-400">{t("Còn")} {d.stock} {t("trong kho")}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {product.denoms.length > 5 && (
            <p className="mt-3 text-center text-[13px] font-semibold text-slate-500">{t("Cuộn xuống để xem tất cả lựa chọn.")}</p>
          )}
        </section>

        {/* NOTE — ghi chú thật phía NCC (vùng, điều kiện dùng…), có mới hiện */}
        {product.note ? (
          <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:mt-5 sm:p-6">
            <div className="flex items-center gap-2 text-amber-700">
              <span className="[&>svg]:h-5 [&>svg]:w-5">{I.alert}</span>
              <h2 className="text-[13px] font-black uppercase tracking-wider">{t("Lưu ý")}</h2>
            </div>
            <p className="mt-2.5 whitespace-pre-line text-sm font-medium leading-relaxed text-amber-900">{product.note}</p>
          </section>
        ) : null}

        {/* Tóm tắt đơn */}
        <section className="card mt-4 p-5 sm:mt-5 sm:p-6">
          <h2 className="text-[17px] font-extrabold text-slate-900">{t("Tóm tắt đơn")}</h2>
          <div className="mt-3.5 space-y-2">
            {[
              [t("Dịch vụ"), product.name],
              [t("Sản phẩm"), denom?.name || "—"],
              [t("Giá"), denom ? m(denom.price) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5 text-sm">
                <span className="shrink-0 text-slate-500">{k}</span>
                <span className="min-w-0 truncate text-right font-bold text-slate-900">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-dashed border-slate-200 pt-4">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Tổng trả")}</span>
            <span className="text-[22px] font-black leading-none text-brand-700">{m(total)}</span>
          </div>
          {!enough && !soldOut && <p className="mt-2.5 text-sm font-medium text-rose-600">{t("Số dư không đủ, vui lòng nạp thêm tiền")}</p>}
          <div className="mt-4 flex gap-2.5">
            <div className="flex items-center rounded-xl border border-slate-200">
              <button type="button" aria-label="-" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-full w-11 items-center justify-center text-lg font-bold text-slate-500 transition hover:text-slate-800">−</button>
              <span className="w-8 text-center text-[15px] font-black text-slate-900">{qty}</span>
              <button type="button" aria-label="+" onClick={() => setQty((q) => Math.min(100, q + 1))} className="flex h-full w-11 items-center justify-center text-lg font-bold text-slate-500 transition hover:text-slate-800">+</button>
            </div>
            <button disabled={soldOut || !enough} className="flex-1 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:opacity-95 disabled:opacity-50">
              {t("Tiếp tục")}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
