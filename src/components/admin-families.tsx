import Link from "next/link";
import { I } from "./ui";
import { famSaveVariant, famToggleVariant, famDeleteVariant, famSyncArea, famSaveAreaMarkup } from "@/app/actions/admin-families";
import { ADMIN_VARIANT_MARK, type FamilyVariant } from "@/lib/families";
import type { Provider } from "@prisma/client";

/** FIX8 TASK 4 — Mảnh giao diện dùng chung cho admin họ Telegram/Steam:
 *  hàng gói (sửa tên/giá, bật/tắt) và thẻ đồng bộ & markup của khu.
 *  TỈ GIÁ + MARKUP CHUNG của nhà cung cấp KHÔNG còn thẻ riêng ở các trang
 *  khu vực: cả hai sống trọn trong form nhà cung cấp (Admin → Nhà cung
 *  cấp, Provider.exchangeRate / markupPercent — "chỉnh 1 lần cho toàn
 *  bộ"); trang khu vực chỉ còn markup RIÊNG của khu (AreaSyncCard).
 *  Server components thuần form — không JS phía khách. */

export const fmtVnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function VariantRow({ v, returnTo, meta, deletable }: { v: FamilyVariant; returnTo: string; meta: string; deletable?: boolean }) {
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
        {(v.providerGroup === "gamekeys" || v.providerGroup === "giftcards") && (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">SL tối thiểu/đơn</span>
              <input name="minQty" type="number" min={1} defaultValue={v.minOrderQty ?? ""} placeholder="—" className="inp !w-24 !py-2 text-[13px]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">SL tối đa/đơn</span>
              <input name="maxQty" type="number" min={1} defaultValue={v.maxOrderQty ?? ""} placeholder="—" className="inp !w-24 !py-2 text-[13px]" />
            </label>
          </>
        )}
        {v.providerGroup === "manual" && (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">Thời gian giao (phút)</span>
              <input name="minutes" type="number" min={0} defaultValue={v.deliveryMinutes ?? ""} placeholder="—" className="inp !w-28 !py-2 text-[13px]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ghi chú gói (khách thấy)</span>
              <input name="noteProduct" defaultValue={v.providerNote ?? ""} placeholder="—" className="inp !w-52 !py-2 text-[13px]" />
            </label>
          </>
        )}
        <button className="btn-primary btn-row !px-3.5">Lưu</button>
      </form>
      <form action={famToggleVariant}>
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="on" value={selling ? "0" : "1"} />
        <button className={`btn-row !px-3.5 ${selling ? "btn-ghost !text-rose-600" : "btn-ghost !text-emerald-600"}`}>
          {selling ? "Tắt bán" : "Bật bán"}
        </button>
      </form>
      {deletable && (
        <form action={famDeleteVariant}>
          <input type="hidden" name="id" value={v.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button className="btn-sm btn-ghost !px-3.5 !py-2 !text-rose-600">Xoá</button>
        </form>
      )}
    </div>
  );
}

export const FZR_GROUP_LABELS: Record<string, string> = {
  telegram_stars: "Telegram Stars",
  telegram_premium: "Telegram Premium",
  steam_topup: "Steam Top-Up",
  steam_gift: "Steam Gift Games",
  gamekeys: "Game Key",
  giftcards: "Gift Card",
  topups: "Top-Up",
  manual: "Dịch vụ thủ công",
};

/** FIX11 TASK 3 — Thẻ "Đồng bộ & markup của khu" đặt trên trang sản phẩm
 *  của TỪNG khu FZR: nút đồng bộ chỉ kéo đúng nhóm của khu đó (như đồng bộ
 *  phía SMM), ô markup % riêng của khu ghi đè markup chung của nhà cung
 *  cấp cho nhóm đó (để trống = dùng markup chung). */
export function AreaSyncCard({ provider, groups, overrides, returnTo }: {
  provider: Provider;
  groups: string[];
  overrides: Record<string, string>;
  returnTo: string;
}) {
  return (
    <section className="card mb-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-brand-600">{I.refresh}</span>
        <h2 className="text-[15px] font-bold text-slate-800">Đồng bộ &amp; markup của khu này</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          Nguồn: {provider.name}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          Markup chung của NCC: {provider.markupPercent}%
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Đồng bộ chỉ kéo các nhóm của khu này ({groups.map((g) => FZR_GROUP_LABELS[g] || g).join(", ")}) — catalog của khu khác không bị đụng. Markup riêng dưới đây ghi đè markup chung cho đúng nhóm đó, áp dụng cả khi đồng bộ lẫn khi chốt giá tươi lúc mua.
      </p>
      <div className="mt-3.5 flex flex-wrap items-end gap-4">
        <form action={famSaveAreaMarkup} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="groups" value={groups.join(",")} />
          {groups.map((g) => (
            <label key={g} className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">Markup {FZR_GROUP_LABELS[g] || g} (%)</span>
              <input
                name={`markup_${g}`} type="number" min={0} max={1000}
                defaultValue={overrides[g] || ""} placeholder={`${provider.markupPercent} (chung)`}
                className="inp !w-36 !py-2 text-[13px]"
              />
            </label>
          ))}
          <button className="btn-ghost btn-row !px-3.5">Lưu markup khu</button>
        </form>
        <form action={famSyncArea}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="providerId" value={provider.id} />
          <input type="hidden" name="groups" value={groups.join(",")} />
          <button className="btn-primary btn-row !px-3.5">Đồng bộ khu này</button>
        </form>
      </div>
    </section>
  );
}

/** Phân trang phía máy chủ cho các danh sách quản trị sản phẩm/gói — đúng
 *  khuôn trang khách ("Trang x/y · N mục" + nút Trang trước/Trang sau),
 *  đi qua query param; `params` giữ lại các tham số lọc khác (tìm kiếm…)
 *  khi lật trang. Chỉ hiện khi có từ 2 trang trở lên. */
export function AdminPager({ basePath, page, pages, total, unit, param = "page", params = {} }: {
  basePath: string;
  page: number;
  pages: number;
  total: number;
  unit: string;
  param?: string;
  params?: Record<string, string>;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set(param, String(p));
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm">
      <span className="text-slate-500">Trang {page}/{pages} · {total} {unit}</span>
      <span className="flex gap-2">
        {page > 1 && <Link className="btn-ghost btn-sm" href={href(page - 1)}>Trang trước</Link>}
        {page < pages && <Link className="btn-ghost btn-sm" href={href(page + 1)}>Trang sau</Link>}
      </span>
    </div>
  );
}
