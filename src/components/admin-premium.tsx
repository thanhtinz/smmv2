"use client";
import { useState } from "react";
import Link from "next/link";
import { Modal, Switch } from "@/components/admin-catalog";
import { PremiumFieldsEditor } from "@/components/client";
import { adminSavePremiumCategory, adminDeletePremiumCategory, adminTogglePremiumCategory, adminSaveProduct, adminDeleteProduct, adminToggleProduct, adminSaveVariant } from "@/app/actions/admin";
import { num, parsePremiumFields } from "@/lib/format";

const inp = "inp";
const lbl = "lbl";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800";
const Pencil = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
const Trash = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg>);

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* ================= DANH MỤC PREMIUM ================= */
export type PremiumCategoryDTO = { id: number; name: string; slug: string; description: string | null; icon: string | null; sort: number; active: boolean; productCount: number };

export function PremiumCategoryModal({ category, onClose }: { category?: PremiumCategoryDTO; onClose: () => void }) {
  const c = category;
  const [name, setName] = useState(c?.name || "");
  const [slug, setSlug] = useState(c?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!c);
  return (
    <Modal title={c ? "Chỉnh sửa Danh mục Premium" : "Thêm Danh mục Premium Mới"} onClose={onClose}>
      <form action={adminSavePremiumCategory}>
        {c && <input type="hidden" name="id" value={c.id} />}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={lbl}>Tên danh mục *</label>
            <input name="name" required value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} className={inp} placeholder="Ví dụ: Xem phim & Giải trí" />
          </div>
          <div>
            <label className={lbl}>Slug *</label>
            <input name="slug" required value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} className={inp} placeholder="vi-du-xem-phim-giai-tri" />
          </div>
          <div><label className={lbl}>Mô tả</label><textarea name="description" rows={2} defaultValue={c?.description || ""} className={inp} placeholder="Mô tả ngắn về danh mục..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Thứ tự hiển thị</label><input name="sort" type="number" defaultValue={c?.sort ?? 0} className={inp} /></div>
            <div>
              <label className={lbl}>Trạng thái *</label>
              <select name="active" defaultValue={c ? (c.active ? "on" : "off") : "on"} className={inp}>
                <option value="on">Đang hoạt động</option>
                <option value="off">Tạm dừng</option>
              </select>
              {/* adminSavePremiumCategory đọc active === "on" từ checkbox — dùng hidden checkbox đồng bộ qua select ở dưới */}
            </div>
          </div>
          <div><label className={lbl}>Icon danh mục</label><input name="icon" defaultValue={c?.icon || ""} className={inp} placeholder="Nhập ký tự icon hoặc URL ảnh..." /></div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Hủy</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Lưu danh mục</button>
        </div>
      </form>
    </Modal>
  );
}

export function PremiumCategoriesClient({ categories }: { categories: PremiumCategoryDTO[] }) {
  const [editing, setEditing] = useState<PremiumCategoryDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">+ Thêm danh mục mới</button>
      </div>
      {open && <PremiumCategoryModal category={editing} onClose={() => setOpen(false)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-slate-100"><th className="th">Danh mục</th><th className="th">Slug</th><th className="th">Số sản phẩm</th><th className="th">Thứ tự</th><th className="th">Trạng thái</th><th className="th text-right">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="td"><span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{c.icon || c.name.charAt(0)}</span><span className="font-bold text-slate-800">{c.name}</span></td>
                <td className="td text-slate-500">{c.slug}</td>
                <td className="td text-slate-600">{num(c.productCount)}</td>
                <td className="td text-slate-600">{c.sort}</td>
                <td className="td">
                  <form action={adminTogglePremiumCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{c.active ? "Đang hoạt động" : "Tạm dừng"}</button>
                  </form>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className={iconBtn} title="Sửa" onClick={() => { setEditing(c); setOpen(true); }}><Pencil /></button>
                    <form action={adminDeletePremiumCategory} onSubmit={(e) => { if (!confirm(`Xoá danh mục "${c.name}"?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title="Xoá"><Trash /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-slate-400">Chưa có danh mục nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================= SẢN PHẨM & GÓI ================= */
export type PremiumVariantDTO = { id: number; name: string; price: number; cost: number; warrantyDays: number; providerCycle: number | null; active: boolean; sort: number; stockAvailable: number; stockTotal: number };
export type PremiumProductDTO = {
  id: number; categoryId: number; categoryName: string; name: string; slug: string; tagline: string | null; description: string | null;
  color: string; fulfillment: string; providerId: number | null; providerProductId: string | null; customFields: string | null;
  buyNote: string | null; imageUrl: string | null; usageGuide: string | null; warrantyInfo: string | null;
  active: boolean; sort: number; orderCount: number; variants: PremiumVariantDTO[];
};
export type PremiumProviderOpt = { id: number; name: string };

export function ProductModal({ product, categories, providers, onClose }: { product?: PremiumProductDTO; categories: PremiumCategoryDTO[]; providers: PremiumProviderOpt[]; onClose: () => void }) {
  const p = product;
  const [name, setName] = useState(p?.name || "");
  const [slug, setSlug] = useState(p?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!p);
  const [fulfillment, setFulfillment] = useState(p?.fulfillment || "MANUAL");
  return (
    <Modal title={p ? "Chỉnh sửa Sản phẩm Premium" : "Thêm Sản phẩm Premium Mới"} onClose={onClose} wide>
      <form action={adminSaveProduct}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <div className="max-h-[66vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className={lbl}>Tên sản phẩm *</label>
            <input name="name" required value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} className={inp} placeholder="Ví dụ: Netflix Premium" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Slug *</label>
              <input name="slug" required value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} className={inp} placeholder="vi-du-netflix-premium" />
            </div>
            <div>
              <label className={lbl}>Danh mục *</label>
              <select name="categoryId" required defaultValue={p?.categoryId || ""} className={inp}>
                <option value="" disabled>Chọn danh mục</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Thứ tự hiển thị</label><input name="sort" type="number" defaultValue={p?.sort ?? 0} className={inp} /></div>
            <div className="flex items-end pb-1"><Switch name="active" defaultChecked={p ? p.active : true} label="Trạng thái: Đang bán" /></div>
          </div>
          <div><label className={lbl}>Logo sản phẩm (URL ảnh)</label><input name="imageUrl" defaultValue={p?.imageUrl || ""} className={inp} placeholder="URL logo sản phẩm..." /></div>
          <div><label className={lbl}>Mô tả ngắn</label><textarea name="tagline" rows={2} defaultValue={p?.tagline || ""} className={inp} placeholder="Mô tả ngắn gọn về sản phẩm..." /></div>
          <div><label className={lbl}>Mô tả chi tiết</label><textarea name="description" rows={3} defaultValue={p?.description || ""} className={inp} placeholder="Mô tả đầy đủ, tính năng, hướng dẫn sử dụng..." /></div>
          <div><label className={lbl}>Lưu ý khi mua</label><textarea name="buyNote" rows={2} defaultValue={p?.buyNote || ""} className={inp} placeholder="Các lưu ý quan trọng cho khách hàng..." /></div>
          <details className="rounded-xl border border-slate-200 px-4 py-3" open={!!p && (p.fulfillment !== "MANUAL" || !!p.warrantyInfo || !!p.usageGuide)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Cài đặt nâng cao: hình thức giao, bảo hành, trường tuỳ chỉnh</summary>
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Hình thức giao</label>
                  <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} className={inp}>
                    <option value="AUTO_STOCK">Kho tự động (giao ngay)</option>
                    <option value="MANUAL">Thủ công (nâng cấp chính chủ)</option>
                    <option value="API">Đấu API nhà cung cấp</option>
                  </select>
                </div>
                <div><label className={lbl}>Màu nhận diện</label><input name="color" type="color" defaultValue={p?.color || "#3178fc"} className="h-[42px] w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-1.5 py-1.5" /></div>
              </div>
              {fulfillment === "API" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Nhà cung cấp</label>
                    <select name="providerId" defaultValue={p?.providerId || ""} className={inp}>
                      <option value="">Chọn nhà cung cấp</option>
                      {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>ID sản phẩm tại NCC</label><input name="providerProductId" defaultValue={p?.providerProductId || ""} className={inp} /></div>
                </div>
              )}
              <div><label className={lbl}>Thông tin bảo hành</label><textarea name="warrantyInfo" rows={2} defaultValue={p?.warrantyInfo || ""} className={inp} placeholder="Điều kiện bảo hành riêng của sản phẩm..." /></div>
              <div><label className={lbl}>Hướng dẫn sử dụng</label><textarea name="usageGuide" rows={2} defaultValue={p?.usageGuide || ""} className={inp} placeholder="Hướng dẫn sau khi mua..." /></div>
              <div>
                <label className={lbl}>Trường tuỳ chỉnh khách điền khi mua</label>
                <PremiumFieldsEditor initial={parsePremiumFields(p?.customFields)} />
              </div>
            </div>
          </details>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Hủy</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Lưu sản phẩm</button>
        </div>
      </form>
    </Modal>
  );
}

export function VariantsModal({ product, onClose }: { product: PremiumProductDTO; onClose: () => void }) {
  const small = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm w-full";
  return (
    <Modal title={`Gói bán — ${product.name}`} onClose={onClose} wide>
      <div className="max-h-[66vh] overflow-y-auto px-6 py-5">
        <div className="space-y-3">
          {product.variants.map((v) => (
            <form key={v.id} action={adminSaveVariant} className="rounded-xl border border-slate-200 p-3">
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="productId" value={product.id} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input name="name" defaultValue={v.name} className={small} placeholder="Tên gói" />
                <input name="price" type="number" min={0} defaultValue={v.price} className={small} placeholder="Giá bán" />
                <input name="cost" type="number" min={0} defaultValue={v.cost} className={small} placeholder="Giá vốn" />
                <input name="warrantyDays" type="number" min={0} defaultValue={v.warrantyDays} className={small} placeholder="BH (ngày)" />
                <input name="providerCycle" type="number" min={0} defaultValue={v.providerCycle ?? ""} className={small} placeholder="Chu kỳ NCC (tháng)" />
                <input name="sort" type="number" defaultValue={v.sort} className={small} placeholder="Thứ tự" />
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked={v.active} className="h-4 w-4" /> Đang bán</label>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Lưu</button>
                  <span className="text-xs text-slate-400">Kho: {v.stockAvailable}/{v.stockTotal}</span>
                </div>
              </div>
            </form>
          ))}
          {product.variants.length === 0 && <div className="py-4 text-center text-sm text-slate-400">Chưa có gói nào — thêm gói đầu tiên ở dưới.</div>}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 text-sm font-bold text-slate-700">Thêm gói mới</div>
          <form action={adminSaveVariant} className="rounded-xl border border-dashed border-slate-300 p-3">
            <input type="hidden" name="productId" value={product.id} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input name="name" required className={small} placeholder="Tên gói (VD: 1 Tháng)" />
              <input name="price" type="number" min={0} required className={small} placeholder="Giá bán" />
              <input name="cost" type="number" min={0} className={small} placeholder="Giá vốn" />
              <input name="warrantyDays" type="number" min={0} className={small} placeholder="BH (ngày)" />
              <input name="providerCycle" type="number" min={0} className={small} placeholder="Chu kỳ NCC (tháng)" />
              <input name="sort" type="number" defaultValue={0} className={small} placeholder="Thứ tự" />
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked className="h-4 w-4" /> Đang bán</label>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">+ Thêm gói</button>
            </div>
          </form>
          <div className="mt-4 flex items-center justify-between">
            <Link href="/admin/kho-premium" className="text-sm font-semibold text-blue-600 hover:text-blue-800">Mở Kho tài khoản để nhập kho →</Link>
            <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Đóng</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ProductsClient({ products, categories, providers }: { products: PremiumProductDTO[]; categories: PremiumCategoryDTO[]; providers: PremiumProviderOpt[] }) {
  const [editing, setEditing] = useState<PremiumProductDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [variantFor, setVariantFor] = useState<PremiumProductDTO | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Link href="/admin/kho-premium" className="btn-ghost btn-sm !px-4 !py-2.5">Kho tài khoản</Link>
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">+ Thêm sản phẩm mới</button>
      </div>
      {open && <ProductModal product={editing} categories={categories} providers={providers} onClose={() => setOpen(false)} />}
      {variantFor && <VariantsModal product={variantFor} onClose={() => setVariantFor(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr className="border-b border-slate-100"><th className="th">Sản phẩm</th><th className="th">Danh mục</th><th className="th">Số gói</th><th className="th">Đơn hàng</th><th className="th">Thứ tự</th><th className="th">Trạng thái</th><th className="th text-right">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="td">
                  <div className="flex items-center gap-3">
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
                      : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-black text-white" style={{ background: p.color }}>{p.name.charAt(0)}</span>}
                    <div>
                      <div className="font-bold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="td text-slate-600">{p.categoryName}</td>
                <td className="td"><button onClick={() => setVariantFor(p)} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-100">{p.variants.length} gói</button></td>
                <td className="td text-slate-600">{num(p.orderCount)}</td>
                <td className="td text-slate-600">{p.sort}</td>
                <td className="td">
                  <form action={adminToggleProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{p.active ? "Đang bán" : "Tạm dừng"}</button>
                  </form>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" onClick={() => setVariantFor(p)}>Gói</button>
                    <button className={iconBtn} title="Sửa" onClick={() => { setEditing(p); setOpen(true); }}><Pencil /></button>
                    <form action={adminDeleteProduct} onSubmit={(e) => { if (!confirm(`Xoá sản phẩm "${p.name}"?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title="Xoá"><Trash /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="td py-10 text-center text-slate-400">Chưa có sản phẩm nào khớp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
