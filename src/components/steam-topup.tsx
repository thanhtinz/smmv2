"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { placeSteamTopupAction } from "@/app/actions/steam";

export type SteamDenom = { variantId: number; amount: number; price: number };
export type SteamRate = { code: string; rate: string };

/** Form nạp Steam Wallet (Top-Up CIS) — dựng theo ảnh mẫu FZR của Tín trong
 *  ngôn ngữ thẻ của trang Telegram: thẻ chi tiết (ô login có nút cảnh báo +
 *  bong bóng tooltip tối, mệnh giá, loại tiền) → thẻ Summary có nút Continue
 *  bên trong. Bố cục (lệnh Tín 2026-11-08): desktop lg+ CHIA 2 CỘT 73/27 như
 *  trang chi tiết Premium — cột trái = header + thẻ chi tiết, cột phải =
 *  Summary GHIM DÍNH (sticky top-24); dưới lg xếp 1 cột theo đúng thứ tự cũ. RÀNG BUỘC DỮ LIỆU: provider chỉ bán mệnh giá USD CỐ ĐỊNH đã
 *  đồng bộ (5/10/20/50/100) nên ô Amount là lưới chọn mệnh giá; loại tiền chỉ
 *  USD thực thi được — RUB/KZT/UAH hiện dạng pill bị khoá kèm ghi chú, không
 *  giả lập quy đổi. Discount chỉ hiện khi dữ liệu tỉ giá của provider có. */
export function SteamTopupForm({ denominations, rates, discount, balance, header, reviews }: {
  denominations: SteamDenom[];
  rates: SteamRate[] | null;
  discount: string | null; // vd "3.55%" — null = dữ liệu không có
  balance: number;
  header?: ReactNode; // thẻ header + Flash của trang — nằm ở đầu cột trái trong bố cục 2 cột
  reviews?: ReactNode; // khối đánh giá của sản phẩm top-up — cột trái, dưới thẻ chi tiết
}) {
  const { t, m } = useLang();
  const [login, setLogin] = useState("");
  const [sel, setSel] = useState(denominations[0]?.variantId || 0);
  const [warnOpen, setWarnOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const warnRef = useRef<HTMLDivElement>(null);
  const denom = denominations.find((d) => d.variantId === sel) || denominations[0];
  const total = denom?.price || 0;
  const loginOk = login.trim().length >= 3;
  const canSubmit = loginOk && !!denom && total > 0 && total <= balance;
  const minAmt = denominations.length ? Math.min(...denominations.map((d) => d.amount)) : 0;
  const maxAmt = denominations.length ? Math.max(...denominations.map((d) => d.amount)) : 0;

  // Tooltip cảnh báo: đóng khi bấm ra ngoài / Esc (tap ngoài trên mobile).
  useEffect(() => {
    if (!warnOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setWarnOpen(false); };
    const onClick = (e: MouseEvent) => { if (warnRef.current && !warnRef.current.contains(e.target as Node)) setWarnOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [warnOpen]);

  const lbl = "mb-2 block text-[15px] font-semibold text-slate-600";
  const inp = "h-[52px] w-full rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100";
  const row = (label: string, value: ReactNode, strong = false) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <span className={`text-[15px] ${strong ? "font-bold text-slate-900" : "text-slate-500"}`}>{label}</span>
      <span className={strong ? "text-lg font-extrabold text-slate-900" : "font-bold text-slate-900"}>{value}</span>
    </div>
  );

  // Form đặt đơn là một form ẨN riêng; ô login + nút Tiếp tục (nằm ở hai
  // cột khác nhau) gắn vào nó bằng thuộc tính form= — nhờ vậy cột trái chứa
  // được khối đánh giá (vốn có form riêng) mà không lồng form vào form.
  const FORM_ID = "steam-topup-order-form";
  return (
    <>
      <form id={FORM_ID} action={placeSteamTopupAction} className="hidden">
        <input type="hidden" name="variantId" value={denom?.variantId || 0} />
      </form>
      <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-[minmax(0,73fr)_minmax(0,27fr)] lg:items-start lg:gap-x-5">
      <div className="min-w-0 space-y-4 sm:space-y-5">
      {header}

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white [&>svg]:h-6 [&>svg]:w-6">{I.gamepad}</span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-extrabold text-slate-900">{t("Chi tiết nạp tiền")}</div>
            <p className="mt-0.5 text-sm text-slate-500">{t("Steam login và mệnh giá theo loại tiền bạn chọn.")}</p>
          </div>
          {rates && rates.length > 0 && (
            <button type="button" onClick={() => setRatesOpen((v) => !v)} aria-expanded={ratesOpen}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-700">
              <span className="[&>svg]:h-4 [&>svg]:w-4">{I.alert}</span>{t("Tỉ giá")}
            </button>
          )}
        </div>
        {ratesOpen && rates && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Tỉ giá quy đổi (1 USD)")}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {rates.map((r) => (
                <div key={r.code} className="flex items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2">
                  <span className="font-bold text-slate-500">{r.code}</span>
                  <span className="font-extrabold text-slate-900">{r.rate}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <label className={lbl} htmlFor="steam-login">{t("Steam login")}</label>
          <div className="relative" ref={warnRef}>
            <input id="steam-login" form={FORM_ID} className={`${inp} pr-16`} name="login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t("Steam login")} autoComplete="off" />
            <button type="button" aria-label={t("Tên đăng nhập Steam của bạn. Nhập sai login sẽ nạp nhầm vào tài khoản của người khác.")}
              onClick={() => setWarnOpen((v) => !v)} onMouseEnter={() => setWarnOpen(true)} onFocus={() => setWarnOpen(true)}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-600 shadow-sm transition hover:border-brand-300 [&>svg]:h-5 [&>svg]:w-5">
              {I.alert}
            </button>
            {warnOpen && (
              <div role="tooltip" className="absolute right-0 top-full z-30 mt-3 w-[320px] max-w-[85vw] rounded-2xl bg-slate-900 px-4 py-3.5 text-sm leading-relaxed text-white shadow-2xl">
                <span className="absolute -top-[7px] right-5 h-3.5 w-3.5 rotate-45 bg-slate-900" />
                {t("Tên đăng nhập Steam của bạn. Nhập sai login sẽ nạp nhầm vào tài khoản của người khác.")}
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-400">{t("Nhập tên đăng nhập của tài khoản Steam cần nạp.")}</p>
        </div>

        <div className="mt-6">
          <span className={lbl}>{t("Mệnh giá")}</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {denominations.map((d) => {
              const selected = denom?.variantId === d.variantId;
              return (
                <button type="button" key={d.variantId} onClick={() => setSel(d.variantId)}
                  className={`rounded-2xl border-2 p-4 text-left transition ${selected ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"}`}>
                  <span className="block text-xl font-extrabold text-slate-900">{d.amount} USD</span>
                  <span className="mt-1.5 block text-sm font-semibold text-slate-500">{m(d.price)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-slate-400">{t("Mệnh giá khả dụng:")} {minAmt} – {maxAmt} USD</p>
        </div>

        <div className="mt-6">
          <span className={lbl}>{t("Loại tiền")}</span>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border-2 border-brand-500 bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700">USD</span>
            {["RUB", "KZT", "UAH"].map((c) => (
              <span key={c} aria-disabled="true" title={t("Hiện chỉ hỗ trợ USD — các loại tiền khác sẽ mở khi nhà cung cấp hỗ trợ.")}
                className="cursor-not-allowed rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-300">{c}</span>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-400">{t("Hiện chỉ hỗ trợ USD — các loại tiền khác sẽ mở khi nhà cung cấp hỗ trợ.")}</p>
        </div>
      </section>
      {reviews}
      </div>

      <section className="card p-5 sm:p-6 lg:sticky lg:top-24">
        <div className="text-xl font-extrabold text-slate-900">{t("Tóm tắt")}</div>
        <p className="mt-1 text-sm text-slate-500">{t("Tổng tiền cập nhật theo mệnh giá bạn chọn.")}</p>
        <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[15px] text-slate-500">{t("Giảm giá")}</span>
            {discount
              ? <span className="font-bold text-emerald-600">{discount}</span>
              : <span className="font-bold text-slate-400">—</span>}
          </div>
          {row(t("Sẽ nhận"), denom ? `${denom.amount} USD` : "—")}
          {row(t("Quy đổi USD"), denom ? `$${denom.amount.toFixed(2)}` : "—")}
          {row(t("Cần thanh toán"), m(total), true)}
        </div>
        <button form={FORM_ID} disabled={!canSubmit} className="mt-5 w-full rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 py-4 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
          {t("Tiếp tục")}
        </button>
      </section>
      </div>
    </>
  );
}
