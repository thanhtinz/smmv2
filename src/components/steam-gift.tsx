"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { placeSteamGiftAction } from "@/app/actions/steam";

export type SteamGame = {
  productId: number;
  name: string;
  image: string | null;
  appid: string;
  editions: { variantId: number; name: string; price: number }[];
};

/** Form Steam Gift Games — dựng theo ảnh mẫu FZR của Tín: thẻ tìm kiếm →
 *  1 Game → 2 Phiên bản → 3 Vùng & giá → thẻ Summary (ô link mời + các dòng
 *  App ID / Package ID / Phiên bản / Vùng / Giá / Link mời, nút Proceed bên
 *  trong). Bố cục (lệnh Tín 2026-11-08): desktop lg+ CHIA 2 CỘT 73/27 như
 *  trang chi tiết Premium — cột trái = header + tìm kiếm + §1 + §2 + §3,
 *  cột phải = Summary GHIM DÍNH (sticky top-24); dưới lg 1 cột thứ tự cũ.
 *  RÀNG BUỘC DỮ LIỆU: catalog đã đồng bộ có 1 variant "Bản gift" mỗi
 *  game (mục Phiên bản liệt kê đúng các variant đó) và KHÔNG mang dữ liệu
 *  vùng/package — vùng chốt theo offer rẻ nhất phía provider khi đặt (giá
 *  cũng chốt tươi lúc mua trong createPremiumOrder), nên Package ID để "—"
 *  và mục Vùng ghi rõ điều này thay vì bịa danh sách vùng. */
export function SteamGiftForm({ games, balance, header, initialGameId, reviewsByGame }: { games: SteamGame[]; balance: number; header?: ReactNode; initialGameId?: number; reviewsByGame?: Record<number, ReactNode> }) {
  const { t, m } = useLang();
  const [q, setQ] = useState("");
  // Chọn sẵn game khi đến từ mục Steam Gift Games ở trang chủ (?game=<id>) —
  // game không còn trong danh mục thì bỏ qua, giữ trạng thái chưa chọn.
  const initialGame = initialGameId ? games.find((g) => g.productId === initialGameId) || null : null;
  const [gameId, setGameId] = useState<number>(initialGame?.productId || 0);
  const [variantId, setVariantId] = useState<number>(initialGame?.editions[0]?.variantId || 0);
  const [invite, setInvite] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return games;
    return games.filter((g) => g.name.toLowerCase().includes(s) || String(g.appid).includes(s));
  }, [games, q]);
  const game = games.find((g) => g.productId === gameId) || null;
  const edition = game?.editions.find((ed) => ed.variantId === variantId) || null;
  const price = edition?.price || 0;
  const canSubmit = !!game && !!edition && invite.trim().length >= 8 && (price === 0 || price <= balance);

  const panelTitle = (n: number, label: string) => (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[15px] font-extrabold text-brand-700">{n}</span>
      <span className="text-[17px] font-extrabold text-slate-900">{label}</span>
    </div>
  );
  const lbl = "mb-2 block text-[15px] font-semibold text-slate-600";
  const inp = "h-[52px] w-full rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100";
  const cover = (g: SteamGame, cls: string) => g.image
    ? <img src={g.image} alt="" className={`${cls} shrink-0 rounded-lg object-cover`} loading="lazy" />
    : <span className={`${cls} flex shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white [&>svg]:h-6 [&>svg]:w-6`}>{I.gamepad}</span>;

  return (
    // Gốc là DIV lưới, không phải form: form đặt đơn chỉ bọc thẻ Summary
    // (mọi field nộp — variantId ẩn, link mời, nút Tiến hành — đều nằm ở
    // đó), nhờ vậy cột trái chứa được khối đánh giá có form riêng.
    <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-[minmax(0,73fr)_minmax(0,27fr)] lg:items-start lg:gap-x-5">
      <div className="min-w-0 space-y-4 sm:space-y-5">
      {header}

      <section className="card p-5 sm:p-6">
        <label className={lbl} htmlFor="sg-search">{t("Tìm game theo tên hoặc ID")}</label>
        <input id="sg-search" className={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Nhập tên game hoặc appid...")} autoComplete="off" />
      </section>

      <section className="card p-5 sm:p-6">
        {panelTitle(1, t("Game"))}
        <div className="mt-4 space-y-2.5">
          {filtered.length === 0 && <p className="py-3 text-center text-sm text-slate-400">{t("Không có game nào khớp tìm kiếm")}</p>}
          {filtered.map((g) => {
            const selected = game?.productId === g.productId;
            return (
              <button type="button" key={g.productId} onClick={() => { setGameId(g.productId); setVariantId(g.editions[0]?.variantId || 0); }}
                className={`flex w-full items-center gap-3.5 rounded-xl border-2 p-3 text-left transition ${selected ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"}`}>
                {cover(g, "h-14 w-[104px] max-sm:w-[76px]")}
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-slate-900">{g.name}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-400">AppID · {g.appid}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        {panelTitle(2, t("Phiên bản"))}
        {!game
          ? <p className="mt-4 text-sm text-slate-400">{t("Chọn một game để xem các phiên bản")}</p>
          : (
            <div className="mt-4 space-y-2.5">
              {game.editions.map((ed) => {
                const selected = edition?.variantId === ed.variantId;
                return (
                  <button type="button" key={ed.variantId} onClick={() => setVariantId(ed.variantId)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition ${selected ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"}`}>
                    <span className="text-[15px] font-bold text-slate-900">{ed.name}</span>
                    <span className="font-extrabold text-slate-900">{ed.price > 0 ? m(ed.price) : t("Báo giá khi đặt đơn")}</span>
                  </button>
                );
              })}
            </div>
          )}
      </section>

      <section className="card p-5 sm:p-6">
        {panelTitle(3, t("Vùng & giá"))}
        <div className="mt-4">
          <label className={lbl} htmlFor="sg-region">{t("Tìm vùng")}</label>
          <input id="sg-region" className={inp} disabled={!edition} placeholder={t("Tên quốc gia hoặc mã ISO (KZ, UZ)...")} autoComplete="off" />
        </div>
        <p className="mt-3 text-sm text-slate-400">
          {!edition ? t("Chọn phiên bản để xem các vùng") : t("Chưa có dữ liệu vùng cho gói này — vùng được chốt theo offer của nhà cung cấp khi đặt đơn.")}
        </p>
      </section>

      {/* Đánh giá của game ĐANG CHỌN (hệ đánh giá Premium dùng chung) —
          đổi game là đổi khối; chưa chọn game thì không hiện. */}
      {game ? reviewsByGame?.[game.productId] : null}
      </div>

      <section className="card p-5 sm:p-6 lg:sticky lg:top-24">
        <form action={placeSteamGiftAction}>
        <input type="hidden" name="variantId" value={edition?.variantId || 0} />
        <div className="text-xl font-extrabold text-slate-900">{t("Tóm tắt")}</div>
        <div className="mt-5">
          <label className={lbl} htmlFor="sg-invite">{t("Link mời Steam")}</label>
          <input id="sg-invite" className={inp} name="invite" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder={t("Dán link ngắn s.team/p/p/...")} autoComplete="off" />
        </div>
        <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px] text-slate-500">App ID</span>
            <span className="font-bold text-slate-900">{game ? game.appid : "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px] text-slate-500">Package ID</span>
            <span className="font-bold text-slate-400">—</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px] text-slate-500">{t("Phiên bản")}</span>
            <span className="font-bold text-slate-900">{edition ? edition.name : "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px] text-slate-500">{t("Vùng")}</span>
            <span className="font-bold text-slate-900">{edition ? t("Tự động") : "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 bg-brand-50 px-4 py-3">
            <span className="text-[15px] font-bold text-brand-700">{t("Giá")}</span>
            <span className="font-extrabold text-brand-700">{edition ? (price > 0 ? m(price) : t("Báo giá khi đặt đơn")) : "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="shrink-0 text-[15px] text-slate-500">{t("Link mời")}</span>
            <span className="truncate font-bold text-slate-900">{invite.trim() || "—"}</span>
          </div>
        </div>
        <button disabled={!canSubmit} className="mt-5 w-full rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 py-4 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
          {t("Tiến hành")}
        </button>
        </form>
      </section>
    </div>
  );
}
