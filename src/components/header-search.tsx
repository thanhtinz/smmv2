"use client";
import { useEffect, useRef, useState } from "react";

/** Tìm sản phẩm ngay trên header trắng dùng chung (lệnh Tín 2026-11-07 23:39):
 *  nút kính lúp trong cụm phải của thanh; bấm mở ô nhập — desktop mở rộng
 *  ngay trong thanh, mobile trượt xuống thành hàng riêng dưới header. Gửi đi
 *  (Enter / nút Tìm kiếm) chuyển tới trang danh sách với ĐÚNG tham số `q`
 *  mà ô tìm kiếm của chính trang /premium đang dùng (form GET name="q").
 *  Esc hoặc nút × đóng lại. */
export function HeaderSearch({ placeholder, searchLabel, closeLabel }: { placeholder: string; searchLabel: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const desktopRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (window.innerWidth >= 640) desktopRef.current?.focus();
      else mobileRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [open ]);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
  const magnifier = (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
  );
  return (
    <>
      <button
        type="button"
        aria-label={searchLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        {magnifier}
      </button>
      {/* Desktop: ô nhập mở rộng trong thanh, không đẩy cụm phải ra ngoài */}
      <form method="get" action="/premium" onKeyDown={onKey} className={`hidden items-center gap-1 overflow-hidden transition-all duration-200 sm:flex ${open ? "w-56 opacity-100" : "pointer-events-none w-0 opacity-0"}`}>
        <input
          ref={desktopRef}
          name="q"
          type="search"
          placeholder={placeholder}
          tabIndex={open ? 0 : -1}
          className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
        <button type="button" aria-label={closeLabel} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </form>
      {/* Mobile: hàng nhập trượt xuống ngay dưới header (header là sticky —
          panel bám theo top-full của header). */}
      {open && (
        <form method="get" action="/premium" onKeyDown={onKey} className="absolute inset-x-0 top-full z-40 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 shadow-md sm:hidden">
          <input
            ref={mobileRef}
            name="q"
            type="search"
            placeholder={placeholder}
            className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
          <button className="h-10 shrink-0 rounded-full bg-slate-900 px-4 text-sm font-bold text-white">{searchLabel}</button>
          <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </form>
      )}
    </>
  );
}
