"use client";
import { useMemo, useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { placeTelegramOrderAction } from "@/app/actions/telegram";

export const STAR_PRESETS = [50, 100, 200, 250, 500, 750, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000];

export type TelegramPlan = { months: number; price: number };

/** Form đặt đơn Telegram Stars & Premium — bố cục theo ảnh mẫu FZR:
 *  thẻ người nhận → gói sao / gói Premium → tóm tắt, điểm nhấn tím violet. */
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
  const [telegramId, setTelegramId] = useState("");
  const [amount, setAmount] = useState(50);
  const [showAll, setShowAll] = useState(false);
  const [months, setMonths] = useState(plans[0]?.months || 3);
  const plan = plans.find((p) => p.months === months) || plans[0];
  const total = mode === "stars" ? starPrice * (amount || 0) : (plan?.price || 0);
  const idOk = telegramId.trim() === "" || /^\d{5,20}$/.test(telegramId.trim());
  const usernameOk = username.trim().length >= 3;
  const amountOk = mode === "premium" ? !!plan : amount >= starMin && amount <= starMax;
  const canSubmit = usernameOk && idOk && amountOk && total > 0 && total <= balance;
  const presets = useMemo(() => (showAll ? STAR_PRESETS : STAR_PRESETS.slice(0, 6)), [showAll]);

  const segBtn = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition ${active ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/25" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <form action={placeTelegramOrderAction} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      <div className="flex rounded-full bg-slate-100 p-1.5">
        <button type="button" className={segBtn(mode === "stars")} onClick={() => setMode("stars")}><span className="[&>svg]:h-4 [&>svg]:w-4">{I.star}</span>{t("Stars")}</button>
        <button type="button" className={segBtn(mode === "premium")} onClick={() => setMode("premium")}><span className="[&>svg]:h-4 [&>svg]:w-4">{I.gift}</span>{t("Premium")}</button>
      </div>

      <section className="card space-y-4 p-5">
        <div className="text-sm font-extrabold uppercase tracking-wide text-slate-400">1 · {t("Người nhận")}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="lbl">{t("Tên người dùng Telegram")} *</label>
            <input className="inp" name="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" autoComplete="off" />
          </div>
          <div>
            <label className="lbl">Telegram ID <span className="font-medium normal-case text-slate-400">({t("không bắt buộc")})</span></label>
            <input className="inp" name="telegramId" value={telegramId} onChange={(e) => setTelegramId(e.target.value.replace(/[^\d]/g, ""))} placeholder="123456789" inputMode="numeric" autoComplete="off" />
            <p className="mt-1.5 text-xs text-slate-400">{t("ID dạng số của tài khoản nhận — có ID thì gửi nhanh và chính xác hơn.")}</p>
          </div>
        </div>
        {mode === "stars" && (
          <div>
            <label className="lbl">{t("Số sao")}</label>
            <input className="inp" type="number" name="amount" min={starMin} max={starMax} value={amount || ""} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
            <p className="mt-1.5 text-xs text-slate-400">{t("Tối thiểu")} {starMin.toLocaleString("vi-VN")} · {t("Tối đa")} {starMax.toLocaleString("vi-VN")}</p>
          </div>
        )}
      </section>

      {mode === "stars" ? (
        <section className="card p-5">
          <div className="text-sm font-extrabold uppercase tracking-wide text-slate-400">2 · {t("Chọn gói sao")}</div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {presets.map((n) => {
              const selected = amount === n;
              return (
                <button type="button" key={n} onClick={() => setAmount(n)}
                  className={`rounded-2xl border-2 px-3 py-3 text-left transition ${selected ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-300"}`}>
                  <div className="flex items-center gap-1.5 font-extrabold text-slate-900"><span className="text-amber-500 [&>svg]:h-4 [&>svg]:w-4">{I.star}</span>{n.toLocaleString("vi-VN")}</div>
                  <div className="mt-0.5 text-sm font-semibold text-violet-700">{m(starPrice * n)}</div>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-4 text-sm font-bold text-violet-700 hover:text-violet-900">
            {showAll ? t("Thu gọn") : `${t("Hiện tất cả")} (${STAR_PRESETS.length})`}
          </button>
        </section>
      ) : (
        <section className="card p-5">
          <input type="hidden" name="months" value={months} />
          <div className="text-sm font-extrabold uppercase tracking-wide text-slate-400">2 · {t("Chọn gói Premium")}</div>
          <div className="mt-4 space-y-2.5">
            {plans.map((p) => {
              const selected = months === p.months;
              return (
                <button type="button" key={p.months} onClick={() => setMonths(p.months)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${selected ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-300"}`}>
                  <span className="flex items-center gap-2.5 font-extrabold text-slate-900"><span className="text-violet-600 [&>svg]:h-5 [&>svg]:w-5">{I.gift}</span>{p.months} {t("tháng")}</span>
                  <span className="font-extrabold text-violet-700">{m(p.price)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="card p-5">
        <div className="font-extrabold text-slate-900">{t("Tóm tắt")}</div>
        <p className="mt-0.5 text-xs text-slate-400">{t("Kiểm tra kỹ người nhận trước khi tiếp tục.")}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">{t("Tài khoản")}</dt><dd className="font-semibold text-slate-800">{username.trim() ? (username.trim().startsWith("@") ? username.trim() : `@${username.trim()}`) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">{mode === "stars" ? "Stars" : "Premium"}</dt><dd className="font-semibold text-slate-800">{mode === "stars" ? `${(amount || 0).toLocaleString("vi-VN")} Stars` : `${months} ${t("tháng")}`}</dd></div>
          <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2.5"><dt className="font-semibold text-slate-700">{t("Thanh toán")}</dt><dd className="text-xl font-extrabold text-violet-700">{m(total)}</dd></div>
          <div className="flex justify-between gap-3 text-xs"><dt className="text-slate-400">{t("Số dư ví")}</dt><dd className="font-semibold text-slate-500">{m(balance)}</dd></div>
        </dl>
        {!idOk && telegramId.length > 0 && <p className="mt-3 text-sm font-medium text-rose-600">{t("Telegram ID phải là dãy số của tài khoản nhận")}</p>}
        {total > balance && <p className="mt-3 text-sm font-medium text-rose-600">{t("Số dư không đủ — hãy nạp thêm tiền vào ví")}</p>}
        <button disabled={!canSubmit} className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-base font-extrabold text-white shadow-lg shadow-violet-600/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
          {t("Tiếp tục")}
        </button>
      </section>
    </form>
  );
}
