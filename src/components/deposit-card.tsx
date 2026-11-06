"use client";
import { useState } from "react";
import { CopyBtn } from "@/components/client";
import { createDepositAction, startPaypalCheckoutAction, startStripeCheckoutAction, createUsdtDepositAction } from "@/app/actions/user";
import { vnd } from "@/lib/format";

/** Thẻ Nạp tiền hợp nhất: chọn 1 phương thức — SePay (ngân hàng + MoMo chung 1 cổng đối soát) / PayPal / Stripe.
 *  Nội dung dưới đổi theo phương thức đang chọn. */
type BankInfo = { name: string; account: string; holder: string; qr: string; content: string; min: number };
type MomoInfo = { phone: string; name: string; content: string };
type IntlInfo = { rate: number; paypal: boolean; stripe: boolean };
type UsdtInfo = { address: string; network: string; rate: number };
type MethodKey = "sepay" | "paypal" | "stripe" | "usdt";

export function DepositCard({ bank, banks, momo, tiers, intl, usdt }: { bank: BankInfo | null; banks?: BankInfo[]; momo: MomoInfo | null; tiers: { from: number; percent: number }[]; intl: IntlInfo | null; usdt?: UsdtInfo | null }) {
  const bankList: BankInfo[] = banks && banks.length ? banks : bank ? [bank] : [];
  const [bankIdx, setBankIdx] = useState(0);
  const curBank: BankInfo | null = bankList[Math.min(bankIdx, Math.max(0, bankList.length - 1))] || null;
  const methods: { key: MethodKey; brand: React.ReactNode; desc: string }[] = [
    ...(curBank || momo ? [{ key: "sepay" as const, brand: <span className="text-slate-800">QR ngân hàng</span>, desc: "Ngân hàng & MoMo · cộng tự động" }] : []),
    ...(intl?.paypal ? [{ key: "paypal" as const, brand: <><span className="text-[#003087] dark:text-[#7aa7ff]">Pay</span><span className="text-[#0079C1] dark:text-[#4db2ff]">Pal</span></>, desc: "Trả USD · cộng theo tỉ giá" }] : []),
    ...(intl?.stripe ? [{ key: "stripe" as const, brand: <span className="text-[#635BFF]">Stripe</span>, desc: "Thẻ Visa / Mastercard" }] : []),
    ...(usdt ? [{ key: "usdt" as const, brand: <span className="text-[#26A17B]">USDT</span>, desc: "Crypto · duyệt tay" }] : []),
  ];
  const [method, setMethod] = useState<MethodKey>(methods[0]?.key || "sepay");
  const [usd, setUsd] = useState("10");
  const rate = intl?.rate || 25000;
  const vndVal = Math.round((parseFloat(usd) || 0) * rate);
  const isIntl = method === "paypal" || method === "stripe";
  const isUsdt = method === "usdt";

  if (methods.length === 0) {
    return <div className="card p-6"><h2 className="font-bold text-slate-900 mb-2">Nạp tiền</h2><p className="text-sm text-slate-500">Admin chưa cấu hình phương thức nạp nào. Vui lòng liên hệ hỗ trợ.</p></div>;
  }

  return (
    <div className="card p-6">
      <h2 className="font-bold text-slate-900 mb-4">Nạp tiền</h2>
      <label className="lbl">Phương thức thanh toán</label>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {methods.map((m) => {
          const active = method === m.key;
          return (
            <button key={m.key} type="button" onClick={() => setMethod(m.key)}
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

      {method === "sepay" && (
        <div>
          {bankList.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {bankList.map((b, i) => (
                <button key={i} type="button" onClick={() => setBankIdx(i)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${i === bankIdx ? "bg-brand-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{b.name}</button>
              ))}
            </div>
          )}
          {curBank && (
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={curBank.qr} alt="VietQR nạp tiền" className="w-[200px] h-[200px] rounded-2xl border border-slate-200 object-contain bg-white" />
              <dl className="space-y-3 text-sm">
                <Row k="Ngân hàng" v={curBank.name} />
                <Row k="Số tài khoản" v={curBank.account} copy />
                <Row k="Chủ tài khoản" v={curBank.holder} />
                <Row k="Nội dung CK (bắt buộc đúng)" v={curBank.content} copy strong />
                <Row k="Nạp tối thiểu" v={vnd(curBank.min)} />
              </dl>
            </div>
          )}
          {momo && (
            <div className={curBank ? "mt-6 border-t border-dashed pt-5" : ""}>
              <h3 className="font-bold text-slate-900 mb-3">Ví MoMo</h3>
              <dl className="space-y-3 text-sm">
                <Row k="Số MoMo" v={momo.phone} copy />
                <Row k="Tên" v={momo.name} />
                <Row k="Nội dung" v={momo.content} copy strong />
              </dl>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4">Ngân hàng và MoMo đều được cộng tự động — chuyển đúng nội dung là tiền cộng ngay.</p>
        </div>
      )}

      {isIntl && intl && (
        <form action={method === "paypal" ? startPaypalCheckoutAction : startStripeCheckoutAction}>
          <p className="text-sm text-slate-500 mb-4">Tỉ giá: <b className="text-slate-700">$1 = {rate.toLocaleString("vi-VN")}đ</b> · Tối thiểu $5 · Tiền cộng tự động ngay khi thanh toán thành công.</p>
          <div className="max-w-xs mb-5">
            <label className="lbl">Số tiền (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
              <input className="inp !pl-7" name="usd" type="number" min={5} step="1" value={usd} onChange={(e) => setUsd(e.target.value)} />
            </div>
            <div className="text-sm mt-2 text-slate-500">Nhận được ≈ <b className="text-emerald-700">{vndVal.toLocaleString("vi-VN")}đ</b></div>
          </div>
          <button className="btn-primary w-full sm:w-auto !px-8">Thanh toán qua {method === "paypal" ? "PayPal" : "Stripe"}</button>
        </form>
      )}

      {isUsdt && usdt && (
        <form action={createUsdtDepositAction}>
          <p className="text-sm text-slate-500 mb-4">Chuyển USDT tới địa chỉ ví bên dưới (mạng <b className="text-slate-700">{usdt.network}</b>), sau đó khai số USDT và mã giao dịch — admin đối chiếu và cộng tiền. Tỉ giá: <b className="text-slate-700">1 USDT = {usdt.rate.toLocaleString("vi-VN")}đ</b> · Tối thiểu 5 USDT.</p>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <div className="min-w-0"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Địa chỉ ví {usdt.network}</div><div className="truncate font-mono text-sm font-semibold">{usdt.address}</div></div>
            <CopyBtn text={usdt.address} label="Sao chép địa chỉ ví" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div><label className="lbl">Số USDT đã chuyển</label><input className="inp" name="usdt" type="number" step="0.01" min={5} required placeholder="VD: 20" /></div>
            <div><label className="lbl">Mã giao dịch (tx hash)</label><input className="inp font-mono" name="txHash" required placeholder="Dán tx hash" /></div>
          </div>
          <button className="btn-primary mt-5">Khai báo đã chuyển USDT</button>
        </form>
      )}

      {!isIntl && !isUsdt && tiers.length > 0 && (
        <div className="mt-6 bg-brand-50 border border-brand-100 rounded-2xl p-4 text-sm">
          <div className="font-semibold text-brand-800 mb-1.5">Thưởng nạp hiện tại</div>
          {tiers.map((t) => <div key={t.from} className="text-brand-700">Nạp từ {vnd(t.from)}: <b>+{t.percent}%</b></div>)}
        </div>
      )}

      {method === "sepay" && (
        <form action={createDepositAction} className="mt-6 border-t border-dashed pt-5 space-y-3">
          <div className="font-semibold text-slate-800 text-sm">Đã chuyển khoản? Khai báo để đối soát nhanh hơn</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Số tiền đã chuyển</label>
              <input className="inp" name="amount" type="number" required min={curBank?.min || 10000} placeholder="500000" />
            </div>
            <div>
              <label className="lbl">Kênh</label>
              <select className="inp" name="method" defaultValue="BANK"><option value="BANK">Ngân hàng</option><option value="MOMO">MoMo</option><option value="CARD">Thẻ cào</option><option value="USDT">USDT</option></select>
            </div>
          </div>
          <button className="btn-dark w-full">Gửi khai báo nạp</button>
          <p className="text-xs text-slate-400">Hệ thống cộng tự động khi chuyển khoản đúng nội dung. Khai báo này giúp admin cộng tay nhanh nếu giao dịch bị lệch nội dung.</p>
        </form>
      )}
    </div>
  );
}

function Row({ k, v, copy, strong }: { k: string; v: string; copy?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`flex items-center gap-2 ${strong ? "font-extrabold text-brand-700" : "font-semibold text-slate-800"}`}>{v}{copy && <CopyBtn text={v} label="Chép" />}</dd>
    </div>
  );
}
