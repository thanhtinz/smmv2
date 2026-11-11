"use client";
import { useEffect, useState } from "react";
import { CopyBtn } from "@/components/client";
import { startPaypalCheckoutAction, startStripeCheckoutAction, createBoltDepositAction } from "@/app/actions/user";
import { useLang } from "@/components/lang";

/** Thẻ Nạp tiền hợp nhất: chọn 1 phương thức — QR ngân hàng (tự động qua SePay,
 *  CHỈ ngân hàng; MoMo đã bỏ hẳn theo lệnh Tín 2026-11-10 21:12) / PayPal / Stripe / USDT.
 *  Nội dung dưới đổi theo phương thức đang chọn. */
type BankInfo = { name: string; account: string; holder: string; qr: string; content: string; min: number };
type IntlInfo = { rate: number; paypal: boolean; stripe: boolean; minUsd?: number };
type BoltPending = { code: string; checkoutUrl: string | null; paymentAddress: string | null; cryptoAmount: string | null; network: string; expiresAt: string | null; status: string };
type UsdtInfo = { rate: number; minUsd: number; defaultNetwork: string; networks: string[]; pending: BoltPending | null };
type MethodKey = "sepay" | "paypal" | "stripe" | "usdt";
type BonusTier = { from: number; percent: number };

/** URL VietQR kèm số tiền: giữ NGUYÊN mẫu URL server đã sinh (chỉ thay/điền
 *  tham số amount) — URL không có amount (vietqrUrl) thì thêm amount vào cuối,
 *  URL đã có amount=0 (vietQrUrl) thì thay đúng con số đó. QR do admin tự tải
 *  lên (không phải vietqr.io) giữ nguyên, không gắn tham số lạ. */
function qrWithAmount(qr: string, amount: number): string {
  if (!qr || amount <= 0 || !qr.includes("vietqr.io")) return qr;
  if (/[?&]amount=/.test(qr)) return qr.replace(/([?&]amount=)[^&]*/, `$1${amount}`);
  return `${qr}${qr.includes("?") ? "&" : "?"}amount=${amount}`;
}

export function DepositCard({ bank, banks, intl, usdt, tiers }: { bank: BankInfo | null; banks?: BankInfo[]; intl: IntlInfo | null; usdt?: UsdtInfo | null; tiers?: BonusTier[] }) {
  const { t, td, m } = useLang();
  const bankList: BankInfo[] = banks && banks.length ? banks : bank ? [bank] : [];
  const [bankIdx, setBankIdx] = useState(0);
  const curBank: BankInfo | null = bankList[Math.min(bankIdx, Math.max(0, bankList.length - 1))] || null;
  const methods: { key: MethodKey; brand: React.ReactNode; desc: string }[] = [
    ...(curBank ? [{ key: "sepay" as const, brand: <span className="text-slate-800">{t("QR ngân hàng")}</span>, desc: t("Ngân hàng · cộng tự động") }] : []),
    ...(intl?.paypal ? [{ key: "paypal" as const, brand: <><span className="text-[#003087] dark:text-[#7aa7ff]">Pay</span><span className="text-[#0079C1] dark:text-[#4db2ff]">Pal</span></>, desc: t("Trả USD · cộng theo tỉ giá") }] : []),
    ...(intl?.stripe ? [{ key: "stripe" as const, brand: <span className="text-[#635BFF]">Stripe</span>, desc: t("Thẻ Visa / Mastercard") }] : []),
    ...(usdt ? [{ key: "usdt" as const, brand: <span className="text-[#26A17B]">USDT</span>, desc: t("Crypto · cộng tự động") }] : []),
  ];
  const [method, setMethod] = useState<MethodKey>(methods[0]?.key || "sepay");
  // Luồng 2 bước của QR ngân hàng (lệnh Tín 2026-11-10 21:00): nhập số tiền ở
  // thẻ trái + bấm "Nạp tiền" thì thẻ panel bên phải MỚI hiện (QR sinh kèm số
  // tiền). Chuyển sang phương thức khác là bước ngân hàng reset — quay lại
  // phải nhập/bấm lại.
  const [bankAmount, setBankAmount] = useState("");
  const [bankConfirmed, setBankConfirmed] = useState<number | null>(null);
  const [bankErr, setBankErr] = useState("");
  const selectMethod = (k: MethodKey) => {
    setMethod(k);
    if (k !== "sepay") { setBankConfirmed(null); setBankErr(""); }
  };
  const confirmBank = () => {
    const amt = parseInt(bankAmount, 10) || 0;
    const min = curBank?.min || 10000;
    if (!amt || amt < min) { setBankErr(`${t("Số tiền nạp tối thiểu là")} ${m(min)}`); setBankConfirmed(null); return; }
    setBankErr("");
    setBankConfirmed(amt);
  };
  // Thưởng theo mốc — cùng công thức calcBonus phía server: lấy % cao nhất
  // trong các mốc đạt, bonus = floor(số tiền × % / 100).
  const bonusPct = bankConfirmed ? (tiers || []).reduce((p, tr) => (bankConfirmed >= tr.from && tr.percent > p ? tr.percent : p), 0) : 0;
  const bonusAmt = bankConfirmed ? Math.floor((bankConfirmed * bonusPct) / 100) : 0;
  const [usd, setUsd] = useState("10");
  const [vndUsdt, setVndUsdt] = useState("250000");
  const rate = intl?.rate || usdt?.rate || 25000;
  const vndVal = Math.round((parseFloat(usd) || 0) * rate);
  const isIntl = method === "paypal" || method === "stripe";
  const isUsdt = method === "usdt";

  if (methods.length === 0) {
    return <div className="card p-6"><h2 className="font-bold text-slate-900 mb-2">{t("Nạp tiền")}</h2><p className="text-sm text-slate-500">{t("Admin chưa cấu hình phương thức nạp nào. Vui lòng liên hệ hỗ trợ.")}</p></div>;
  }

  return (
    <div>
      <h2 className="font-bold text-slate-900 mb-4">{t("Nạp tiền")}</h2>
      {/* Bố cục 2 THẺ TÁCH HẲN (lệnh Tín 2026-11-10 20:49): cột TRÁI là thẻ
          riêng chứa lưới phương thức 2×2 (2 cái trên, 2 cái dưới), cột PHẢI
          là thẻ riêng của panel phương thức đang chọn (ngân hàng: QR ở
          trên, thông tin chuyển khoản ngay bên dưới) — hai thẻ rời nhau,
          nền trang lọt ở giữa, không còn chung một thẻ bao. Tiêu đề "Nạp
          tiền" đưa ra ngoài làm tiêu đề mục. Mobile: hai thẻ xếp dọc, thẻ
          phương thức ở trên, thẻ panel ở dưới.
          Riêng QR ngân hàng là luồng 2 BƯỚC (lệnh Tín 21:00): ô nhập số tiền
          + nút Nạp tiền nằm trong thẻ trái; CHƯA bấm nút (hoặc số tiền chưa
          hợp lệ) thì cột phải KHÔNG có thẻ panel; bấm hợp lệ mới hiện thẻ
          panel với QR kèm đúng số tiền vừa nhập. */}
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        <div className="card p-6" data-col="methods">
          <label className="lbl">{t("Phương thức thanh toán")}</label>
          <div className="grid grid-cols-2 gap-3">
            {methods.map((m) => {
              const active = method === m.key;
              return (
                <button key={m.key} type="button" onClick={() => selectMethod(m.key)}
                  className={`text-left border rounded-2xl p-3.5 transition ${active ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-extrabold">{m.brand}</span>
                    <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${active ? "border-brand-600" : "border-slate-300"}`}>
                      {active && <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
                    </span>
                  </span>
                  <span className="block text-xs text-slate-400 mt-1">{m.desc}</span>
                </button>
              );
            })}
          </div>
          {method === "sepay" && curBank && (
            <div className="mt-5 border-t border-dashed pt-5">
              <label className="lbl">{t("Số tiền nạp")}</label>
              <input
                className="inp" type="text" inputMode="numeric" name="bankAmount" placeholder="500.000"
                value={bankAmount ? Number(bankAmount).toLocaleString("vi-VN") : ""}
                onChange={(e) => { setBankAmount(e.target.value.replace(/\D/g, "").slice(0, 13)); if (bankErr) setBankErr(""); }}
              />
              <div className="text-xs text-slate-400 mt-1.5">{t("Nạp tối thiểu")}: {m(curBank.min)}</div>
              {bankErr && <p className="text-sm text-rose-600 mt-2">{bankErr}</p>}
              <button type="button" className="btn-primary w-full mt-4" onClick={confirmBank}>{t("Nạp tiền")}</button>
            </div>
          )}
        </div>
        {(method !== "sepay" || !curBank || bankConfirmed !== null) && (
        <div className="card p-6 min-w-0" data-col="panel">

      {method === "sepay" && (
        <div>
          {bankList.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {bankList.map((b, i) => (
                <button key={i} type="button" onClick={() => setBankIdx(i)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${i === bankIdx ? "bg-brand-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{b.name}</button>
              ))}
            </div>
          )}
          {/* Khối chuyển khoản HỢP NHẤT (lệnh Tín 2026-11-10): QR ở trên, toàn bộ
              nội dung chuyển khoản ngân hàng ngay bên dưới trong cùng một khối
              — không còn cảnh QR một nơi, thông tin một nẻo, và nội dung CK
              không lặp lại ở thẻ số dư nữa (thẻ đó đã bỏ hẳn). */}
          <div className="mx-auto w-full max-w-3xl">
            {curBank && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrWithAmount(curBank.qr, bankConfirmed || 0)} alt={t("VietQR nạp tiền")} className="mx-auto w-[200px] h-[200px] rounded-2xl border border-slate-200 object-contain bg-white" />
                <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3 text-sm">
                  <Row k={t("Ngân hàng")} v={curBank.name} />
                  <Row k={t("Số tài khoản")} v={curBank.account} copy />
                  <Row k={t("Chủ tài khoản")} v={curBank.holder} />
                  <Row k={t("Nội dung CK (bắt buộc đúng)")} v={curBank.content} copy strong />
                  <Row k={t("Nạp tối thiểu")} v={m(curBank.min)} />
                  {bankConfirmed !== null && <Row k={t("Số tiền nạp")} v={m(bankConfirmed)} strong />}
                  {bankConfirmed !== null && bonusPct > 0 && <Row k={`${t("Thưởng nạp")} (+${bonusPct}%)`} v={`+${m(bonusAmt)}`} />}
                  {bankConfirmed !== null && bonusPct > 0 && <Row k={t("Tổng cộng vào ví")} v={m(bankConfirmed + bonusAmt)} strong />}
                </dl>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-5">{t("Chuyển đúng nội dung là tiền cộng tự động qua SePay.")}</p>
          </div>
        </div>
      )}

      {isIntl && intl && (
        <form action={method === "paypal" ? startPaypalCheckoutAction : startStripeCheckoutAction}>
          <p className="text-sm text-slate-500 mb-4">{t("Tỉ giá:")} <b className="text-slate-700">{`$1 = ${rate.toLocaleString("vi-VN")}đ`}</b>{t(" · Tối thiểu ") + "$" + (intl.minUsd || 5) + t(" · Tiền cộng tự động ngay khi thanh toán thành công.")}</p>
          <div className="max-w-xs mb-5">
            <label className="lbl">{t("Số tiền (USD)")}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
              <input className="inp !pl-7" name="usd" type="number" min={intl.minUsd || 5} step="1" value={usd} onChange={(e) => setUsd(e.target.value)} />
            </div>
            <div className="text-sm mt-2 text-slate-500">{t("Nhận được ≈")} <b className="text-emerald-700">{m(vndVal)}</b></div>
          </div>
          <button className="btn-primary w-full sm:w-auto !px-8">{t("Thanh toán qua ") + (method === "paypal" ? "PayPal" : "Stripe")}</button>
        </form>
      )}

      {isUsdt && usdt && (
        <div>
          {usdt.pending ? (
            <BoltPendingPanel p={usdt.pending} />
          ) : (
            <form action={createBoltDepositAction}>
              <p className="text-sm text-slate-500 mb-4">{t("Nhập số tiền muốn nạp — hệ thống tạo phiên thanh toán USDT qua BoltUtil, tiền cộng tự động khi giao dịch được xác nhận. Tỉ giá: ")}<b className="text-slate-700">{`1 USDT = ${usdt.rate.toLocaleString("vi-VN")}đ`}</b>{t(" · Tối thiểu ")}{usdt.minUsd} USDT.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div>
                  <label className="lbl">{t("Số tiền nạp (VNĐ)")}</label>
                  <input className="inp" name="vnd" type="number" min={10000} step={1000} required value={vndUsdt} onChange={(e) => setVndUsdt(e.target.value)} />
                  <div className="text-sm mt-2 text-slate-500">{t("Tương đương ≈")} <b className="text-emerald-700">{((parseInt(vndUsdt) || 0) / usdt.rate).toFixed(2)} USDT</b></div>
                </div>
                <div>
                  <label className="lbl">{t("Mạng")}</label>
                  <select className="inp" name="network" defaultValue={usdt.defaultNetwork}>
                    {usdt.networks.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-primary mt-5">{t("Tạo phiên nạp USDT")}</button>
            </form>
          )}
        </div>
      )}

        </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, copy, strong, mono }: { k: string; v: string; copy?: boolean; strong?: boolean; mono?: boolean }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`flex items-center gap-2 ${mono ? "font-mono text-[13px] break-all" : ""} ${strong ? "font-extrabold text-brand-700" : "font-semibold text-slate-800"}`}>{v}{copy && <CopyBtn text={v} label={t("Chép")} />}</dd>
    </div>
  );
}

/** Phiên nạp USDT đang chờ: nút mở trang thanh toán BoltUtil, địa chỉ + số lượng
 *  chính xác cho chuyển tay, đếm ngược hết hạn và tự hỏi trạng thái mỗi 10 giây. */
function BoltPendingPanel({ p }: { p: BoltPending }) {
  const { t } = useLang();
  const [remain, setRemain] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!p.expiresAt) return;
    const tick = () => {
      const ms = new Date(p.expiresAt as string).getTime() - Date.now();
      if (ms <= 0) { setRemain("00:00"); return; }
      const sec = Math.floor(ms / 1000);
      setRemain(`${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [p.expiresAt]);
  useEffect(() => {
    if (done) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/deposits/boltutil-status?code=${encodeURIComponent(p.code)}`);
        const j = await r.json();
        if (j.status === "APPROVED") { setDone(true); setTimeout(() => window.location.reload(), 1500); }
      } catch { /* thử lại ở chu kỳ sau */ }
    }, 10000);
    return () => clearInterval(iv);
  }, [p.code, done]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-bold ${done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {done ? t("Đã cộng tiền vào ví") : `${t("Đang chờ thanh toán")} · ${p.code}`}
        </span>
        {remain && !done && <span className="text-sm font-semibold text-slate-500">{t("Hết hạn sau")} {remain}</span>}
      </div>
      {p.checkoutUrl && !done && (
        <a href={p.checkoutUrl} target="_blank" rel="noreferrer" className="btn-primary mb-4 inline-block">{t("Mở trang thanh toán BoltUtil")}</a>
      )}
      <dl className="space-y-3 text-sm max-w-xl">
        <Row k={t("Mạng")} v={p.network} />
        {p.cryptoAmount && <Row k={t("Số USDT cần chuyển")} v={p.cryptoAmount} strong />}
        {p.paymentAddress && <Row k={t("Địa chỉ nhận")} v={p.paymentAddress} copy mono />}
      </dl>
      <p className="text-xs text-slate-400 mt-4">{t("Chuyển đúng mạng và đúng số lượng — tiền tự cộng vào ví khi giao dịch được xác nhận.")}</p>
    </div>
  );
}
