"use client";
import { useState } from "react";
import { Modal, Switch } from "@/components/admin-catalog";
import { panelSaveDiscountCode, panelDeleteDiscountCode, panelToggleDiscountCode, setPanelPremiumPriceAction, panelSavePost, panelDeletePost, panelTogglePost, panelSaveOwnService, panelDeleteOwnService, panelToggleOwnService } from "@/app/actions/panel";
import { num, dt } from "@/lib/format";
import { useLang } from "@/components/lang";

const inp = "inp";
const lbl = "lbl";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800";
const Pencil = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
const Trash = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg>);

/* ================= MÃ GIẢM GIÁ CỦA PANEL ================= */
export type PanelCodeDTO = {
  id: number; code: string; type: string; value: number; minOrder: number; maxDiscount: number;
  usageLimit: number; usedCount: number; scope: string; startsAt: string | null; endsAt: string | null; active: boolean;
};

export function PanelCodeModal({ code, onClose }: { code?: PanelCodeDTO; onClose: () => void }) {
  const { t } = useLang();
  const c = code;
  return (
    <Modal title={c ? t("Sửa mã giảm giá") : t("Tạo mã giảm giá")} onClose={onClose}>
      <form action={panelSaveDiscountCode}>
        {c && <input type="hidden" name="id" value={c.id} />}
        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t("Mã *")}</label><input name="code" required defaultValue={c?.code || ""} className={`${inp} uppercase`} placeholder="VD: SHOP10" /></div>
            <div>
              <label className={lbl}>{t("Loại giảm")}</label>
              <select name="type" defaultValue={c?.type || "PERCENT"} className={inp}>
                <option value="PERCENT">{t("Theo %")}</option>
                <option value="FIXED">{t("Số tiền cố định")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={lbl}>{t("Giá trị *")}</label><input name="value" type="number" min={1} required defaultValue={c?.value ?? 10} className={inp} /></div>
            <div><label className={lbl}>{t("Đơn tối thiểu (đ)")}</label><input name="minOrder" type="number" min={0} defaultValue={c?.minOrder ?? 0} className={inp} /></div>
            <div><label className={lbl}>{t("Giảm tối đa (đ, 0 = không cap)")}</label><input name="maxDiscount" type="number" min={0} defaultValue={c?.maxDiscount ?? 0} className={inp} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={lbl}>{t("Giới hạn lượt dùng (0 = không giới hạn)")}</label><input name="usageLimit" type="number" min={0} defaultValue={c?.usageLimit ?? 0} className={inp} /></div>
            <div>
              <label className={lbl}>{t("Áp dụng cho")}</label>
              <select name="scope" defaultValue={c?.scope || "ALL"} className={inp}>
                <option value="ALL">{t("Mọi đơn")}</option>
                <option value="SMM">{t("Chỉ đơn SMM")}</option>
                <option value="PREMIUM">{t("Chỉ đơn Premium")}</option>
              </select>
            </div>
            <div className="flex items-end pb-1"><Switch name="active" defaultChecked={c ? c.active : true} label={t("Đang bật")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t("Bắt đầu")}</label><input name="startsAt" type="datetime-local" defaultValue={c?.startsAt || ""} className={inp} /></div>
            <div><label className={lbl}>{t("Kết thúc")}</label><input name="endsAt" type="datetime-local" defaultValue={c?.endsAt || ""} className={inp} /></div>
          </div>
          <p className="text-xs text-slate-400">{t("Mã chỉ áp dụng cho khách mua qua website của bạn; khách web mẹ không dùng được mã này.")}</p>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Hủy")}</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("Lưu mã")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PanelCodesClient({ codes }: { codes: PanelCodeDTO[] }) {
  const { t, td, m } = useLang();
  const [editing, setEditing] = useState<PanelCodeDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("+ Tạo mã giảm giá")}</button>
      </div>
      {open && <PanelCodeModal code={editing} onClose={() => setOpen(false)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{t("Mã")}</th><th className="th">{t("Giảm")}</th><th className="th">{t("Điều kiện")}</th><th className="th">{t("Đã dùng")}</th><th className="th">{t("Trạng thái")}</th><th className="th text-right">{t("Thao tác")}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {codes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="td"><span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">{c.code}</span></td>
                <td className="td font-bold text-slate-800">{c.type === "PERCENT" ? `${c.value}%` : m(c.value)}{c.type === "PERCENT" && c.maxDiscount > 0 ? <span className="block text-xs font-normal text-slate-400">{td(`tối đa ${m(c.maxDiscount)}`)}</span> : null}</td>
                <td className="td text-slate-600">{td(`Đơn từ ${m(c.minOrder)} · ${c.scope === "ALL" ? t("Mọi đơn") : c.scope}`)}</td>
                <td className="td text-slate-600">{num(c.usedCount)}{c.usageLimit > 0 ? `/${num(c.usageLimit)}` : ""}</td>
                <td className="td">
                  <form action={panelToggleDiscountCode}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{c.active ? t("Đang bật") : t("Đã tắt")}</button>
                  </form>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className={iconBtn} title={t("Sửa")} onClick={() => { setEditing(c); setOpen(true); }}><Pencil /></button>
                    <form action={panelDeleteDiscountCode} onSubmit={(e) => { if (!confirm(td(`Xoá mã "${c.code}"?`))) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title={t("Xoá")}><Trash /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {codes.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-slate-400">{t("Chưa có mã giảm giá nào.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================= GIÁ RIÊNG GÓI PREMIUM ================= */
export type PanelPremiumRowDTO = { variantId: number; productName: string; variantName: string; motherPrice: number; panelPrice: number; override: number | null };

export function PanelPremiumTable({ rows }: { rows: PanelPremiumRowDTO[] }) {
  const { t, m } = useLang();
  const [editing, setEditing] = useState<PanelPremiumRowDTO | null>(null);
  return (
    <>
      {editing && <PanelPremiumPriceModal productName={editing.productName} variantName={editing.variantName} motherPrice={editing.motherPrice} panelPrice={editing.panelPrice} override={editing.override} variantId={editing.variantId} onClose={() => setEditing(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{t("Sản phẩm / Gói")}</th><th className="th">{t("Giá web mẹ")}</th><th className="th">{t("Giá panel công thức")}</th><th className="th">{t("Giá riêng")}</th><th className="th text-right">{t("Thao tác")}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.variantId} className="hover:bg-slate-50/60">
                <td className="td"><div className="font-bold text-slate-800">{r.productName}</div><div className="text-xs text-slate-400">{r.variantName}</div></td>
                <td className="td text-slate-500">{m(r.motherPrice)}</td>
                <td className="td font-bold text-slate-800">{m(r.panelPrice)}</td>
                <td className="td">{r.override ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{m(r.override)}</span> : <span className="text-xs text-slate-400">{t("— theo công thức")}</span>}</td>
                <td className="td text-right"><button onClick={() => setEditing(r)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">{t("Chỉnh giá")}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="td py-10 text-center text-slate-400">{t("Chưa có gói Premium nào đang bán.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PanelPremiumPriceModal({ productName, variantName, motherPrice, panelPrice, override, variantId, onClose }: {
  productName: string; variantName: string; motherPrice: number; panelPrice: number; override: number | null; variantId: number; onClose: () => void;
}) {
  const { t, m } = useLang();
  const locked = "inp !bg-slate-50 !text-slate-500";
  return (
    <Modal title={t("Chỉnh giá gói Premium")} onClose={onClose}>
      <form action={setPanelPremiumPriceAction}>
        <input type="hidden" name="variantId" value={variantId} />
        <div className="space-y-4 px-6 py-5">
          <div><label className={lbl}>{t("Sản phẩm / gói")}</label><input value={`${productName} — ${variantName}`} disabled className={locked} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t("Giá web mẹ")}</label><input value={m(motherPrice)} disabled className={locked} /></div>
            <div><label className={lbl}>{t("Giá panel theo công thức chung")}</label><input value={m(panelPrice)} disabled className={locked} /></div>
          </div>
          <div>
            <label className={lbl}>{t("Giá riêng của panel (giá cuối khách trả)")}</label>
            <input name="price" type="number" min={0} step={100} defaultValue={override ?? ""} placeholder={num(panelPrice)} className={inp} />
            <p className="mt-1.5 text-xs text-slate-400">{t("Để trống = bỏ giá riêng, gói quay về giá công thức chung (phụ phí + giảm theo bậc).")}</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Hủy")}</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("Lưu giá")}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= BÀI VIẾT GIAN HÀNG ================= */
export type PanelPostDTO = { id: number; title: string; slug: string; excerpt: string | null; content: string; coverUrl: string | null; categoryId: number | null; published: boolean; views: number; createdAt: Date };

export function PanelPostModal({ post, categories, onClose }: { post?: PanelPostDTO; categories: { id: number; name: string }[]; onClose: () => void }) {
  const { t } = useLang();
  const p = post;
  return (
    <Modal title={p ? t("Sửa bài viết") : t("Viết bài mới")} onClose={onClose} wide>
      <form action={panelSavePost}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <div className="max-h-[66vh] space-y-4 overflow-y-auto px-6 py-5">
          <div><label className={lbl}>{t("Tiêu đề *")}</label><input name="title" required defaultValue={p?.title || ""} className={inp} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t("Slug (để trống = tự sinh)")}</label><input name="slug" defaultValue={p?.slug || ""} className={inp} /></div>
            <div>
              <label className={lbl}>{t("Danh mục")}</label>
              <select name="categoryId" defaultValue={p?.categoryId || ""} className={inp}>
                <option value="">{t("Không thuộc danh mục")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className={lbl}>{t("Ảnh bìa (URL)")}</label><input name="coverUrl" defaultValue={p?.coverUrl || ""} className={inp} /></div>
          <div><label className={lbl}>{t("Tóm tắt")}</label><textarea name="excerpt" rows={2} defaultValue={p?.excerpt || ""} className={inp} /></div>
          <div><label className={lbl}>{t("Nội dung *")}</label><textarea name="content" rows={8} required defaultValue={p?.content || ""} className={inp} /></div>
          <Switch name="published" defaultChecked={p ? p.published : true} label={t("Đăng ngay")} />
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Hủy")}</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("Lưu bài viết")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PanelPostsClient({ posts, categories }: { posts: PanelPostDTO[]; categories: { id: number; name: string }[] }) {
  const { t, td } = useLang();
  const [editing, setEditing] = useState<PanelPostDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("+ Viết bài mới")}</button>
      </div>
      {open && <PanelPostModal post={editing} categories={categories} onClose={() => setOpen(false)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{t("Bài viết")}</th><th className="th">{t("Lượt xem")}</th><th className="th">{t("Ngày tạo")}</th><th className="th">{t("Trạng thái")}</th><th className="th text-right">{t("Thao tác")}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {posts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="td"><div className="font-bold text-slate-800">{p.title}</div><div className="text-xs text-slate-400">{p.slug}</div></td>
                <td className="td text-slate-600">{num(p.views)}</td>
                <td className="td text-slate-500">{dt(p.createdAt)}</td>
                <td className="td">
                  <form action={panelTogglePost}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.published ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{p.published ? t("Đã đăng") : t("Bản nháp")}</button>
                  </form>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className={iconBtn} title={t("Sửa")} onClick={() => { setEditing(p); setOpen(true); }}><Pencil /></button>
                    <form action={panelDeletePost} onSubmit={(e) => { if (!confirm(td(`Xoá bài "${p.title}"?`))) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title={t("Xoá")}><Trash /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {posts.length === 0 && <tr><td colSpan={5} className="td py-10 text-center text-slate-400">{t("Chưa có bài viết nào.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================= DỊCH VỤ PANEL THÊM VÀO GIAN HÀNG ================= */
export type PanelAddedServiceDTO = {
  id: number; name: string; rate: number; min: number; max: number;
  description: string | null; notice: string | null; active: boolean; categoryName: string;
  sourceName: string | null; sourceRate: number | null; fulfillment: string; orderCount: number;
};
export type PanelSourceServiceDTO = { id: number; name: string; rate: number; categoryName: string };
export type PanelCategoryDTO = { id: number; name: string; platform: string };

export function PanelAddServiceModal({ service, sources, categories, onClose }: { service?: PanelAddedServiceDTO; sources: PanelSourceServiceDTO[]; categories: PanelCategoryDTO[]; onClose: () => void }) {
  const { t, td, m } = useLang();
  const c = service;
  const [srcId, setSrcId] = useState(c ? -1 : 0);
  const src = sources.find((x) => x.id === srcId);
  return (
    <Modal title={c ? t("Chỉnh sửa dịch vụ") : t("Thêm dịch vụ")} onClose={onClose}>
      <form action={panelSaveOwnService}>
        {c && <input type="hidden" name="id" value={c.id} />}
        <div className="space-y-4 px-6 py-5">
          {!c && (
            <div><label className={lbl}>{t("Nguồn dịch vụ *")}</label>
              <select name="sourceServiceId" value={srcId} onChange={(e) => setSrcId(parseInt(e.target.value))} className={inp}>
                <option value={0}>{t("Thủ công — tự xử lý đơn")}</option>
                {sources.map((sv) => <option key={sv.id} value={sv.id}>{td(`${sv.name} · ${sv.categoryName} · giá web mẹ ${m(sv.rate)}/1k`)}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-400">{srcId === 0 ? t("Đơn vào trạng thái chờ, bạn tự xử lý ở mục Đơn hàng.") : t("Đơn sẽ chạy qua web chính, đúng dịch vụ đã chọn; bạn hưởng phần chênh giữa giá bán của bạn và giá web chính.")}</p>
            </div>
          )}
          {c && <div><label className={lbl}>{t("Nguồn dịch vụ")}</label><input disabled value={c.sourceName ? td(`${c.sourceName} (giá web mẹ ${m(c.sourceRate || 0)}/1k)`) : t("Thủ công — tự xử lý đơn")} className={inp} /></div>}
          <div><label className={lbl}>{t("Tên dịch vụ *")}</label><input name="name" required defaultValue={c?.name || (src ? src.name : "")} key={c ? "edit" : srcId} placeholder={t("Nhập tên dịch vụ")} className={inp} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={lbl}>{t("Giá bán (VNĐ/1k) *")}</label><input name="rate" type="number" min={1} required defaultValue={c?.rate || (src ? src.rate : 50000)} key={c ? "edit-r" : "r" + srcId} className={inp} /><p className="mt-1 text-xs text-blue-600">{t("Giá bán tính cho 1000 đơn vị.")}</p></div>
            <div><label className={lbl}>{t("Tối thiểu")}</label><input name="min" type="number" min={1} defaultValue={c?.min || 100} className={inp} /></div>
            <div><label className={lbl}>{t("Tối đa")}</label><input name="max" type="number" min={1} defaultValue={c?.max || 100000} className={inp} /></div>
          </div>
          {srcId === 0 && !c && (
            <div><label className={lbl}>{t("Danh mục")}</label>
              <select name="categoryId" className={inp}>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.platform})</option>)}
              </select>
            </div>
          )}
          <div><label className={lbl}>{t("Mô tả")}</label><textarea name="description" rows={3} defaultValue={c?.description || ""} className={inp} /></div>
          <div><label className={lbl}>{t("Thông báo dịch vụ")}</label><textarea name="notice" rows={2} defaultValue={c?.notice || ""} className={inp} placeholder={t("Hiện nổi bật cho khách khi đặt đơn. Để trống = không hiện.")} /></div>
          <Switch name="active" label={t("Đang bán")} defaultChecked={c ? c.active : true} />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost !py-2">{t("Huỷ")}</button>
          <button className="btn-primary !py-2">{c ? t("Cập nhật dịch vụ") : t("Lưu dịch vụ")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PanelAddedServicesClient({ services, sources, categories }: { services: PanelAddedServiceDTO[]; sources: PanelSourceServiceDTO[]; categories: PanelCategoryDTO[] }) {
  const { t, td, m } = useLang();
  const [editing, setEditing] = useState<PanelAddedServiceDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 flex items-center justify-end"><button onClick={() => { setEditing(undefined); setOpen(true); }} className="btn-primary !py-2.5">{t("+ Thêm dịch vụ")}</button></div>
      {open && <PanelAddServiceModal service={editing} sources={sources} categories={categories} onClose={() => setOpen(false)} />}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">{t("Dịch vụ")}</th><th className="th">{t("Nguồn")}</th><th className="th">{t("Giá bán / 1k")}</th><th className="th">Min – Max</th><th className="th">{t("Đơn đã bán")}</th><th className="th">{t("Trạng thái")}</th><th className="th !text-right">{t("Thao tác")}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((sv) => (
                <tr key={sv.id} className="hover:bg-slate-50/60">
                  <td className="td"><div className="font-semibold text-slate-800 max-w-[300px] truncate" title={sv.name}>{sv.name}</div><div className="text-xs text-slate-400">{sv.categoryName}</div></td>
                  <td className="td text-slate-500"><div className="max-w-[240px] truncate" title={sv.sourceName || ""}>{sv.sourceName || t("Thủ công")}</div>{sv.sourceRate != null && <div className="text-xs text-slate-400">{td(`giá mẹ ${m(sv.sourceRate)}/1k`)}</div>}</td>
                  <td className="td font-semibold">{m(sv.rate)}</td>
                  <td className="td text-slate-500">{num(sv.min)} – {num(sv.max)}</td>
                  <td className="td">{num(sv.orderCount)}</td>
                  <td className="td"><span className={`badge ${sv.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>{sv.active ? t("Đang bán") : t("Tắt")}</span></td>
                  <td className="td"><div className="flex justify-end gap-1.5">
                    <button className={iconBtn} title={t("Sửa")} onClick={() => { setEditing(sv); setOpen(true); }}><Pencil /></button>
                    <form action={panelToggleOwnService}><input type="hidden" name="id" value={sv.id} /><button className="btn-ghost btn-sm !px-3 !py-1.5">{sv.active ? t("Tắt") : t("Bật")}</button></form>
                    <form action={panelDeleteOwnService}><input type="hidden" name="id" value={sv.id} /><button className={iconBtn} title={t("Xoá")}><Trash /></button></form>
                  </div></td>
                </tr>
              ))}
              {services.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>{t("Chưa thêm dịch vụ nào — bấm “+ Thêm dịch vụ” và chọn nguồn từ các dịch vụ có sẵn của web mẹ, hoặc tạo dịch vụ thủ công tự xử lý.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
