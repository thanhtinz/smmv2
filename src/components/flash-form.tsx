"use client";
import { useState } from "react";
import { useLang } from "@/components/lang";

/** Form tạo Flash Sale (dùng chung Admin mẹ + Panel Admin): chọn PHẠM VI áp dụng
 *  — Chung (SMM + Premium) / Chỉ SMM / Chỉ Premium — rồi hiện bộ chọn tương ứng:
 *  dịch vụ SMM theo ID (như cũ) và/hoặc danh sách sản phẩm Premium tích chọn. */
export function FlashSaleForm({ action, products }: { action: (formData: FormData) => void; products: { id: number; name: string }[] }) {
  const { t } = useLang();
  const [scope, setScope] = useState("SMM");
  const [svcScope, setSvcScope] = useState("all");
  const [prodScope, setProdScope] = useState("all");
  const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]";
  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <input className={`${inputCls} col-span-2`} name="name" required placeholder={t("Tên chương trình")} />
        <input className={inputCls} name="percent" type="number" min={1} max={90} required placeholder={t("Giảm %")} />
        <input className={inputCls} name="startsAt" type="datetime-local" required />
        <input className={inputCls} name="endsAt" type="datetime-local" required />
        <select className={inputCls} name="applyScope" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="ALL">{t("Chung (SMM + Premium)")}</option>
          <option value="SMM">{t("Chỉ SMM")}</option>
          <option value="PREMIUM">{t("Chỉ Premium")}</option>
        </select>
      </div>
      {scope !== "PREMIUM" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <select className={inputCls} name="svcScope" value={svcScope} onChange={(e) => setSvcScope(e.target.value)}>
            <option value="all">{t("Toàn bộ dịch vụ")}</option>
            <option value="some">{t("Theo ID dịch vụ")}</option>
          </select>
          <input className={`${inputCls} col-span-2 lg:col-span-5`} name="serviceIds" placeholder={t("ID dịch vụ (khi chọn Theo ID, cách nhau bằng dấu phẩy) — để trống nếu áp toàn bộ")} />
        </div>
      )}
      {scope !== "SMM" && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-slate-600">{t("Sản phẩm Premium áp dụng")}</span>
            <select className={inputCls} name="prodScope" value={prodScope} onChange={(e) => setProdScope(e.target.value)}>
              <option value="all">{t("Toàn bộ sản phẩm")}</option>
              <option value="some">{t("Theo sản phẩm")}</option>
            </select>
          </div>
          {prodScope === "some" && (
            <div className="mt-2 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
                  <input type="checkbox" name="productIds" value={p.id} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{p.name}</span>
                </label>
              ))}
              {products.length === 0 && <span className="text-[13px] text-slate-400">{t("Chưa có sản phẩm Premium nào đang bật.")}</span>}
            </div>
          )}
        </div>
      )}
      <button className="btn-primary !py-2">{t("Tạo flash sale")}</button>
    </form>
  );
}
