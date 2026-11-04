"use client";
import { useState } from "react";
import { startStripeCheckoutAction, startPaypalCheckoutAction } from "@/app/actions/user";

/** Nạp tiền qua cổng quốc tế: nhập USD -> xem trước số VND nhận được theo tỉ giá admin đặt */
export function IntlDeposit({ rate, paypal, stripe }: { rate: number; paypal: boolean; stripe: boolean }) {
  const [usd, setUsd] = useState("10");
  const vndVal = Math.round((parseFloat(usd) || 0) * rate);
  return (
    <div className="card p-6 mt-6">
      <h2 className="font-bold text-slate-900 mb-1">Thanh toán quốc tế</h2>
      <p className="text-sm text-slate-500 mb-4">Tỉ giá: <b className="text-slate-700">$1 = {rate.toLocaleString("vi-VN")}đ</b> · Tối thiểu $5 · Tiền cộng tự động ngay khi thanh toán thành công.</p>
      <div className="max-w-xs mb-5">
        <label className="lbl">Số tiền (USD)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
          <input className="inp !pl-7" type="number" min={5} step="1" value={usd} onChange={(e) => setUsd(e.target.value)} />
        </div>
        <div className="text-sm mt-2 text-slate-500">Nhận được ≈ <b className="text-emerald-700">{vndVal.toLocaleString("vi-VN")}đ</b></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {paypal && (
          <form action={startPaypalCheckoutAction} className="border border-slate-200 rounded-2xl p-4">
            <input type="hidden" name="usd" value={usd} />
            <div className="font-extrabold text-lg mb-1"><span className="text-[#003087]">Pay</span><span className="text-[#0079C1]">Pal</span></div>
            <p className="text-xs text-slate-400 mb-3">Thanh toán bằng tài khoản PayPal hoặc thẻ qua PayPal.</p>
            <button className="btn-primary w-full">Thanh toán qua PayPal</button>
          </form>
        )}
        {stripe && (
          <form action={startStripeCheckoutAction} className="border border-slate-200 rounded-2xl p-4">
            <input type="hidden" name="usd" value={usd} />
            <div className="font-extrabold text-lg text-[#635BFF] mb-1">Stripe</div>
            <p className="text-xs text-slate-400 mb-3">Thanh toán bằng thẻ Visa / Mastercard qua Stripe.</p>
            <button className="btn-primary w-full">Thanh toán qua Stripe</button>
          </form>
        )}
      </div>
    </div>
  );
}
