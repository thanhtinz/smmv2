"use client";

import { useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { uploadImageFile } from "@/lib/upload-client";

/* Nút tải ảnh GỌN cho các hàng form chật (picker FZR): bấm -> chọn file ->
   tải qua pipeline -> gọi onUploaded(url). Ô URL bên cạnh giữ nguyên. */
export function UploadButton({ onUploaded, stamp = true }: { onUploaded: (url: string) => void; stamp?: boolean }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="inline-flex">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        data-upload-input
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (ref.current) ref.current.value = "";
          if (!f) return;
          setBusy(true);
          try {
            const r = await uploadImageFile(f, stamp);
            onUploaded(r.url);
          } catch {
            /* lỗi hiển thị ở ô ảnh chính; nút gọn giữ im lặng */
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? t("Đang tải…") : t("Tải ảnh lên")}
      </button>
    </span>
  );
}

/* Ô nhập ảnh DÙNG CHUNG cho mọi bề mặt admin (đợt watermark 2026-11-08):
   chọn file từ máy -> tải qua pipeline (đóng dấu mờ nếu stamp=true) ->
   xem trước ngay; vẫn dán link URL bên ngoài được như cũ; giá trị cũ
   (URL ngoài/data-URL) hiển thị nguyên trạng. Hai cách dùng:
   - Trong form server-action: truyền `name` — component tự render input
     ẩn mang giá trị cuối.
   - Controlled: truyền `value` + `onChange`. */
export function ImageUpload({
  name,
  value,
  onChange,
  defaultValue,
  stamp = true,
  previewClass = "h-16 w-28",
}: {
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  defaultValue?: string;
  stamp?: boolean;
  previewClass?: string;
}) {
  const { t } = useLang();
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || "");
  const val = controlled ? (value as string) : inner;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (v: string) => {
    if (controlled) onChange?.(v);
    else setInner(v);
  };

  const pick = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await uploadImageFile(f, stamp);
      set(r.url);
      setNote(r.stamped ? t("Ảnh đã được đóng dấu mờ bản quyền.") : t("Đã tải ảnh lên (không đóng dấu)."));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Tải ảnh thất bại."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {name && <input type="hidden" name={name} value={val} />}
      <div className="flex items-start gap-3">
        {val ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={val} alt="" className={`${previewClass} shrink-0 rounded-lg border border-slate-200 object-cover`} />
        ) : (
          <div className={`${previewClass} flex shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[11px] text-slate-400`}>{t("Chưa có ảnh")}</div>
        )}
        <div className="min-w-0 flex-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-upload-input
            onChange={(e) => pick(e.target.files?.[0] || null)}
          />
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? t("Đang tải…") : t("Tải ảnh lên")}
          </button>
          <input
            className="inp mt-2"
            value={val.startsWith("data:") ? "" : val}
            onChange={(e) => set(e.target.value)}
            placeholder={val.startsWith("data:") ? t("Ảnh đã tải lên từ máy") : "https://…"}
          />
          {note && <p className="mt-1 text-xs text-emerald-600">{note}</p>}
          {err && <p className="mt-1 text-xs text-rose-500">{err}</p>}
        </div>
      </div>
    </div>
  );
}
