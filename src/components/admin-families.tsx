import { I } from "./ui";
import { famSaveVariant, famToggleVariant, famSaveProviderPricing } from "@/app/actions/admin-families";
import { ADMIN_VARIANT_MARK, type FamilyVariant } from "@/lib/families";
import type { Provider } from "@prisma/client";

/** FIX8 TASK 4 — Mảnh giao diện dùng chung cho admin họ Telegram/Steam:
 *  thẻ giá nhà cung cấp (tỉ giá + markup) và hàng gói (sửa tên/giá, bật/tắt).
 *  Server components thuần form — không JS phía khách. */

export const fmtVnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function ProviderPricingCard({ provider, returnTo }: { provider: Provider; returnTo: string }) {
  return (
    <section className="card mb-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-brand-600">{I.server}</span>
        <h2 className="text-[15px] font-bold text-slate-800">Nhà cung cấp: {provider.name}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          Tự cập nhật giá khi đồng bộ: {provider.autoUpdatePrice ? "Bật" : "Tắt"}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          Đồng bộ tên/mô tả: {provider.syncContent ? "Bật" : "Tắt"}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-slate-500">
        Tỉ giá và markup là đầu vào giá của Stars và Steam Gift (chốt tươi theo báo giá FZR mỗi đơn) và của giá đồng bộ các gói khác.
      </p>
      <form action={famSaveProviderPricing} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="providerId" value={provider.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Tỉ giá (VNĐ / 1 USD)</span>
          <input name="exchangeRate" type="number" min={1} defaultValue={provider.exchangeRate} className="inp !w-44" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Markup (%)</span>
          <input name="markupPercent" type="number" min={0} max={1000} defaultValue={provider.markupPercent} className="inp !w-32" />
        </label>
        <button className="btn-primary btn-sm !px-4 !py-2.5">Lưu giá nhà cung cấp</button>
      </form>
    </section>
  );
}

export function VariantRow({ v, returnTo, meta }: { v: FamilyVariant; returnTo: string; meta: string }) {
  const custom = v.deliveryType === ADMIN_VARIANT_MARK;
  const selling = v.active && !v.outOfStock;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="min-w-[170px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold text-slate-800">{v.name}</span>
          {custom && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">Tự thêm</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selling ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
            {selling ? "Đang bán" : "Tạm dừng"}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-slate-400">{meta} · Mã NCC: {v.providerItemId || "—"}</div>
      </div>
      <form action={famSaveVariant} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên gói</span>
          <input name="name" defaultValue={v.name} className="inp !w-44 !py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Giá bán (VNĐ)</span>
          <input name="price" type="number" min={0} defaultValue={v.price} className="inp !w-36 !py-2 text-[13px]" />
        </label>
        <button className="btn-primary btn-sm !px-3.5 !py-2">Lưu</button>
      </form>
      <form action={famToggleVariant}>
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="on" value={selling ? "0" : "1"} />
        <button className={`btn-sm !px-3.5 !py-2 ${selling ? "btn-ghost !text-rose-600" : "btn-ghost !text-emerald-600"}`}>
          {selling ? "Tắt bán" : "Bật bán"}
        </button>
      </form>
    </div>
  );
}
