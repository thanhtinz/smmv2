"use client";
import { useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { uploadImageFile } from "@/lib/upload-client";

export type BannerInit = { id?: number; image: string; href: string; lang: string; sort: number };

/** Form thêm/sửa banner trang chủ: dán link ảnh HOẶC tải ảnh từ máy qua
 *  pipeline dùng chung (ảnh được chuẩn hoá + ĐÓNG DẤU MỜ phía server rồi
 *  lưu DB, giá trị lưu là /media/<id>), link đích tuỳ chọn, NGÔN NGỮ banner
 *  (VI/EN — khách chọn ngôn ngữ nào thấy banner ngôn ngữ đó), thứ tự chạy. */
export function BannerForm({ action, initial }: { action: (fd: FormData) => void; initial: BannerInit }) {
  const { t } = useLang();
  const [image, setImage] = useState(initial.image || "");
  const [lang, setLang] = useState(initial.lang === "en" ? "en" : "vi");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      const r = await uploadImageFile(f, true);
      setImage(r.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Tải ảnh thất bại."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <form action={action} className="card p-6">
      <div className="font-bold text-slate-900">{initial.id ? t("Chỉnh sửa") : t("Thêm banner mới")}</div>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="image" value={image} />
      <input type="hidden" name="lang" value={lang} />
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div>
          <label className="lbl">{t("Ảnh banner")}</label>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="aspect-[16/7] w-full object-cover" />
            ) : (
              <div className="flex aspect-[16/7] w-full items-center justify-center text-sm text-slate-400">{t("Chưa có ảnh banner")}</div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost !px-3.5 text-sm font-semibold" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t("Đang tải…") : t("Tải ảnh")}</button>
            {image && <button type="button" className="btn-ghost !px-3.5 text-sm font-semibold" onClick={() => setImage("")}>{t("Xoá")}</button>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" data-upload-input onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          {err && <p className="mt-1 text-xs text-rose-500">{err}</p>}
        </div>
        <div className="space-y-4">
          <div>
            <label className="lbl">{t("Dán link ảnh hoặc tải ảnh từ máy")}</label>
            <input className="inp" value={image.startsWith("data:") ? "" : image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
            {image.startsWith("data:") && <p className="mt-1 text-xs text-slate-400">{t("Ảnh đã tải lên từ máy")}</p>}
          </div>
          <div>
            <label className="lbl">{t("Link đích khi bấm vào banner")}</label>
            <input className="inp" name="href" defaultValue={initial.href} placeholder="/premium" />
            <p className="mt-1 text-xs text-slate-400">{t("Để trống = bấm vào không dẫn đi đâu")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">{t("Ngôn ngữ banner")}</label>
              <div className="flex gap-1.5">
                {[{ k: "vi", n: "Tiếng Việt (VI)" }, { k: "en", n: "English (EN)" }].map((o) => (
                  <button key={o.k} type="button" onClick={() => setLang(o.k)}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${lang === o.k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {o.n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">{t("Thứ tự")}</label>
              <input className="inp" name="sort" type="number" defaultValue={initial.sort} />
            </div>
          </div>
        </div>
      </div>
      <button className="btn-primary mt-6 !py-2.5 px-6">{t("Lưu")}</button>
    </form>
  );
}
