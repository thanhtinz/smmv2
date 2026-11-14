"use client";
import { useEffect, useRef, useState } from "react";

/** Thông báo NỔI (toast) dùng chung toàn web: mọi action lưu dữ liệu kết
 *  thúc bằng redirect mang ?msg= (thành công) / ?err= (thất bại) và các
 *  trang truyền hai giá trị đó vào Flash như cũ — khác biệt là giờ nó nổi
 *  cố định trên cùng (z-120, trên cả modal z-80) nên lưu xong là thấy ngay
 *  kết quả, tự ẩn sau 4,5 giây, bấm nút x tắt sớm. Vừa hiện là xoá luôn
 *  ?msg=/?err= khỏi thanh địa chỉ (replaceState, không đổi trạng thái
 *  router) để F5 không hiện lại thông báo cũ. */
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  const text = err || msg || "";
  const isErr = !!err;
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState("");
  const [currentErr, setCurrentErr] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    setCurrent(text);
    setCurrentErr(isErr);
    setVisible(true);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("msg") || url.searchParams.has("err")) {
        url.searchParams.delete("msg");
        url.searchParams.delete("err");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch { /* trình duyệt cũ — bỏ qua */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 4500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text, isErr]);

  if (!visible || !current) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[120] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xl" role="status">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${currentErr ? "bg-rose-500" : "bg-emerald-500"}`}>
        {currentErr ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5" /><path d="M12 16.5h.01" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        )}
      </span>
      <p className={`min-w-0 flex-1 text-sm font-semibold leading-snug ${currentErr ? "text-rose-700" : "text-slate-800"}`}>{current}</p>
      <button type="button" onClick={() => setVisible(false)} aria-label="Đóng thông báo" className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
