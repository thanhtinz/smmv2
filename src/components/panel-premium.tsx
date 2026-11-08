"use client";
import { useState } from "react";
import { Modal } from "@/components/admin-catalog";
import { RichTextEditor, ImagesField } from "@/components/rich-editor";
import { PremiumFieldsEditor } from "@/components/client";
import { parsePremiumFields } from "@/lib/format";
import { Badge } from "@/components/ui";
import { num } from "@/lib/format";
import { useLang } from "@/components/lang";
import {
  panelSavePremiumProductAction, panelDeletePremiumProductAction, panelTogglePremiumProductAction,
  panelSavePremiumVariantAction, panelDeletePremiumVariantAction,
} from "@/app/actions/panel";

export type PanelVariantDTO = { id: number; name: string; price: number; warrantyDays: number; active: boolean; sort: number };
export type PanelProductDTO = {
  id: number; name: string; slug: string; categoryId: number; categoryName: string;
  tagline: string | null; description: string | null; customFields: string | null;
  images: string[]; buyNote: string | null;
  warrantyInfo: string | null; usageGuide: string | null; active: boolean; sort: number;
  orderCount: number; variants: PanelVariantDTO[];
};
export type PanelCategoryOpt = { id: number; name: string };

function ProductModal({ product, categories, onClose }: { product?: PanelProductDTO; categories: PanelCategoryOpt[]; onClose: () => void }) {
  const { t, td } = useLang();
  return (
    <Modal title={product ? t("Sửa sản phẩm — ") + product.name : t("Thêm sản phẩm Premium")} onClose={onClose} wide>
      <form action={panelSavePremiumProductAction}>
        <div className="space-y-4 px-6 py-5">
          {product && <input type="hidden" name="id" value={product.id} />}
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="lbl">{t("Tên sản phẩm *")}</label><input className="inp" name="name" required defaultValue={product?.name || ""} placeholder={t("VD: Netflix Premium 4K")} /></div>
            <div><label className="lbl">{t("Danh mục *")}</label>
              <select className="inp" name="categoryId" defaultValue={product?.categoryId || ""} required>
                <option value="" disabled>{t("— Chọn danh mục —")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="lbl">{t("Dòng mô tả ngắn")}</label><input className="inp" name="tagline" defaultValue={product?.tagline || ""} placeholder={t("VD: Xem phim 4K, 5 thiết bị")} /></div>
          <div><label className="lbl">{t("Ảnh sản phẩm")}</label><ImagesField defaults={product?.images || []} /></div>
          <div><label className="lbl">{t("Mô tả chi tiết")}</label><RichTextEditor name="description" defaultValue={product?.description} minHeight={150} /></div>
          <div><label className="lbl">{t("Hướng dẫn hiện khi mua")}</label><textarea className="inp" name="buyNote" rows={2} defaultValue={product?.buyNote || ""} placeholder={t("VD: Gửi email của bạn để được nâng cấp chính chủ")} /></div>
          <div>
            <label className="lbl">{t("Trường tuỳ chỉnh khách điền khi mua")}</label>
            <PremiumFieldsEditor initial={parsePremiumFields(product?.customFields)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="lbl">{t("Thông tin bảo hành")}</label><RichTextEditor name="warrantyInfo" defaultValue={product?.warrantyInfo} minHeight={90} /></div>
            <div><label className="lbl">{t("Hướng dẫn sử dụng")}</label><RichTextEditor name="usageGuide" defaultValue={product?.usageGuide} minHeight={90} /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="lbl">{t("Thứ tự hiển thị")}</label><input className="inp" name="sort" type="number" defaultValue={product?.sort ?? 0} /></div>
            <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" name="active" defaultChecked={product ? product.active : true} className="h-4 w-4 accent-brand-600" /> {t("Đang bán")}</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" className="btn-ghost" onClick={onClose}>{t("Huỷ")}</button>
          <button className="btn-primary" type="submit">{product ? t("Lưu thay đổi") : t("Thêm sản phẩm")}</button>
        </div>
      </form>
    </Modal>
  );
}

function VariantsModal({ product, onClose }: { product: PanelProductDTO; onClose: () => void }) {
  const { t, td } = useLang();
  return (
    <Modal title={t("Gói bán — ") + product.name} onClose={onClose} wide>
      <div className="space-y-4 px-6 py-5">
        {product.variants.length === 0 && <p className="text-sm text-slate-400">{t("Chưa có gói nào — thêm gói đầu tiên ở dưới.")}</p>}
        {product.variants.map((v) => (
          <div key={v.id} className="rounded-xl border border-slate-200 p-4">
            <form action={panelSavePremiumVariantAction}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="id" value={v.id} />
              <div className="grid gap-3 md:grid-cols-[1fr_130px_110px_80px]">
                <div><label className="lbl">{t("Tên gói")}</label><input className="inp" name="name" defaultValue={v.name} required /></div>
                <div><label className="lbl">{t("Giá bán (đ)")}</label><input className="inp" name="price" type="number" min={0} defaultValue={v.price} required /></div>
                <div><label className="lbl">{t("Bảo hành (ngày)")}</label><input className="inp" name="warrantyDays" type="number" min={0} defaultValue={v.warrantyDays} /></div>
                <div><label className="lbl">{t("Thứ tự")}</label><input className="inp" name="sort" type="number" defaultValue={v.sort} /></div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked={v.active} className="h-4 w-4 accent-brand-600" /> {t("Đang bán")}</label>
                <span className="flex-1" />
                <button className="btn-primary btn-sm" type="submit">{t("Lưu gói")}</button>
              </div>
            </form>
            <form action={panelDeletePremiumVariantAction} className="mt-2 text-right">
              <input type="hidden" name="id" value={v.id} />
              <button className="text-xs font-medium text-rose-500 hover:text-rose-700" type="submit">{t("Xoá gói này")}</button>
            </form>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <div className="mb-3 text-sm font-bold text-slate-800">{t("Thêm gói mới")}</div>
          <form action={panelSavePremiumVariantAction}>
            <input type="hidden" name="productId" value={product.id} />
            <div className="grid gap-3 md:grid-cols-[1fr_130px_110px_80px]">
              <div><label className="lbl">{t("Tên gói")}</label><input className="inp" name="name" placeholder={t("VD: 1 Tháng")} required /></div>
              <div><label className="lbl">{t("Giá bán (đ)")}</label><input className="inp" name="price" type="number" min={0} placeholder="50000" required /></div>
              <div><label className="lbl">{t("Bảo hành (ngày)")}</label><input className="inp" name="warrantyDays" type="number" min={0} defaultValue={30} /></div>
              <div><label className="lbl">{t("Thứ tự")}</label><input className="inp" name="sort" type="number" defaultValue={0} /></div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-brand-600" /> {t("Đang bán")}</label>
            <button className="btn-primary btn-sm mt-3" type="submit">{t("Thêm gói")}</button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

export function PanelProductsClient({ products, categories }: { products: PanelProductDTO[]; categories: PanelCategoryOpt[] }) {
  const { t, td } = useLang();
  const [editing, setEditing] = useState<PanelProductDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [variantOf, setVariantOf] = useState<PanelProductDTO | null>(null);
  const [deleting, setDeleting] = useState<PanelProductDTO | null>(null);
  const [q, setQ] = useState("");
  const list = q ? products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : products;
  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input className="inp min-w-[220px] flex-1" placeholder={t("Tìm theo tên sản phẩm...")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={() => setAdding(true)}>{t("+ Thêm sản phẩm")}</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>
            <th className="th">{t("Sản phẩm")}</th><th className="th">{t("Danh mục")}</th><th className="th">{t("Số gói")}</th><th className="th">{t("Đơn hàng")}</th><th className="th">{t("Trạng thái")}</th><th className="th">{t("Thao tác")}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="td"><div className="font-medium text-slate-800">{p.name}</div><div className="text-xs text-slate-400">{p.slug}</div></td>
                <td className="td">{p.categoryName}</td>
                <td className="td">{num(p.variants.length)}</td>
                <td className="td">{num(p.orderCount)}</td>
                <td className="td">{p.active ? <Badge cls="bg-emerald-100 text-emerald-800">{t("Đang bán")}</Badge> : <Badge cls="bg-slate-200 text-slate-600">{t("Đã tắt")}</Badge>}</td>
                <td className="td whitespace-nowrap">
                  <div className="flex gap-1.5">
                    <button className="btn-ghost btn-sm !px-2.5 !py-1" onClick={() => setVariantOf(p)}>{t("Gói")}</button>
                    <button className="btn-ghost btn-sm !px-2.5 !py-1" onClick={() => setEditing(p)}>{t("Sửa")}</button>
                    <form action={panelTogglePremiumProductAction}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost btn-sm !px-2.5 !py-1" type="submit">{p.active ? t("Tắt") : t("Bật")}</button></form>
                    <button className="btn-ghost btn-sm !px-2.5 !py-1 !text-rose-600" onClick={() => setDeleting(p)}>{t("Xoá")}</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>{t("Chưa có sản phẩm nào. Bấm \"+ Thêm sản phẩm\" để tự bán thêm tại website.")}</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && <ProductModal categories={categories} onClose={() => setAdding(false)} />}
      {editing && <ProductModal product={editing} categories={categories} onClose={() => setEditing(null)} />}
      {variantOf && <VariantsModal product={variantOf} onClose={() => setVariantOf(null)} />}
      {deleting && (
        <Modal title={t("Xoá sản phẩm")} onClose={() => setDeleting(null)}>
          <form action={panelDeletePremiumProductAction}>
            <div className="space-y-4 px-6 py-5">
              <input type="hidden" name="id" value={deleting.id} />
              <p className="text-sm text-slate-600">{td(`Xoá sản phẩm `)}<b>{deleting.name}</b>{t("? Nếu sản phẩm đã có đơn, hệ thống chỉ tắt bán thay vì xoá.")}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" className="btn-ghost" onClick={() => setDeleting(null)}>{t("Huỷ")}</button>
              <button className="btn-primary !bg-rose-600" type="submit">{t("Xoá sản phẩm")}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
