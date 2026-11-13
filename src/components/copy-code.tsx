"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

/** Nút sao chép mã giảm giá (trang Ưu đãi): bấm là chép mã vào clipboard,
 *  icon đổi thành dấu tick + chữ "Đã sao chép" trong ~1,6 giây rồi trở lại.
 *  Clipboard API lỗi (trình duyệt cũ/không HTTPS) thì lặng lẽ bỏ qua — mã
 *  vẫn hiển thị to trên thẻ để khách gõ tay. */
export function CopyCodeButton({ code }: { code: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    let done = false;
    try {
      await navigator.clipboard.writeText(code);
      done = true;
    } catch {
      // Clipboard API bị chặn (trình duyệt cũ / không HTTPS / chưa focus):
      // đường dự phòng textarea + execCommand như các nút sao chép thường dùng.
      try {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        done = document.execCommand("copy");
        ta.remove();
      } catch { /* không chép được — mã vẫn đọc được trên thẻ */ }
    }
    if (done) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={t("Sao chép")} title={t("Sao chép")}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition [&>svg]:h-3.5 [&>svg]:w-3.5 ${copied ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-brand-200 bg-white text-brand-700 hover:bg-brand-50"}`}>
      {copied ? I.check : I.copy}
      {copied ? t("Đã sao chép") : t("Sao chép")}
    </button>
  );
}
