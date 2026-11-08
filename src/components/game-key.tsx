"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { placeGameKeyAction } from "@/app/actions/game-key";

/** Game Key — yêu thích lưu phía khách (localStorage, cùng kiểu "đã xem gần
 *  đây" của trang chủ): mảng id sản phẩm. Nút sao ở trang chi tiết bật/tắt;
 *  nút sao ở thẻ tìm kiếm của trang danh mục lọc về đúng các game đó (đưa id
 *  lên query để máy chủ phân trang như thường). */
export const GK_FAV_KEY = "smmv2-gk-fav-v1";

export function readGkFavs(): number[] {
  try {
    const arr = JSON.parse(localStorage.getItem(GK_FAV_KEY) || "[]");
    return Array.isArray(arr) ? arr.map((x) => parseInt(String(x)) || 0).filter((x) => x > 0) : [];
  } catch { return []; }
}

function writeGkFavs(ids: number[]) {
  try { localStorage.setItem(GK_FAV_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
}

const starSvg = (filled: boolean) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" />
  </svg>
);

/** Nút sao ở trang danh mục: bật = chỉ hiện game yêu thích (điều hướng kèm
 *  danh sách id); tắt = bỏ lọc. */
export function GkFavFilterButton({ active, basePath }: { active: boolean; basePath: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [hasFav, setHasFav] = useState(false);
  useEffect(() => { setHasFav(readGkFavs().length > 0); }, []);
  const toggle = () => {
    if (active) { router.push(basePath); return; }
    const ids = readGkFavs();
    const sep = basePath.includes("?") ? "&" : "?";
    router.push(`${basePath}${sep}fav=1&ids=${ids.join(",")}`);
  };
  return (
    <button
      type="button" onClick={toggle} title={t("Chỉ hiện game yêu thích")}
      className={`flex h-[42px] w-[46px] shrink-0 items-center justify-center rounded-xl border transition ${active ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 bg-white text-slate-400 hover:text-amber-500"} ${!active && !hasFav ? "opacity-60" : ""}`}
    >
      {starSvg(active)}
    </button>
  );
}

export type GkEdition = { variantId: number; name: string; price: number; stock: number | null };
export type GkGame = {
  id: number; name: string; image: string | null;
  platform: string | null; region: string | null;
  editions: GkEdition[];
};

/** Trang mua Game Key dựng theo ảnh mẫu FZR của chủ site: thẻ bìa lớn (nút
 *  quay lại + sao yêu thích phủ trên ảnh) -> tên + chip nền tảng/vùng -> thẻ
 *  Chọn phiên bản -> thẻ Tóm tắt đơn (dòng Platform/Region/Key/Giá key, TỔNG
 *  TRẢ, bộ tăng giảm số lượng + nút Tiếp tục trong cùng thẻ). Giá hiển thị
 *  bằng tiền của web (formatMoney của useLang). */
export function GameKeyBuyForm({ game, balance }: { game: GkGame; balance: number }) {
  const { t, m } = useLang();
  const [editionId, setEditionId] = useState<number>(() => {
    const first = game.editions.find((e) => e.stock !== 0) || game.editions[0];
    return first?.variantId || 0;
  });
  const [qty, setQty] = useState(1);
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(readGkFavs().includes(game.id)); }, [game.id]);
  const edition = useMemo(() => game.editions.find((e) => e.variantId === editionId) || game.editions[0], [game.editions, editionId]);
  const total = (edition?.price || 0) * qty;
  const enough = balance >= total;
  const soldOut = !edition || edition.stock === 0;

  const toggleFav = () => {
    const ids = readGkFavs();
    const next = ids.includes(game.id) ? ids.filter((x) => x !== game.id) : [...ids, game.id];
    writeGkFavs(next);
    setFav(next.includes(game.id));
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Thẻ bìa + tiêu đề */}
      <section className="card overflow-hidden">
        <div className="relative">
          {game.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.image} alt={game.name} className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white">
              <span className="[&>svg]:h-16 [&>svg]:w-16">{I.gamepad}</span>
            </div>
          )}
          <Link href="/dashboard/game-key" aria-label={t("Quay lại")} className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-md transition hover:bg-slate-50">
            <span className="-scale-x-100 [&>svg]:h-5 [&>svg]:w-5">{I.arrowRight}</span>
          </Link>
          <button type="button" onClick={toggleFav} aria-label={t("Yêu thích")} className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-md transition ${fav ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}>
            {starSvg(fav)}
          </button>
        </div>
        <div className="p-5 sm:p-6">
          <h1 className="text-[24px] font-black leading-tight text-slate-900">{game.name}</h1>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] font-bold text-slate-700 [&>svg]:h-4 [&>svg]:w-4">
              {I.gamepad}{game.platform || "—"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] font-bold text-slate-700 [&>svg]:h-4 [&>svg]:w-4">
              {I.globe}{game.region || "—"}
            </span>
          </div>
        </div>
      </section>

      <form action={placeGameKeyAction}>
        <input type="hidden" name="variantId" value={edition?.variantId || 0} />
        <input type="hidden" name="quantity" value={qty} />
        {/* Chọn phiên bản */}
        <section className="card p-5 sm:p-6">
          <h2 className="text-[17px] font-extrabold text-slate-900">{t("Chọn phiên bản")}</h2>
          <div className="mt-3.5 space-y-2.5">
            {game.editions.map((e) => {
              const out = e.stock === 0;
              const selected = edition?.variantId === e.variantId;
              return (
                <button
                  key={e.variantId} type="button" disabled={out}
                  onClick={() => setEditionId(e.variantId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition ${selected ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"} ${out ? "cursor-not-allowed opacity-55" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold text-slate-900">{e.name}</span>
                    {out && <span className="mt-0.5 block text-xs font-semibold text-rose-600">{t("Hết hàng")}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[16px] font-black text-brand-700">{m(e.price)}</span>
                    {e.stock != null && !out && <span className="mt-0.5 block text-xs text-slate-400">{t("Còn")} {e.stock} {t("key trong kho")}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Tóm tắt đơn */}
        <section className="card mt-4 p-5 sm:mt-5 sm:p-6">
          <h2 className="text-[17px] font-extrabold text-slate-900">{t("Tóm tắt đơn")}</h2>
          <div className="mt-3.5 space-y-2">
            {[
              [t("Nền tảng"), game.platform || "—"],
              [t("Vùng"), game.region || "—"],
              ["Key", edition?.name || "—"],
              [t("Giá key"), edition ? m(edition.price) : "—"],
              [t("Số dư ví"), m(balance)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-100 px-3.5 py-2.5 text-sm">
                <span className="text-slate-500">{k}</span>
                <span className="font-bold text-slate-900">{v}</span>
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
