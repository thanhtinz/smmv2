"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { buyPassAction, switchPassAction, cancelPassAction, setPassAutoRenewAction } from "@/app/actions/pass";

/** Khối GIÁ + TÓM TẮT của trang /pass — dựng theo mockup Hướng A đã duyệt
 *  (đợt 116, lệnh Tín 2026-11-13): 3 thẻ kỳ hạn cao bằng nhau (cấu trúc
 *  hàng cố định + nút mt-auto), cột phải 320px bám sticky.
 *  Hai trạng thái dùng CHUNG một bộ khung thẻ:
 *  - Chưa có Pass (khách/chưa hạn): thẻ là radio chọn kỳ, khối tóm tắt
 *    hiện gói đã chọn + tổng, nút lớn mua ngay (buyPassAction).
 *  - Thành viên còn hạn (đợt 115): thẻ kỳ đang dùng gắn nhãn "Gói đang
 *    dùng" + nút Gia hạn gói này (buy), kỳ khác là Đổi sang gói này
 *    (switch); cột phải là khối thông tin thành viên (kỳ/hạn/trạng thái,
 *    công tắc Tự gia hạn, Huỷ gói xác nhận inline). */
export type PassTermVM = {
  months: number;
  price: number;
  perMonth: number;
  savePct: number;
  isShortest: boolean;
  isBest: boolean;
};

export type PassMemberVM = {
  currentTermMonths: number | null;
  termText: string;
  expiryText: string;
  cancelled: boolean;
  autoRenew: boolean;
};

type Props = {
  name: string;
  terms: PassTermVM[];
  cashbackPercent: number;
  discountPercent: number;
  hasGift: boolean;
  loggedIn: boolean;
  balance: number | null;
  member: PassMemberVM | null;
};

export function PassPricing({ name, terms, cashbackPercent, discountPercent, hasGift, loggedIn, balance, member }: Props) {
  const { t, m } = useLang();
  const isMember = !!member;
  const bestIdx = terms.findIndex((x) => x.isBest);
  const [sel, setSel] = useState(bestIdx >= 0 ? bestIdx : 0);
  const cur = terms[Math.min(sel, terms.length - 1)] ?? terms[0];

  const features: string[] = [];
  if (cashbackPercent > 0) features.push(`${t("Hoàn ví")} ${cashbackPercent}% ${t("mỗi đơn")}`);
  if (discountPercent > 0) features.push(`${t("Giảm thêm")} ${discountPercent}% ${t("khi thanh toán")}`);
  if (hasGift) features.push(t("Quà tặng mỗi tháng"));

  const card = (term: PassTermVM, i: number) => {
    const isCurrent = isMember && member.currentTermMonths === term.months;
    const selected = isMember ? isCurrent : sel === i;
    const badge = isCurrent ? t("Gói đang dùng") : term.isBest ? t("Tiết kiệm nhất") : null;
    let action: ReactNode;
    if (isMember) {
      // Đúng rẽ nhánh của đợt 115: không phải kỳ đang dùng -> Đổi gói
      // (kể cả khi tài khoản cũ chưa ghi kỳ, passTermMonths = null);
      // kỳ đang dùng -> Gia hạn bằng đường mua cộng dồn.
      action = !isCurrent ? (
        <form action={switchPassAction}>
          <input type="hidden" name="months" value={term.months} />
          <button className="btn-ghost w-full">{t("Đổi sang gói này")}</button>
        </form>
      ) : (
        <form action={buyPassAction}>
          <input type="hidden" name="months" value={term.months} />
          <button className="btn-primary w-full">{t("Gia hạn gói này")}</button>
        </form>
      );
    } else {
      action = (
        <button
          type="button"
          onClick={() => setSel(i)}
          className={`w-full ${selected ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={selected}
        >
          {selected ? t("Đang chọn") : t("Chọn gói này")}
        </button>
      );
    }
    return (
      <div
        key={term.months}
        onClick={isMember ? undefined : () => setSel(i)}
        className={`card relative flex h-full flex-col border-2 p-5 ${
          selected
            ? "border-brand-600 bg-gradient-to-b from-brand-50 to-white shadow-[0_12px_28px_rgba(56,102,204,0.16)] dark:from-brand-900/50 dark:to-transparent"
            : "border-slate-200"
        } ${isMember ? "" : "cursor-pointer"}`}
      >
        {badge && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-md shadow-brand-600/30">
            {badge}
          </span>
        )}
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
          <span className={`relative h-[17px] w-[17px] shrink-0 rounded-full border-2 ${selected ? "border-brand-600" : "border-slate-300"}`}>
            {selected && <span className="absolute inset-[3px] rounded-full bg-brand-600" />}
          </span>
          {name} · {term.months} {t("tháng")}
        </div>
        <div className={`mt-3 text-[29px] font-extrabold leading-none ${selected ? "text-brand-700" : "text-slate-900"}`}>{m(term.price)}</div>
        <div className="mt-1.5 text-[13.5px] text-slate-500">
          {t("Tương đương")} {m(term.perMonth)}/{t("tháng")}
        </div>
        <div className="mt-2.5 flex h-6 items-center">
          {term.savePct > 0 ? (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
              {t("Tiết kiệm")} {term.savePct}%
            </span>
          ) : term.isShortest ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-400">{t("Dùng thử linh hoạt")}</span>
          ) : (
            <span className="invisible rounded-full px-2.5 py-0.5 text-xs">.</span>
          )}
        </div>
        <ul className="mt-4 flex flex-1 flex-col gap-2 border-t border-slate-100 pt-3.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13.5px] text-slate-500">
              <span className="mt-[3px] shrink-0 text-brand-600 [&_svg]:h-[15px] [&_svg]:w-[15px]">{I.check}</span>
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5">{action}</div>
      </div>
    );
  };

  const walletLine = loggedIn && balance !== null && (
    <p className="mt-3.5 text-sm text-slate-500">
      {t("Số dư ví của bạn:")} <b className="text-slate-800">{m(balance)}</b>
      {" · "}
      <Link href="/dashboard/nap-tien" className="font-semibold text-brand-600 hover:underline">
        {t("Nạp thêm tiền")}
      </Link>
    </p>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="grid gap-4 pt-3 sm:grid-cols-2 xl:grid-cols-3">{terms.map(card)}</div>
        {walletLine}
      </div>

      {isMember ? (
        /* ---- Tóm tắt THÀNH VIÊN (đợt 115) ---- */
        <aside className="card p-5 lg:sticky lg:top-24">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{I.star}</span>
            <div className="text-[16.5px] font-extrabold text-slate-900">{t("Gói hiện tại")}</div>
          </div>
          <div className="mt-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-2">
              <span className="text-slate-500">{t("Kỳ đang dùng")}</span>
              <b className="text-right text-slate-800">{member.termText}</b>
            </div>
            <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-2">
              <span className="text-slate-500">{t("Hạn dùng tới")}</span>
              <b className="text-right text-slate-800">{member.expiryText}</b>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 py-2">
              <span className="text-slate-500">{t("Trạng thái")}</span>
              {member.cancelled ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{t("Đã huỷ")}</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{t("Đang còn hạn")}</span>
              )}
            </div>
            {member.cancelled && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-800">
                {t("Đã huỷ — dùng tới")} {member.expiryText}. {t("Mua, gia hạn hoặc đổi gói lại sẽ kích hoạt lại và xoá trạng thái huỷ.")}
              </p>
            )}
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-slate-500">
                {t("Tự gia hạn")}
                <span className="block text-xs text-slate-400">{t("Tự trừ ví khi sắp hết hạn")}</span>
              </span>
              {member.cancelled ? (
                <b className="text-slate-400">{t("Tắt")}</b>
              ) : (
                <form action={setPassAutoRenewAction}>
                  <input type="hidden" name="on" value={member.autoRenew ? "0" : "1"} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={member.autoRenew}
                    aria-label={t("Tự gia hạn")}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${member.autoRenew ? "bg-brand-600" : "bg-slate-300"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${member.autoRenew ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </form>
              )}
            </div>
          </div>

          {!member.cancelled && (
            <details className="group mt-3 border-t border-slate-100 pt-3">
              <summary className="inline-flex cursor-pointer list-none items-center rounded-xl px-3 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 [&::-webkit-details-marker]:hidden">
                {t("Huỷ gói")}
              </summary>
              <div className="mt-3 rounded-2xl bg-red-50 p-4">
                <p className="text-[13px] leading-relaxed text-red-800">
                  {t("Huỷ gói: quyền lợi vẫn dùng tiếp tới hết hạn đã trả, không hoàn tiền và tự gia hạn sẽ tắt. Bạn có thể mua, gia hạn hoặc đổi gói lại bất cứ lúc nào.")}
                </p>
                <form action={cancelPassAction} className="mt-3">
                  <button className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700">{t("Xác nhận huỷ gói")}</button>
                </form>
              </div>
            </details>
          )}
        </aside>
      ) : (
        /* ---- Tóm tắt MUA MỚI (mockup Hướng A) ---- */
        <aside className="card p-5 shadow-soft lg:sticky lg:top-24">
          <h3 className="flex items-center gap-2 text-[16.5px] font-extrabold text-slate-900">
            <span className="text-brand-600 [&>svg]:h-[19px] [&>svg]:w-[19px]">{I.star}</span>
            {t("Tóm tắt")}
          </h3>
          <div className="mt-1.5 text-sm">
            <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-[9px]">
              <span className="text-slate-500">{t("Gói đã chọn")}</span>
              <b className="text-right text-slate-800">
                {name} · {cur.months} {t("tháng")}
              </b>
            </div>
            {cashbackPercent > 0 && (
              <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-[9px]">
                <span className="text-slate-500">
                  {t("Hoàn ví")} {t("mỗi đơn")}
                </span>
                <b className="text-right text-slate-800">{cashbackPercent}%</b>
              </div>
            )}
            {discountPercent > 0 && (
              <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-[9px]">
                <span className="text-slate-500">{t("Giảm thêm")}</span>
                <b className="text-right text-slate-800">{discountPercent}%</b>
              </div>
            )}
            {hasGift && (
              <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-[9px]">
                <span className="text-slate-500">{t("Quà mỗi tháng")}</span>
                <b className="text-right text-slate-800">{t("Có")}</b>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 pt-[13px]">
              <span className="text-slate-500">{t("Tổng thanh toán")}</span>
              <b className="text-[21px] font-extrabold text-brand-700">{m(cur.price)}</b>
            </div>
          </div>
          {loggedIn ? (
            <form action={buyPassAction}>
              <input type="hidden" name="months" value={cur.months} />
              <button className="btn-primary mt-3.5 w-full !py-[13px] text-base font-extrabold">{t("Mua ngay")}</button>
            </form>
          ) : (
            <Link href="/login" className="btn-primary mt-3.5 w-full !py-[13px] text-center text-base font-extrabold">
              {t("Đăng nhập để mua")}
            </Link>
          )}
          <p className="mt-[11px] text-center text-xs text-slate-400">
            {t("Thanh toán bằng số dư ví")} · {t("Kích hoạt ngay sau khi mua")}
          </p>
        </aside>
      )}
    </div>
  );
}
