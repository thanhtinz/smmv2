"use client";
import { useState } from "react";
import { Modal, Switch } from "@/components/admin-catalog";
import { Badge } from "@/components/ui";
import { useLang } from "@/components/lang";

export type ContactWidgetDTO = { id: number; name: string; link: string; image: string | null; active: boolean; bg: string };
type Action = (formData: FormData) => void | Promise<void>;

/** Quản lý Widget Liên hệ — danh sách thẻ như bản mẫu: huy hiệu Hiển thị/Đã ẩn,
 *  công tắc bật/tắt từng kênh, ảnh (tải lên) hoặc ô màu theo kênh, Sửa/Xoá.
 *  Dùng chung cho Admin web mẹ và Panel Admin con (action truyền vào theo phạm vi). */
export function ContactWidgetsManager({ items, saveAction, deleteAction, toggleAction, seedAction, hasLegacy }: {
  items: ContactWidgetDTO[];
  saveAction: Action;
  deleteAction: Action;
  toggleAction: Action;
  seedAction?: Action;
  hasLegacy?: boolean;
}) {
  const { t, td } = useLang();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ContactWidgetDTO | null>(null);
  const [img, setImg] = useState<string>("");
  const [imgName, setImgName] = useState<string>("");

  const openModal = (w: ContactWidgetDTO | null) => {
    setEdit(w);
    setImg(w?.image || "");
    setImgName(w?.image ? t("Ảnh hiện tại") : "");
    setOpen(true);
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/image\/(png|jpeg|svg\+xml|webp)/.test(f.type)) { alert(t("Chỉ nhận ảnh PNG, JPG, SVG hoặc WebP")); return; }
    if (f.size > 10 * 1024 * 1024) { alert(t("Ảnh tối đa 10MB")); return; }
    const reader = new FileReader();
    reader.onload = () => { setImg(String(reader.result || "")); setImgName(f.name); };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <button type="button" onClick={() => openModal(null)} className="btn-primary w-full !py-3 text-base">{t("+ Thêm liên hệ")}</button>

      {items.length === 0 && (
        <div className="card mt-5 p-6 text-center">
          <p className="text-sm text-slate-500">{t("Chưa có liên hệ nào trong danh sách widget.")}</p>
          {hasLegacy && seedAction && (
            <form action={seedAction} className="mt-3">
              <button className="btn-ghost">{t("Đưa các kênh đang cấu hình cũ vào danh sách")}</button>
              <p className="mt-2 text-xs text-slate-400">{t("Hiện khách vẫn đang thấy các kênh cũ — bấm nút này để chuyển chúng thành widget và quản lý tại đây.")}</p>
            </form>
          )}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {items.map((w) => (
          <div key={w.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <Badge cls={w.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}>{w.active ? t("Hiển thị") : t("Đã ẩn")}</Badge>
              <form action={toggleAction}>
                <input type="hidden" name="id" value={w.id} />
                <button type="submit" title={w.active ? t("Tắt hiển thị") : t("Bật hiển thị")} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${w.active ? "bg-brand-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${w.active ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </form>
            </div>
            <div className="mt-3 flex items-center gap-4">
              {w.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.image} alt={w.name} className="h-14 w-14 shrink-0 rounded-2xl object-cover bg-slate-50 border border-slate-100" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-white" style={{ background: w.bg }}>{w.name.trim().charAt(0).toUpperCase()}</span>
              )}
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-slate-900">{w.name}</div>
                <div className="truncate text-sm text-blue-600">{w.link}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => openModal(w)} className="btn-ghost flex-1 !py-2.5">{t("Sửa")}</button>
              <form action={deleteAction} onSubmit={(e) => { if (!confirm(`${t("Xoá liên hệ")} "${w.name}"?`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={w.id} />
                <button className="flex h-11 w-11 items-center justify-center rounded-full border border-red-200 text-red-500 transition hover:bg-red-50" title={t("Xoá")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {open && (
      <Modal onClose={() => setOpen(false)} title={edit ? t("Sửa liên hệ") : t("Thêm liên hệ mới")}>
        <form action={saveAction} className="space-y-4 px-6 py-5">
          <input type="hidden" name="id" value={edit?.id || 0} />
          <input type="hidden" name="image" value={img} />
          <div>
            <label className="lbl"><span className="text-red-500">* </span>{t("Tên hiển thị")}</label>
            <input className="inp" name="name" required defaultValue={edit?.name || ""} placeholder={t("VD: Zalo, Facebook, Hotline...")} />
          </div>
          <div>
            <label className="lbl">{t("Link liên hệ")}</label>
            <input className="inp" name="link" defaultValue={edit?.link || ""} placeholder="VD: https://zalo.me/0123456789" />
          </div>
          <div>
            <label className="lbl">{t("Hình ảnh")}</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-ghost cursor-pointer !py-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 inline"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>
                {t("Tải ảnh lên")}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <span className="text-xs text-slate-400">{t("PNG, JPG, SVG, WebP · Tối đa 10MB")}</span>
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-200" />
              )}
              {imgName && <span className="max-w-[160px] truncate text-xs text-slate-500">{imgName}</span>}
              {img && <button type="button" className="text-xs font-semibold text-red-500" onClick={() => { setImg(""); setImgName(""); }}>{t("Gỡ ảnh")}</button>}
            </div>
          </div>
          <Switch name="active" label={t("Đang hiển thị")} defaultChecked={edit ? edit.active : true} />
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost px-6" onClick={() => setOpen(false)}>{t("Huỷ")}</button>
            <button className="btn-primary px-8">{t("Lưu")}</button>
          </div>
        </form>
      </Modal>
      )}
    </div>
  );
}
