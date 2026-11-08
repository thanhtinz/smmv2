"use client";
import { useMemo, useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { placeTelegramOrderAction } from "@/app/actions/telegram";

export const STAR_PRESETS = [50, 100, 200, 250, 500, 750, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000];

export type TelegramPlan = { months: number; price: number };

/** Form đặt đơn Telegram Stars & Premium — dựng 1:1 theo ảnh mẫu FZR của Tín:
 *  thẻ segmented riêng → một thẻ form chứa 2 panel viền (1 Người nhận /
 *  2 Chọn gói) → thẻ Summary có nút Continue bên trong. Người nhận CHỈ có
 *  username (không còn ô Telegram ID — đơn username đi đường top-up username
 *  hoặc chờ xử lý tay như máy chủ đã làm). Giá hiện bằng tiền của site. */
export function TelegramOrderForm({ starPrice, starMin, starMax, plans, balance }: {
  starPrice: number; // VNĐ / 1 sao đã quy đổi (0 = chưa có giá)
  starMin: number;
  starMax: number;
  plans: TelegramPlan[];
  balance: number;
}) {
  const { t, m } = useLang();
  const [mode, setMode] = useState<"stars" | "premium">("stars");
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState(50);
  const [showAll, setShowAll] = useState(false);
  const [months, setMonths] = useState(plans[0]?.months || 3);
  const plan = plans.find((p) => p.months === months) || plans[0];
  const total = mode === "stars" ? starPrice * (amount || 0) : (plan?.price || 0);
  const usernameOk = username.trim().length >= 3;
  const amountOk = mode === "premium" ? !!plan : amount >= starMin && amount <= starMax;
  const canSubmit = usernameOk && amountOk && total > 0 && total <= balance;
  const presets = useMemo(() => (showAll ? STAR_PRESETS : STAR_PRESETS.slice(0, 6)), [showAll]);
  const account = username.trim() ? (username.trim().startsWith("@") ? username.trim() : `@${username.trim()}`) : "—";

  const segBtn = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-[15px] font-bold transition ${active ? "bg-gradient-to-br from-[#8061ff] to-[#673de6] text-white shadow-md shadow-violet-600/25" : "text-slate-500 hover:text-slate-800"}`;
  const panelTitle = (n: number, label: string) => (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-[15px] font-extrabold text-violet-600">{n}</span>
      <span className="text-[17px] font-extrabold text-slate-900">{label}</span>
    </div>
  );
  const lbl = "mb-2 block text-[15px] font-semibold text-slate-600";
  const inp = "h-[52px] w-full rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100";
  const pickCls = (selected: boolean) =>
    `rounded-2xl border-2 text-left transition ${selected ? "border-violet-500 bg-[#f5f2ff]" : "border-slate-200 bg-white hover:border-violet-300"}`;

  return (
    <form action={placeTelegramOrderAction} className="space-y-4 sm:space-y-5">
      <input type="hidden" name="mode" value={mode} />

      <div className="card p-3 sm:p-4">
        <div className="flex rounded-xl bg-[#f1f3f7] p-1.5">
          <button type="button" className={segBtn(mode === "stars")} onClick={() => setMode("stars")}><span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{I.star}</span>Stars</button>
          <button type="button" className={segBtn(mode === "premium")} onClick={() => setMode("premium")}><span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{I.gift}</span>Premium</button>
        </div>
      </div>

      <div className="card space-y-4 p-3.5 sm:space-y-5 sm:p-5">
        <section className="rounded-2xl border border-slate-200 p-5">
          {panelTitle(1, t("Người nhận"))}
          <div className="mt-4">
            <label className={lbl} htmlFor="tg-username">{t("Tên người dùng Telegram")}</label>
            <input id="tg-username" className={inp} name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" autoComplete="off" />
          </div>
          {mode === "stars" && (
            <div className="mt-5">
              <label className={lbl} htmlFor="tg-amount">{t("Số sao")}</label>
              <input id="tg-amount" className={inp} type="number" name="amount" min={starMin} max={starMax} value={amount || ""} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
              <p className="mt-2 text-sm text-slate-400">{t("Min")} {starMin} · {t("Max")} {starMax}</p>
            </div>
          )}
        </section>

        {mode === "stars" ? (
          <section className="rounded-2xl border border-slate-200 p-5">
            {panelTitle(2, t("Chọn gói sao"))}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              {presets.map((n) => {
                const selected = amount === n;
                return (
                  <button type="button" key={n} onClick={() => setAmount(n)} className={`${pickCls(selected)} p-4 sm:p-5`}>
                    <span className="flex items-center gap-2 text-xl font-extrabold text-slate-900">{n.toLocaleString("vi-VN")}<span className="[&>svg]:h-5 [&>svg]:w-5">{I.star}</span></span>
                    <span className="mt-3 block text-[15px] font-semibold text-slate-500">{m(starPrice * n)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 text-center">
              <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                {showAll ? t("Thu gọn") : `${t("Hiện tất cả")} (${STAR_PRESETS.length})`}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 p-5">
            <input type="hidden" name="months" value={months} />
            {panelTitle(2, t("Chọn gói Premium"))}
            <div className="mt-4 space-y-3 sm:space-y-4">
              {plans.map((p) => {
                const selected = months === p.months;
                return (
                  <button type="button" key={p.months} onClick={() => setMonths(p.months)} className={`${pickCls(selected)} block w-full p-5`}>
                    <span className="block text-lg font-extrabold text-slate-900">{p.months} {t("tháng")}</span>
                    <span className="mt-1 block text-sm text-slate-500">Premium</span>
                    <span className="mt-3.5 block text-lg font-extrabold text-slate-900">{m(p.price)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <section className="card p-5 sm:p-6">
        <div className="text-xl font-extrabold text-slate-900">{t("Tóm tắt")}</div>
        <p className="mt-1 text-sm text-slate-500">{mode === "stars" ? t("Cập nhật khi bạn đặt người nhận và số sao.") : t("Cập nhật khi bạn đặt người nhận và gói.")}</p>
        <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[15px] text-slate-500">{t("Tài khoản")}</span>
            <span className="font-bold text-slate-900">{account}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[15px] text-slate-500">{mode === "stars" ? "Stars" : t("Gói")}</span>
            <span className="font-bold text-slate-900">{mode === "stars" ? `${(amount || 0).toLocaleString("vi-VN")} Stars` : `${months} ${t("tháng")}`}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[15px] font-bold text-slate-900">{t("Cần thanh toán")}</span>
            <span className="text-lg font-extrabold text-slate-900">{m(total)}</span>
          </div>
        </div>
        <button disabled={!canSubmit} className="mt-5 w-full rounded-xl bg-gradient-to-br from-[#8061ff] to-[#673de6] py-4 text-base font-extrabold text-white shadow-lg shadow-violet-600/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
          {t("Tiếp tục")}
        </button>
      </section>
    </form>
  );
}
