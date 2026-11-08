"use client";
import { useRef, useState } from "react";
import { I } from "@/components/ui";
import { parseAttachments } from "@/lib/attachments";
import { useLang } from "@/components/lang";

/** Ô đính kèm ảnh cho ticket: nén ảnh phía client (canvas, tối đa 1000px, JPEG)
 *  rồi nhét JSON data-URL vào hidden input "attachments" (tối đa 3 ảnh/tin). */
export function TicketAttachInput() {
  const { t, td } = useLang();
  const [imgs, setImgs] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    setErr("");
    if (!files) return;
    const next = [...imgs];
    for (const f of Array.from(files)) {
      if (next.length >= 3) { setErr(t("Tối đa 3 ảnh mỗi tin nhắn")); break; }
      if (!f.type.startsWith("image/")) { setErr(t("Chỉ đính kèm được file hình ảnh")); continue; }
      try {
        const url = await compress(f);
        if (url.length > 950 * 1024) { setErr(t("Ảnh quá lớn sau khi nén, chọn ảnh nhỏ hơn")); continue; }
        next.push(url);
      } catch { setErr(t("Không đọc được ảnh này")); }
    }
    setImgs(next);
    if (ref.current) ref.current.value = "";
  }

  return (
    <div className="w-full">
      <input type="hidden" name="attachments" value={imgs.length ? JSON.stringify(imgs) : ""} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">
          {t("Đính kèm ảnh")}
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {imgs.map((u, i) => (
          <span key={i} className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200" />
            <button type="button" onClick={() => setImgs(imgs.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white [&_svg]:h-3 [&_svg]:w-3">{I.x}</button>
          </span>
        ))}
        <span className="text-xs text-slate-400">{imgs.length}/3{t(" ảnh")}</span>
      </div>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

function compress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1000;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Render danh sách ảnh đính kèm của một tin nhắn ticket. */
export function TicketAttachments({ raw }: { raw?: string | null }) {
  const imgs = parseAttachments(raw);
  if (!imgs.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {imgs.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="max-h-40 rounded-lg border border-black/10 object-contain" />
        </a>
      ))}
    </div>
  );
}
