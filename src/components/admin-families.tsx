import Link from "next/link";
import { I } from "./ui";
import { famSaveVariant, famToggleVariant, famDeleteVariant, famSyncArea, famSyncProduct } from "@/app/actions/admin-families";
import { ADMIN_VARIANT_MARK, type FamilyVariant } from "@/lib/families";
import type { Provider } from "@prisma/client";

/** FIX8 TASK 4 — Mảnh giao diện dùng chung cho admin họ Telegram/Steam:
 *  hàng gói (sửa tên/giá, bật/tắt) và thẻ đồng bộ của khu.
 *  TỈ GIÁ + MỌI MARKUP của FZR (markup chung và markup theo từng nhóm)
 *  đều sống trọn trong form nhà cung cấp (Admin → Nhà cung cấp, cùng chỗ
 *  với API key — "chỉnh 1 lần cho toàn bộ"); trang khu vực chỉ còn nút
 *  đồng bộ đúng nhóm của khu đó (AreaSyncCard).
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

/** Thẻ đồng bộ đặt trên trang sản phẩm của TỪNG khu FZR: nút đồng bộ chỉ
 *  kéo đúng nhóm của khu đó (như đồng bộ phía SMM). Markup không còn cấu
 *  hình tại đây — mọi markup FZR nằm trong form Nhà cung cấp cùng API key. */
export function AreaSyncCard({ provider, groups, returnTo }: {
  provider: Provider;
  groups: string[];
  returnTo: string;
}) {
  return (
    <section className="card mb-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-brand-600">{I.refresh}</span>
        <h2 className="text-[15px] font-bold text-slate-800">Đồng bộ của khu này</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          Nguồn: {provider.name}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          Markup chung của NCC: {provider.markupPercent}%
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Đồng bộ chỉ kéo các nhóm của khu này ({groups.map((g) => FZR_GROUP_LABELS[g] || g).join(", ")}) — catalog của khu khác không bị đụng. Markup chung và markup theo từng nhóm được cấu hình tại Admin → Nhà cung cấp, cùng chỗ với API key và tỉ giá.
      </p>
      <div className="mt-3.5">
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

/** Nút "Đồng bộ từ nguồn" RIÊNG cho 1 sản phẩm (lệnh chủ 2026-11-09):
 *  chạy đúng đường đồng bộ của khu nhưng chỉ cho sản phẩm này (action
 *  famSyncProduct -> syncFzrCatalog onlyProduct). Sản phẩm CHƯA gắn mã nhà
 *  cung cấp (tạo tay thuần, bound=false) thì nút bị VÔ HIỆU kèm lý do ngay
 *  bên cạnh — không bấm được thay vì bấm rồi mới lỗi. */
export function ProductSyncButton({ productId, bound, returnTo, className = "mt-2" }: {
  productId: number;
  bound: boolean;
  returnTo: string;
  className?: string;
}) {
  if (!bound) {
    return (
      <div className={className}>
        <button type="button" disabled title="Sản phẩm chưa gắn mã nhà cung cấp (tạo tay) — không có nguồn để đồng bộ" className="btn-ghost btn-row cursor-not-allowed !px-3.5 opacity-50">
          <span className="text-slate-400">{I.refresh}</span> Đồng bộ từ nguồn
        </button>
        <span className="ml-2 text-[11px] text-slate-400">Chưa gắn mã NCC — không đồng bộ được</span>
      </div>
    );
  }
  return (
    <form action={famSyncProduct} className={className}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button className="btn-ghost btn-row !px-3.5">
        <span className="text-brand-600">{I.refresh}</span> Đồng bộ từ nguồn
      </button>
    </form>
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
