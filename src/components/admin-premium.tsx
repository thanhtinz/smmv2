"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Modal, Switch } from "@/components/admin-catalog";
import { PremiumFieldsEditor } from "@/components/client";
import { RichTextEditor, ImagesField } from "@/components/rich-editor";
import { adminSavePremiumCategory, adminDeletePremiumCategory, adminTogglePremiumCategory, adminSaveProduct, adminDeleteProduct, adminToggleProduct, adminSaveVariant, adminDeleteVariant, adminProviderCatalogSearch, adminProviderProductCycles, adminSetProductSource } from "@/app/actions/admin";
import { fzrPickSearch } from "@/app/actions/admin-families";
import { num, parsePremiumFields } from "@/lib/format";
import { useLang } from "@/components/lang";

const inp = "inp";
const lbl = "lbl";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800";
const Pencil = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
const Trash = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg>);

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* ================= DANH MỤC PREMIUM ================= */
export type PremiumCategoryDTO = { id: number; name: string; slug: string; description: string | null; icon: string | null; sort: number; active: boolean; metaTitle: string | null; metaDescription: string | null; productCount: number };

export function PremiumCategoryModal({ category, onClose }: { category?: PremiumCategoryDTO; onClose: () => void }) {
  const { t } = useLang();
  const c = category;
  const [name, setName] = useState(c?.name || "");
  const [slug, setSlug] = useState(c?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!c);
  return (
    <Modal title={c ? t("Chỉnh sửa Danh mục Premium") : t("Thêm Danh mục Premium Mới")} onClose={onClose}>
      <form action={adminSavePremiumCategory}>
        {c && <input type="hidden" name="id" value={c.id} />}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={lbl}>{t("Tên danh mục *")}</label>
            <input name="name" required value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} className={inp} placeholder={t("Ví dụ: Xem phim & Giải trí")} />
          </div>
          <div>
            <label className={lbl}>Slug *</label>
            <input name="slug" required value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} className={inp} placeholder="vi-du-xem-phim-giai-tri" />
          </div>
          <div><label className={lbl}>{t("Mô tả")}</label><textarea name="description" rows={2} defaultValue={c?.description || ""} className={inp} placeholder={t("Mô tả ngắn về danh mục...")} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t("Thứ tự hiển thị")}</label><input name="sort" type="number" defaultValue={c?.sort ?? 0} className={inp} /></div>
            <div>
              <label className={lbl}>{t("Trạng thái *")}</label>
              <select name="active" defaultValue={c ? (c.active ? "on" : "off") : "on"} className={inp}>
                <option value="on">{t("Đang hoạt động")}</option>
                <option value="off">{t("Tạm dừng")}</option>
              </select>
              {/* adminSavePremiumCategory đọc active === "on" từ checkbox — dùng hidden checkbox đồng bộ qua select ở dưới */}
            </div>
          </div>
          <div><label className={lbl}>{t("Icon danh mục")}</label><input name="icon" defaultValue={c?.icon || ""} className={inp} placeholder={t("Nhập ký tự icon hoặc URL ảnh...")} /></div>
          <details className="rounded-xl border border-slate-200 px-4 py-3" open={!!c && (!!c.metaTitle || !!c.metaDescription)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">SEO</summary>
            <div className="mt-3 space-y-4">
              <div>
                <label className={lbl}>{t("Tiêu đề SEO")} <span className="font-normal text-slate-400">({t("tối đa 255 ký tự")})</span></label>
                <input name="metaTitle" defaultValue={c?.metaTitle || ""} maxLength={255} className={inp} placeholder={c?.name || ""} />
                <p className="mt-1 text-xs text-slate-400">{t("Hiện ở trang danh sách khi khách lọc theo danh mục này. Để trống = theo mặc định toàn web.")}</p>
              </div>
              <div>
                <label className={lbl}>{t("Mô tả SEO")} <span className="font-normal text-slate-400">({t("tối đa 320 ký tự")})</span></label>
                <textarea name="metaDescription" defaultValue={c?.metaDescription || ""} maxLength={320} rows={3} className={inp} placeholder={c?.description || ""} />
              </div>
            </div>
          </details>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Hủy")}</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("Lưu danh mục")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PremiumCategoriesClient({ categories }: { categories: PremiumCategoryDTO[] }) {
  const { t, td } = useLang();
  const [editing, setEditing] = useState<PremiumCategoryDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("+ Thêm danh mục mới")}</button>
      </div>
      {open && <PremiumCategoryModal category={editing} onClose={() => setOpen(false)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{t("Danh mục")}</th><th className="th">Slug</th><th className="th">{t("Số sản phẩm")}</th><th className="th">{t("Thứ tự")}</th><th className="th">{t("Trạng thái")}</th><th className="th text-right">{t("Thao tác")}</th></tr></thead>
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
                    <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{c.active ? t("Đang hoạt động") : t("Tạm dừng")}</button>
                  </form>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className={iconBtn} title={t("Sửa")} onClick={() => { setEditing(c); setOpen(true); }}><Pencil /></button>
                    <form action={adminDeletePremiumCategory} onSubmit={(e) => { if (!confirm(`${t("Xoá danh mục")} "${c.name}"?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title={t("Xoá")}><Trash /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-slate-400">{t("Chưa có danh mục nào.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================= SẢN PHẨM & GÓI ================= */
export type PremiumVariantDTO = { id: number; name: string; price: number; cost: number; warrantyDays: number; providerCycle: number | null; providerId: number | null; providerGroup: string | null; providerItemId: string | null; deliveryType: string | null; outOfStock: boolean; stockQty: number | null; active: boolean; sort: number; stockAvailable: number; stockTotal: number; providerNote: string | null; customFields: string | null };
export type PremiumProductDTO = {
  id: number; categoryId: number; categoryName: string; name: string; slug: string; tagline: string | null; description: string | null;
  color: string; fulfillment: string; providerId: number | null; providerProductId: string | null; customFields: string | null;
  buyNote: string | null; imageUrl: string | null; images: string[]; usageGuide: string | null; warrantyInfo: string | null;
  metaTitle: string | null; metaDescription: string | null;
  active: boolean; sort: number; orderCount: number; variants: PremiumVariantDTO[];
};
export type PremiumProviderOpt = { id: number; name: string; driver: string; currency: string; exchangeRate: number };

export function ProductModal({ product, categories, providers, onClose, returnTo = "/admin/premium" }: { product?: PremiumProductDTO; categories: PremiumCategoryDTO[]; providers: PremiumProviderOpt[]; onClose: () => void; returnTo?: string }) {
  const { t } = useLang();
  const p = product;
  const [name, setName] = useState(p?.name || "");
  const [slug, setSlug] = useState(p?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!p);
  const [fulfillment, setFulfillment] = useState(p?.fulfillment || "MANUAL");
  const [metaTitle, setMetaTitle] = useState(p?.metaTitle || "");
  const [metaDescription, setMetaDescription] = useState(p?.metaDescription || "");
  // Chọn sản phẩm từ nguồn khi hình thức giao = API: mã phía NCC là state
  // để khung tìm kiếm bên dưới điền vào (vẫn gõ tay được). Đổi nhà cung cấp
  // thì mã cũ vô nghĩa — xoá kèm kết quả tìm và lựa chọn cũ.
  const [providerId, setProviderId] = useState(p?.providerId ? String(p.providerId) : "");
  const [providerProductId, setProviderProductId] = useState(p?.providerProductId || "");
  const [pickQ, setPickQ] = useState("");
  const [pickItems, setPickItems] = useState<{ id: string; name: string; sub: string; price: string }[] | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState("");
  const [pickNote, setPickNote] = useState("");
  const [pickedName, setPickedName] = useState("");
  const [fzrGroup, setFzrGroup] = useState<"gamekeys" | "giftcards">("gamekeys");
  const selectedProvider = providers.find((pr) => String(pr.id) === providerId);
  const isFzrProvider = selectedProvider?.driver === "FZR";
  // Có gắn nhà cung cấp thì sản phẩm tự đấu API, KHÔNG chọn hình thức giao
  // ở đây — riêng ThaTim: chọn sản phẩm/chu kỳ nguồn ở form Gói bán (lệnh
  // Tín 2026-11-13). Ô hình thức giao chỉ còn cho sản phẩm không gắn nguồn
  // (kho tự động / thủ công).
  const isStandardProvider = selectedProvider?.driver === "STANDARD";
  const hasProvider = !!selectedProvider;
  const effUi = hasProvider ? "API" : fulfillment;
  const changeProvider = (v: string) => {
    setProviderId(v);
    setProviderProductId("");
    setPickItems(null);
    setPickError("");
    setPickNote("");
    setPickedName("");
  };
  const runPickSearch = async () => {
    if (!selectedProvider || pickBusy) return;
    setPickBusy(true); setPickError(""); setPickNote("");
    try {
      const r = await fzrPickSearch(fzrGroup, pickQ, 1);
      if (!r.ok) { setPickError(r.error || t("Không tìm được sản phẩm")); setPickItems(null); return; }
      setPickItems((r.items || []).map((it) => ({ id: it.id, name: it.name, sub: [it.extra, it.extra2].filter(Boolean).join(" · "), price: it.priceUsd ? `$${it.priceUsd}` : "" })));
      if (r.hasMore) setPickNote(t("Còn thêm kết quả — gõ từ khoá cụ thể hơn để thu hẹp."));
    } catch {
      setPickError(t("Không gọi được nhà cung cấp"));
      setPickItems(null);
    } finally {
      setPickBusy(false);
    }
  };
  const applyPick = (it: { id: string; name: string }) => {
    setProviderProductId(it.id);
    setPickedName(it.name);
    if (!p) { setName(it.name); if (!slugTouched) setSlug(slugify(it.name)); }
  };
  return (
    <Modal title={p ? t("Chỉnh sửa Sản phẩm Premium") : t("Thêm Sản phẩm Premium Mới")} onClose={onClose} wide>
      <form action={adminSaveProduct}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="max-h-[66vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className={lbl}>{t("Tên sản phẩm *")}</label>
            <input name="name" required value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} className={inp} placeholder={t("Ví dụ: Netflix Premium")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Slug *</label>
              <input name="slug" required value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} className={inp} placeholder="vi-du-netflix-premium" />
            </div>
            <div>
              <label className={lbl}>{t("Danh mục *")}</label>
              <select name="categoryId" required defaultValue={p?.categoryId || ""} className={inp}>
                <option value="" disabled>{t("Chọn danh mục")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>{t("Thứ tự hiển thị")}</label><input name="sort" type="number" defaultValue={p?.sort ?? 0} className={inp} /></div>
            <div className="flex items-end pb-1"><Switch name="active" defaultChecked={p ? p.active : true} label={t("Trạng thái: Đang bán")} /></div>
          </div>
          <div><label className={lbl}>{t("Ảnh sản phẩm")}</label><ImagesField defaults={p?.images || []} /></div>
          <div><label className={lbl}>{t("Mô tả ngắn")}</label><textarea name="tagline" rows={2} defaultValue={p?.tagline || ""} className={inp} placeholder={t("Mô tả ngắn gọn về sản phẩm...")} /></div>
          <div><label className={lbl}>{t("Mô tả chi tiết")}</label><RichTextEditor name="description" defaultValue={p?.description} minHeight={160} /></div>
          <div><label className={lbl}>{t("Lưu ý khi mua")}</label><textarea name="buyNote" rows={2} defaultValue={p?.buyNote || ""} className={inp} placeholder={t("Các lưu ý quan trọng cho khách hàng...")} /></div>
          <details className="rounded-xl border border-slate-200 px-4 py-3" open={!!p && (p.fulfillment !== "MANUAL" || !!p.providerId || !!p.warrantyInfo || !!p.usageGuide)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t("Cài đặt nâng cao: nguồn hàng, bảo hành")}</summary>
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>{t("Nhà cung cấp")}</label>
                  <select name="providerId" value={providerId} onChange={(e) => changeProvider(e.target.value)} className={inp}>
                    <option value="">{t("Không gắn nguồn")}</option>
                    {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>{t("Màu nhận diện")}</label><input name="color" type="color" defaultValue={p?.color || "#3178fc"} className="h-[42px] w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-1.5 py-1.5" /></div>
              </div>
              {hasProvider ? (
                <>
                  <input type="hidden" name="fulfillment" value="API" />
                  {isStandardProvider ? (
                    <>
                      <input type="hidden" name="providerProductId" value={providerProductId} />
                      <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                        {t("Đấu API qua")} {selectedProvider?.name} — {t("mở Gói bán của sản phẩm để tìm và chọn các gói từ nguồn.")}
                      </p>
                    </>
                  ) : (
                    <div><label className={lbl}>{t("ID sản phẩm tại NCC")}</label><input name="providerProductId" value={providerProductId} onChange={(e) => { setProviderProductId(e.target.value); setPickedName(""); }} className={inp} placeholder={t("Chọn từ nguồn bên dưới hoặc gõ mã")} /></div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>{t("Hình thức giao")}</label>
                    <select name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} className={inp}>
                      <option value="AUTO_STOCK">{t("Kho tự động (giao ngay)")}</option>
                      <option value="MANUAL">{t("Thủ công (nâng cấp chính chủ)")}</option>
                      <option value="API">{t("Đấu API nhà cung cấp")}</option>
                    </select>
                  </div>
                  {fulfillment === "API" && (
                    <div><label className={lbl}>{t("ID sản phẩm tại NCC")}</label><input name="providerProductId" value={providerProductId} onChange={(e) => { setProviderProductId(e.target.value); setPickedName(""); }} className={inp} placeholder={t("Chọn từ nguồn bên dưới hoặc gõ mã")} /></div>
                  )}
                </div>
              )}
              {effUi === "API" && isFzrProvider && selectedProvider && (
                <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-brand-700">{t("Tìm sản phẩm từ nguồn")}</div>
                    <>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isFzrProvider && (
                          <select value={fzrGroup} onChange={(e) => { setFzrGroup(e.target.value as "gamekeys" | "giftcards"); setPickItems(null); setPickedName(""); }} className={`${inp} !w-36 !py-2 text-[13px]`}>
                            <option value="gamekeys">Game Key</option>
                            <option value="giftcards">Gift Card</option>
                          </select>
                        )}
                        <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder={t("Tìm theo tên trong catalog của nhà cung cấp...")} className={`${inp} min-w-[200px] flex-1 !py-2 text-[13px]`}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runPickSearch(); } }} />
                        <button type="button" onClick={runPickSearch} disabled={pickBusy} className="btn-primary btn-row !px-3.5 disabled:opacity-50">{pickBusy ? t("Đang gọi...") : t("Tìm")}</button>
                      </div>
                      {pickError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{pickError}</p>}
                      {pickNote && <p className="mt-1.5 text-xs text-slate-400">{pickNote}</p>}
                      {pickItems && (
                        pickItems.length === 0
                          ? <p className="mt-2 text-xs text-slate-400">{t("Không có sản phẩm nào khớp trong catalog của nhà cung cấp.")}</p>
                          : (
                            <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                              {pickItems.map((it) => (
                                <button key={it.id} type="button" onClick={() => applyPick(it)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-brand-50 ${providerProductId === it.id ? "bg-brand-50" : ""}`}>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-bold text-slate-800">{it.name}</span>
                                    <span className="block text-[11px] text-slate-400">{t("Mã")}: {it.id}{it.sub ? ` · ${it.sub}` : ""}</span>
                                  </span>
                                  {it.price && <span className="shrink-0 text-[12px] font-bold text-slate-500">{it.price}</span>}
                                </button>
                              ))}
                            </div>
                          )
                      )}
                      {pickedName && providerProductId && (
                        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                          {t("Đã chọn")}: {pickedName} ({t("mã")} {providerProductId}) — {t("mã đã điền vào ô ID sản phẩm tại NCC")}.
                        </p>
                      )}
                    </>
                </div>
              )}
              <div><label className={lbl}>{t("Thông tin bảo hành")}</label><RichTextEditor name="warrantyInfo" defaultValue={p?.warrantyInfo} minHeight={100} /></div>
              <div><label className={lbl}>{t("Hướng dẫn sử dụng")}</label><RichTextEditor name="usageGuide" defaultValue={p?.usageGuide} minHeight={100} /></div>
              {/* Trường tuỳ chỉnh KHÔNG còn ở form sản phẩm — định nghĩa theo
                  từng GÓI trong form Gói bán (lệnh Tín 2026-11-13). */}
            </div>
          </details>
          <details className="rounded-xl border border-slate-200 px-4 py-3" open={!!p && (!!p.metaTitle || !!p.metaDescription)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">SEO</summary>
            <div className="mt-3 space-y-4">
              <div>
                <label className={lbl}>{t("Tiêu đề SEO")} <span className="font-normal text-slate-400">({metaTitle.length}/255)</span></label>
                <input name="metaTitle" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={255} className={inp} placeholder={p?.name || ""} />
                <p className="mt-1 text-xs text-slate-400">{t("Để trống = tự động dùng tên sản phẩm.")}</p>
              </div>
              <div>
                <label className={lbl}>{t("Mô tả SEO")} <span className="font-normal text-slate-400">({metaDescription.length}/320)</span></label>
                <textarea name="metaDescription" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} maxLength={320} rows={3} className={inp} placeholder={p?.tagline || ""} />
                <p className="mt-1 text-xs text-slate-400">{t("Để trống = tự động dùng mô tả ngắn của sản phẩm.")}</p>
              </div>
            </div>
          </details>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Hủy")}</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("Lưu sản phẩm")}</button>
        </div>
      </form>
    </Modal>
  );
}

const PROVIDER_GROUPS = ["gamekeys", "giftcards", "topups", "manual", "telegram_stars", "telegram_premium", "steam_topup", "steam_gift"];

type SourceCycle = { cycle: number; label: string | null; priceRaw: number; note: string | null };
type SourceProduct = { id: string; name: string; category: string; cycles: SourceCycle[] };

export function VariantsModal({ product, onClose, providers = [], returnTo = "/admin/premium" }: { product: PremiumProductDTO; onClose: () => void; providers?: PremiumProviderOpt[]; returnTo?: string }) {
  const { t, td } = useLang();
  const small = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm w-full";
  // Tìm gói từ nguồn (lệnh Tín 2026-11-13 tối): sản phẩm gắn NCC chuẩn kiểu
  // ThaTim thì gói bán chọn từ catalog nguồn — bước 1 gắn sản phẩm nguồn
  // (lưu vào sản phẩm), bước 2 bấm chu kỳ để điền sẵn form thêm gói.
  const srcProvider = providers.find((pr) => pr.id === product.providerId) || null;
  const isStandardSrc = srcProvider?.driver === "STANDARD";
  const [srcPid, setSrcPid] = useState(product.providerProductId || "");
  const [srcName, setSrcName] = useState("");
  const [fQ, setFQ] = useState("");
  const [fBusy, setFBusy] = useState(false);
  const [fError, setFError] = useState("");
  const [fNote, setFNote] = useState("");
  const [fProducts, setFProducts] = useState<SourceProduct[] | null>(null);
  const [fCycles, setFCycles] = useState<SourceCycle[] | null>(null);
  const [fPicked, setFPicked] = useState("");
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addCost, setAddCost] = useState("");
  const [addCycle, setAddCycle] = useState("");
  // Ghi chú của option nguồn đang chọn (nhiều option trùng thời hạn chỉ khác
  // nhau ở ghi chú này) — lưu vào providerNote của gói khi thêm.
  const [addNote, setAddNote] = useState("");
  const [pickedKey, setPickedKey] = useState("");
  const toVnd = (raw: number) => (!srcProvider || srcProvider.currency === "VND" ? Math.round(raw) : Math.round(raw * (srcProvider.exchangeRate || 1)));
  const fmtSrc = (raw: number) => `${raw.toLocaleString("vi-VN")} ${srcProvider?.currency || ""}`;
  const loadCycles = async (pid: string) => {
    if (!srcProvider) return;
    setFBusy(true); setFError("");
    try {
      const r = await adminProviderProductCycles(srcProvider.id, pid);
      if (!r.ok) { setFError(r.error); setFCycles(null); return; }
      setSrcName(r.name);
      setFCycles(r.cycles);
    } catch { setFError(t("Không gọi được nhà cung cấp")); }
    finally { setFBusy(false); }
  };
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (isStandardSrc && srcPid && !autoLoaded.current) { autoLoaded.current = true; void loadCycles(srcPid); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const searchSourceProducts = async () => {
    if (!srcProvider || fBusy) return;
    setFBusy(true); setFError(""); setFNote("");
    try {
      const r = await adminProviderCatalogSearch(srcProvider.id, fQ);
      if (!r.ok) { setFError(r.error); setFProducts(null); return; }
      setFProducts(r.items.map((it) => ({ id: it.id, name: it.name, category: it.category, cycles: it.cycles })));
      if (r.total > r.items.length) setFNote(t("Hiện 50 kết quả đầu trong tổng số khớp — gõ thêm từ khoá để thu hẹp."));
    } catch { setFError(t("Không gọi được nhà cung cấp")); setFProducts(null); }
    finally { setFBusy(false); }
  };
  const pickSourceProduct = async (it: SourceProduct) => {
    if (!srcProvider || fBusy) return;
    setFBusy(true); setFError("");
    try {
      const r = await adminSetProductSource(product.id, srcProvider.id, it.id);
      if (!r.ok) { setFError(r.error); return; }
      setSrcPid(it.id); setSrcName(it.name); setFCycles(it.cycles); setFProducts(null);
      setFNote(t("Đã gắn sản phẩm nguồn — chọn chu kỳ bên dưới để điền vào form thêm gói."));
    } catch { setFError(t("Không gắn được sản phẩm nguồn")); }
    finally { setFBusy(false); }
  };
  const pickSourceCycle = (c: SourceCycle) => {
    const vnd = toVnd(c.priceRaw);
    setAddCycle(String(c.cycle));
    setAddName(c.label || `${c.cycle} tháng`);
    setAddCost(String(vnd));
    if (!addPrice) setAddPrice(String(vnd));
    setAddNote(c.note || "");
    setPickedKey(`${c.cycle}|${c.priceRaw}|${c.note || ""}`);
    setFPicked(`${c.label || `${c.cycle} tháng`} · ${fmtSrc(c.priceRaw)}${c.note ? ` — ${c.note}` : ""}`);
  };
  const changeSourceProduct = () => { setSrcPid(""); setSrcName(""); setFCycles(null); setFProducts(null); setFPicked(""); setFNote(""); setFError(""); setAddNote(""); setPickedKey(""); };
  // Hàng 3: ánh xạ NCC theo gói (FIX7 E2) — đồng bộ FZR ghi sẵn 3 trường này;
  // nay admin sửa tay được để tự dựng sản phẩm API (Telegram/Steam/...) hoặc
  // gỡ ánh xạ. Nhóm có datalist gợi ý các nhóm chuẩn, vẫn gõ tự do được.
  const mapRow = (v?: PremiumVariantDTO) => (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("NCC của gói")}
        <select name="providerId" defaultValue={v?.providerId ?? ""} className={`${small} !w-auto`}>
          <option value="">{t("Không thuộc NCC")}</option>
          {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </label>
      <input name="providerGroup" defaultValue={v?.providerGroup ?? ""} list={`pgroups-${product.id}`} className={`${small} !w-44`} placeholder={t("Nhóm NCC của gói")} title="providerGroup" />
      <input name="providerItemId" defaultValue={v?.providerItemId ?? ""} className={`${small} !w-40`} placeholder={t("ID gói tại NCC")} title="providerItemId" />
      <datalist id={`pgroups-${product.id}`}>{PROVIDER_GROUPS.map((g) => <option key={g} value={g} />)}</datalist>
    </div>
  );
  return (
    <Modal title={`${t("Gói bán")} — ${product.name}`} onClose={onClose} wide>
      <div className="max-h-[66vh] overflow-y-auto px-6 py-5">
        <div className="space-y-3">
          {product.variants.map((v) => (
            <form key={v.id} action={adminSaveVariant} className="rounded-xl border border-slate-200 p-3">
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input name="name" defaultValue={v.name} className={small} placeholder={t("Tên gói")} />
                <input name="price" type="number" min={0} defaultValue={v.price} className={small} placeholder={t("Giá bán")} />
                <input name="cost" type="number" min={0} defaultValue={v.cost} className={small} placeholder={t("Giá vốn")} />
                <input name="warrantyDays" type="number" min={0} defaultValue={v.warrantyDays} className={small} placeholder={t("BH (ngày)")} />
                <input name="providerCycle" type="number" min={0} defaultValue={v.providerCycle ?? ""} className={small} placeholder={t("Chu kỳ NCC (tháng)")} />
                <input name="sort" type="number" defaultValue={v.sort} className={small} placeholder={t("Thứ tự")} />
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked={v.active} className="h-4 w-4" /> {t("Đang bán")}</label>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{t("Lưu")}</button>
                  <button formAction={adminDeleteVariant} onClick={(e) => { if (!confirm(`${t("Xoá gói")} "${v.name}"?`)) e.preventDefault(); }} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">{t("Xoá gói")}</button>
                  {product.fulfillment === "AUTO_STOCK"
                    ? <span className="text-xs text-slate-400">{`${t("Kho:")} ${v.stockAvailable}/${v.stockTotal}`}</span>
                    : <span className="text-xs text-slate-400">{v.stockQty == null ? t("Kho: không giới hạn") : `${t("Kho:")} ${v.stockQty}`}</span>}
                </div>
              </div>
              {/* Hàng 2: loại giao hàng + kho số lượng + cờ hết hàng (AUTO_STOCK
                  theo dõi bằng dòng kho nên chỉ hiện loại giao hàng). */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("Loại giao hàng")}
                  <select name="deliveryType" defaultValue={v.deliveryType ?? ""} className={`${small} !w-auto`}>
                    <option value="">{t("Mặc định theo hình thức giao")}</option>
                    <option value="FAST">{t("Giao nhanh")}</option>
                    <option value="SLOW">{t("Giao chậm")}</option>
                  </select>
                </label>
                {product.fulfillment !== "AUTO_STOCK" && (
                  <>
                    <input name="stockQty" type="number" min={0} defaultValue={v.stockQty ?? ""} className={`${small} !w-40`} placeholder={t("Số lượng kho — để trống = không giới hạn")} title={t("Số lượng kho — để trống = không giới hạn")} />
                    <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="outOfStock" defaultChecked={v.outOfStock} className="h-4 w-4" /> {t("Hết hàng (chặn đặt)")}</label>
                  </>
                )}
              </div>
              {mapRow(v)}
              {v.providerNote && <p className="mt-1.5 text-xs text-slate-400">{t("Ghi chú gói tại NCC")}: {v.providerNote}</p>}
              {/* Trường tuỳ chỉnh RIÊNG của gói (lệnh Tín 2026-11-13): khách
                  mua gói này thì điền các trường này; gói để trống thì dùng
                  trường của sản phẩm. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500">{t("Trường tuỳ chỉnh của gói này")}</summary>
                <div className="mt-2"><PremiumFieldsEditor initial={parsePremiumFields(v.customFields)} /></div>
              </details>
            </form>
          ))}
          {product.variants.length === 0 && <div className="py-4 text-center text-sm text-slate-400">{t("Chưa có gói nào — thêm gói đầu tiên ở dưới.")}</div>}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 text-sm font-bold text-slate-700">{t("Thêm gói mới")}</div>
          {isStandardSrc && (
            <div className="mb-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-brand-700">{t("Tìm gói từ nguồn")} — {srcProvider?.name}</div>
              {!srcPid ? (
                <>
                  <p className="mt-1.5 text-xs text-slate-400">{t("Tìm và chọn sản phẩm nguồn trước — các chu kỳ của nó sẽ thành các gói bán.")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder={t("Tìm theo tên trong catalog của nhà cung cấp...")} className={`${inp} min-w-[200px] flex-1 !py-2 text-[13px]`}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchSourceProducts(); } }} />
                    <button type="button" onClick={() => void searchSourceProducts()} disabled={fBusy} className="btn-primary btn-row !px-3.5 disabled:opacity-50">{fBusy ? t("Đang gọi...") : t("Tìm")}</button>
                  </div>
                  {fProducts && (
                    fProducts.length === 0
                      ? <p className="mt-2 text-xs text-slate-400">{t("Không có sản phẩm nào khớp trong catalog của nhà cung cấp.")}</p>
                      : (
                        <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          {fProducts.map((it) => (
                            <button key={it.id} type="button" onClick={() => void pickSourceProduct(it)} disabled={fBusy}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-brand-50 disabled:opacity-50">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-bold text-slate-800">{it.name}</span>
                                <span className="block text-[11px] text-slate-400">{t("Mã")}: {it.id} · {it.category} · {it.cycles.length} {t("chu kỳ")}</span>
                              </span>
                              {it.cycles[0] && <span className="shrink-0 text-[12px] font-bold text-slate-500">{fmtSrc(it.cycles[0].priceRaw)}</span>}
                            </button>
                          ))}
                        </div>
                      )
                  )}
                </>
              ) : (
                <>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-600">{t("Sản phẩm nguồn")}: {srcName || srcPid} ({t("mã")} {srcPid})</span>
                    <button type="button" onClick={changeSourceProduct} className="font-semibold text-blue-600 hover:text-blue-800">{t("Đổi sản phẩm nguồn")}</button>
                    {!fCycles && !fBusy && <button type="button" onClick={() => void loadCycles(srcPid)} className="font-semibold text-blue-600 hover:text-blue-800">{t("Tải các chu kỳ")}</button>}
                  </div>
                  {fBusy && <p className="mt-1.5 text-xs text-slate-400">{t("Đang gọi nhà cung cấp...")}</p>}
                  {fCycles && (
                    fCycles.length === 0
                      ? <p className="mt-2 text-xs text-slate-400">{t("Sản phẩm nguồn không có chu kỳ nào.")}</p>
                      : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {fCycles.map((c, i) => (
                            <button key={`${c.cycle}-${c.priceRaw}-${i}`} type="button" onClick={() => pickSourceCycle(c)} title={c.note || undefined}
                              className={`max-w-[280px] rounded-lg border px-3 py-1.5 text-left transition ${pickedKey === `${c.cycle}|${c.priceRaw}|${c.note || ""}` ? "border-brand-500 bg-brand-50 text-brand-700" : "border-brand-200 bg-white text-slate-700 hover:bg-brand-50"}`}>
                              <span className="block text-xs font-semibold">{c.label || `${c.cycle} tháng`} · {fmtSrc(c.priceRaw)}</span>
                              {c.note && <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-400">{c.note}</span>}
                            </button>
                          ))}
                        </div>
                      )
                  )}
                  {fPicked && (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      {t("Đã chọn gói nguồn")}: {fPicked} — {t("đã điền vào form thêm gói bên dưới, kiểm tra giá rồi bấm Thêm gói.")}
                    </p>
                  )}
                </>
              )}
              {fError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{fError}</p>}
              {fNote && <p className="mt-1.5 text-xs text-slate-400">{fNote}</p>}
            </div>
          )}
          <form action={adminSaveVariant} className="rounded-xl border border-dashed border-slate-300 p-3">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input name="name" required value={addName} onChange={(e) => setAddName(e.target.value)} className={small} placeholder={t("Tên gói (VD: 1 Tháng)")} />
              <input name="price" type="number" min={0} required value={addPrice} onChange={(e) => setAddPrice(e.target.value)} className={small} placeholder={t("Giá bán")} />
              <input name="cost" type="number" min={0} value={addCost} onChange={(e) => setAddCost(e.target.value)} className={small} placeholder={t("Giá vốn")} />
              <input name="warrantyDays" type="number" min={0} className={small} placeholder={t("BH (ngày)")} />
              <input name="providerCycle" type="number" min={0} value={addCycle} onChange={(e) => setAddCycle(e.target.value)} className={small} placeholder={t("Chu kỳ NCC (tháng)")} />
              <input name="sort" type="number" defaultValue={0} className={small} placeholder={t("Thứ tự")} />
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked className="h-4 w-4" /> {t("Đang bán")}</label>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{t("+ Thêm gói")}</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("Loại giao hàng")}
                <select name="deliveryType" defaultValue="" className={`${small} !w-auto`}>
                  <option value="">{t("Mặc định theo hình thức giao")}</option>
                  <option value="FAST">{t("Giao nhanh")}</option>
                  <option value="SLOW">{t("Giao chậm")}</option>
                </select>
              </label>
              {product.fulfillment !== "AUTO_STOCK" && (
                <>
                  <input name="stockQty" type="number" min={0} className={`${small} !w-40`} placeholder={t("Số lượng kho — để trống = không giới hạn")} title={t("Số lượng kho — để trống = không giới hạn")} />
                  <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="outOfStock" className="h-4 w-4" /> {t("Hết hàng (chặn đặt)")}</label>
                </>
              )}
            </div>
            {mapRow()}
            <input type="hidden" name="providerNote" value={addNote} />
            {addNote && <p className="mt-2 text-xs text-slate-400">{t("Ghi chú gói tại NCC")}: {addNote}</p>}
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-500">{t("Trường tuỳ chỉnh của gói này — khách điền khi mua gói này")}</div>
              <PremiumFieldsEditor initial={[]} />
            </div>
          </form>
          <div className="mt-4 flex items-center justify-between">
            <Link href="/admin/kho-premium" className="text-sm font-semibold text-blue-600 hover:text-blue-800">{t("Mở Kho tài khoản để nhập kho →")}</Link>
            <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Đóng")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ProductsClient({ products, categories, providers, returnTo = "/admin/premium", filterForm }: { products: PremiumProductDTO[]; categories: PremiumCategoryDTO[]; providers: PremiumProviderOpt[]; returnTo?: string; filterForm?: React.ReactNode }) {
  const { t, td } = useLang();
  const [editing, setEditing] = useState<PremiumProductDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [variantFor, setVariantFor] = useState<PremiumProductDTO | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Link href="/admin/kho-premium" className="btn-ghost !px-4">{t("Kho tài khoản")}</Link>
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{t("+ Thêm sản phẩm mới")}</button>
      </div>
      {filterForm}
      {open && <ProductModal product={editing} categories={categories} providers={providers} returnTo={returnTo} onClose={() => setOpen(false)} />}
      {variantFor && <VariantsModal product={variantFor} providers={providers} returnTo={returnTo} onClose={() => setVariantFor(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr className="border-b border-slate-100"><th className="th">{t("Sản phẩm")}</th><th className="th">{t("Danh mục")}</th><th className="th">{t("Số gói")}</th><th className="th">{t("Đơn hàng")}</th><th className="th">{t("Thứ tự")}</th><th className="th">{t("Trạng thái")}</th><th className="th text-right">{t("Thao tác")}</th></tr></thead>
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
                <td className="td"><button onClick={() => setVariantFor(p)} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-100">{`${p.variants.length} ${t("gói")}`}</button></td>
                <td className="td text-slate-600">{num(p.orderCount)}</td>
                <td className="td text-slate-600">{p.sort}</td>
                <td className="td">
                  <form action={adminToggleProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{p.active ? t("Đang bán") : t("Tạm dừng")}</button>
                  </form>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" onClick={() => setVariantFor(p)}>{t("Gói")}</button>
                    <button className={iconBtn} title={t("Sửa")} onClick={() => { setEditing(p); setOpen(true); }}><Pencil /></button>
                    <form action={adminDeleteProduct} onSubmit={(e) => { if (!confirm(`${t("Xoá sản phẩm")} "${p.name}"?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title={t("Xoá")}><Trash /></button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="td py-10 text-center text-slate-400">{t("Chưa có sản phẩm nào khớp bộ lọc.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
