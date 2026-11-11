"use client";
import { useEffect, useRef, useState } from "react";
import { CopyBtn } from "@/components/client";
import { I } from "@/components/ui";
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

/** Thời hạn hiệu lực của mã QR nạp ngân hàng: 15 PHÚT cố định theo tài liệu
 *  chính thức của SePay — trang "Tạo trang QR thanh toán"
 *  (https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan),
 *  mẫu tham chiếu của SePay đặt `const deadline = Date.now() + 15 * 60_000`.
 *  Đây là giá trị theo tài liệu nhà cung cấp (lệnh Tín 2026-11-10 21:34 "thời
 *  gian phải theo tài liệu sepay") — KHÔNG phải cấu hình nghiệp vụ nên không
 *  đưa vào setting admin. Hết giờ chỉ đổi HIỂN THỊ (QR mờ + trạng thái hết
 *  hạn): webhook SePay vẫn cộng tiền theo nội dung CK bất cứ khi nào tiền về,
 *  đồng hồ này không chặn cộng tiền. */
const QR_DEADLINE_MS = 15 * 60_000;

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
    // Mỗi lần bấm hợp lệ (kể cả bấm lại cùng số tiền) là một cửa sổ QR mới:
    // tăng cycle để effect đếm ngược/polling chạy lại từ đầu.
    setQrCycle((c) => c + 1);
  };
  // Thưởng theo mốc — cùng công thức calcBonus phía server: lấy % cao nhất
  // trong các mốc đạt, bonus = floor(số tiền × % / 100).
  const bonusAmt = bankConfirmed ? Math.floor((bankConfirmed * (tiers || []).reduce((p, tr) => (bankConfirmed >= tr.from && tr.percent > p ? tr.percent : p), 0)) / 100) : 0;
  // Đếm ngược + trạng thái thanh toán của QR ngân hàng (mẫu tài liệu SePay):
  // qrLeft = giây còn lại trong cửa sổ 15 phút; qrPaid = polling phát hiện
  // deposit BANK đúng số tiền đã về sau khi panel hiện.
  const [qrCycle, setQrCycle] = useState(0);
  const [qrLeft, setQrLeft] = useState<number | null>(null);
  const [qrPaid, setQrPaid] = useState(false);
  const qrBaseRef = useRef<number | null>(null);
  useEffect(() => {
    if (method !== "sepay" || bankConfirmed === null || !curBank) {
      setQrLeft(null); setQrPaid(false); qrBaseRef.current = null;
      return;
    }
    let stopped = false;
    setQrPaid(false);
    qrBaseRef.current = null;
    const deadline = Date.now() + QR_DEADLINE_MS;
    const tick = () => setQrLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    // Polling trạng thái mỗi 3 GIÂY (đúng nhịp mẫu SePay): lấy mốc deposit
    // khớp mới nhất trước, sau đó chỉ "đã trả" khi có deposit khớp id lớn hơn
    // mốc. Ngừng hỏi khi đã trả hoặc khi cửa sổ hết hạn.
    let pollIv: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const r = await fetch(`/api/deposits/bank-status?amount=${bankConfirmed}`);
        const j = await r.json();
        if (!stopped && j && j.ok) qrBaseRef.current = typeof j.latestId === "number" ? j.latestId : 0;
      } catch { if (!stopped) qrBaseRef.current = 0; }
      if (stopped) return;
      pollIv = setInterval(async () => {
        if (Date.now() >= deadline) { if (pollIv) clearInterval(pollIv); return; }
        try {
          const r = await fetch(`/api/deposits/bank-status?amount=${bankConfirmed}&afterId=${qrBaseRef.current ?? 0}`);
          const j = await r.json();
          if (!stopped && j && j.ok && j.paid) { setQrPaid(true); if (pollIv) clearInterval(pollIv); }
        } catch { /* lỗi mạng thoáng qua — chu kỳ 3 giây sau thử lại */ }
      }, 3000);
    })();
    return () => { stopped = true; clearInterval(iv); if (pollIv) clearInterval(pollIv); };
    // bankIdx trong deps: đổi ngân hàng = QR khác -> cửa sổ đếm ngược mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, bankConfirmed, qrCycle, bankIdx]);
  const qrExpired = qrLeft !== null && qrLeft <= 0 && !qrPaid;
  const qrMmSs = qrLeft !== null ? `${String(Math.floor(qrLeft / 60)).padStart(2, "0")}:${String(qrLeft % 60).padStart(2, "0")}` : "15:00";
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
          {/* Panel QR ngân hàng (lệnh Tín 2026-11-10 21:32 theo ảnh mẫu + 21:34
              theo tài liệu SePay): QR ở trên kèm đếm ngược 15 phút và dòng
              trạng thái đúng mẫu doc ("Đang chờ thanh toán · mm:ss" / "Đơn
              hàng đã hết hạn" / "Thanh toán thành công" — trạng thái lấy từ
              polling 3 giây/lần). Dưới QR CHỈ còn khối "Thành phần thanh
              toán" của ảnh mẫu: Ngân hàng / Số tài khoản / Chủ sở hữu / Nội
              dung — gạch ngang — Số tiền yêu cầu / Thưởng nạp / Thực nhận —
              hộp ghi chú cộng tiền tự động 1-3 phút. Hàng "Nạp tối thiểu" và
              câu ghi chú cuối cũ đã bỏ (tối thiểu đã chặn ở ô nhập bên trái);
              các nút dưới ảnh mẫu (Tải hoá đơn / Mở ngân hàng / Tôi đã
              chuyển khoản) KHÔNG làm — "Tôi đã chuyển khoản" là khai báo,
              Tín đã cấm. */}
          <div className="mx-auto w-full max-w-3xl">
            {curBank && bankConfirmed !== null && (
              <div>
                <div className="relative mx-auto h-[200px] w-[200px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrWithAmount(curBank.qr, bankConfirmed)} alt={t("VietQR nạp tiền")} className="h-[200px] w-[200px] rounded-2xl border border-slate-200 object-contain bg-white" />
                  {qrExpired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-white/90 px-3 text-center">
                      <span className="text-sm font-bold text-rose-600">{t("Mã QR đã hết hạn")}</span>
                      <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={() => setQrCycle((c) => c + 1)}>{t("Tạo mã mới")}</button>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center">
                  {qrPaid ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-[13px] font-bold text-emerald-800">
                      <span className="[&>svg]:h-4 [&>svg]:w-4">{I.check}</span>{t("Thanh toán thành công")}
                    </span>
                  ) : qrExpired ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3.5 py-1.5 text-[13px] font-bold text-rose-700">
                      <span className="[&>svg]:h-4 [&>svg]:w-4">{I.clock}</span>{t("Đơn hàng đã hết hạn")}
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold ${qrLeft !== null && qrLeft <= 60 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                      <span className="[&>svg]:h-4 [&>svg]:w-4">{I.clock}</span>{t("Đang chờ thanh toán")} · {qrMmSs}
                    </span>
                  )}
                </div>
                <div className="mt-7" data-payinfo="1">
                  <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-slate-400">
                    <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{I.wallet}</span>{t("Thành phần thanh toán")}
                  </div>
                  <div className="mt-4 space-y-3.5 text-sm">
                    <PayRow k={t("Ngân hàng")} v={curBank.name} cls="font-bold text-slate-900" />
                    <PayRow k={t("Số tài khoản")} v={curBank.account} copy cls="font-bold text-brand-600" />
                    <PayRow k={t("Chủ sở hữu")} v={curBank.holder} cls="font-bold text-slate-900" />
                    <PayRow k={t("Nội dung")} v={curBank.content} copy cls="font-extrabold text-rose-600" />
                  </div>
                  <div className="my-5 border-t border-slate-200" />
                  <div className="space-y-3.5 text-sm">
                    <PayRow k={t("Số tiền yêu cầu")} v={m(bankConfirmed)} cls="font-semibold text-slate-800" />
                    <PayRow k={t("Thưởng nạp")} v={`+${m(bonusAmt)}`} cls={bonusAmt > 0 ? "font-semibold text-emerald-600" : "font-semibold text-slate-500"} />
                    <div className="flex items-center justify-between gap-3 pt-1" data-payrow="1">
                      <span className="text-[15px] font-bold text-slate-900">{t("Thực nhận")}</span>
                      <span className="text-[22px] font-extrabold leading-none text-brand-600">+{m(bankConfirmed + bonusAmt)}</span>
                    </div>
                  </div>
                  <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                    <span className="mt-0.5 shrink-0 text-slate-400 [&>svg]:h-5 [&>svg]:w-5">{I.info}</span>
                    <p className="text-sm leading-relaxed text-slate-600">{t("Tự động cộng tiền sau 1-3 phút. Nếu quá thời gian quy định hãy liên hệ CSKH.")}</p>
                  </div>
                </div>
              </div>
            )}
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

/** Một hàng của khối "Thành phần thanh toán" dưới QR ngân hàng: nhãn trái,
 *  giá trị phải (kiểu chữ/màu truyền qua cls), nút chép tuỳ chọn. */
function PayRow({ k, v, copy, cls }: { k: string; v: string; copy?: boolean; cls?: string }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between gap-3" data-payrow="1">
      <span className="shrink-0 text-slate-500">{k}</span>
      <span className={`flex items-center gap-2 text-right ${cls || "font-semibold text-slate-800"}`}>{v}{copy && <CopyBtn text={v} label={t("Chép")} />}</span>
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
