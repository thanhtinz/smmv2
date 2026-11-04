"use client";
import { useState } from "react";
import { startStripeCheckoutAction, startPaypalCheckoutAction } from "@/app/actions/user";

/** Nạp tiền qua cổng quốc tế: CHỌN 1 phương thức (PayPal / Stripe) -> nhập USD -> 1 nút thanh toán */
export function IntlDeposit({ rate, paypal, stripe }: { rate: number; paypal: boolean; stripe: boolean }) {
  const [method, setMethod] = useState<"paypal" | "stripe">(paypal ? "paypal" : "stripe");
  const [usd, setUsd] = useState("10");
  const vndVal = Math.round((parseFloat(usd) || 0) * rate);
  const methods = [
    ...(paypal ? [{ key: "paypal" as const, name: <><span className="text-[#003087]">Pay</span><span className="text-[#0079C1]">Pal</span></>, desc: "Tài khoản PayPal hoặc thẻ qua PayPal" }] : []),
    ...(stripe ? [{ key: "stripe" as const, name: <span className="text-[#635BFF]">Stripe</span>, desc: "Thẻ Visa / Mastercard qua Stripe" }] : []),
  ];
  return (
    <div className="card p-6 mt-6">
      <h2 className="font-bold text-slate-900 mb-1">Thanh toán quốc tế</h2>
      <p className="text-sm text-slate-500 mb-4">Tỉ giá: <b className="text-slate-700">$1 = {rate.toLocaleString("vi-VN")}đ</b> · Tối thiểu $5 · Tiền cộng tự động ngay khi thanh toán thành công.</p>
      <form action={method === "paypal" ? startPaypalCheckoutAction : startStripeCheckoutAction}>
        <label className="lbl">Phương thức thanh toán</label>
        <div className={`grid gap-3 mb-5 ${methods.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {methods.map((m) => {
            const active = method === m.key;
            return (
              <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                className={`text-left border rounded-2xl p-4 transition ${active ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"}`}>
                <span className="flex items-center justify-between">
                  <span className="font-extrabold text-lg">{m.name}</span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? "border-brand-600" : "border-slate-300"}`}>
                    {active && <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
                  </span>
                </span>
                <span className="block text-xs text-slate-400 mt-1">{m.desc}</span>
              </button>
            );
          })}
        </div>
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
    </div>
  );
}
