"use client";
import { useEffect, useRef, useState } from "react";

/** Tìm sản phẩm ngay trên header trắng dùng chung: nút kính lúp trong cụm
 *  phải của thanh; bấm mở ô nhập dạng LỚP PHỦ (overlay) ngay trong thanh —
 *  đè lên / che lấp các nút khác của header, KHÔNG xổ xuống thành hàng mới
 *  dưới header và không đẩy nội dung trang (lệnh Tín 2026-11-08, thay kiểu
 *  trượt xuống của fix5 WS11). Gửi đi (Enter / nút Tìm kiếm) chuyển tới
 *  trang danh sách với ĐÚNG tham số `q` mà ô tìm kiếm của chính trang
 *  /premium đang dùng (form GET name="q"). Esc hoặc nút × đóng lớp phủ,
 *  trả lại nguyên trạng các nút. */
export function HeaderSearch({ placeholder, searchLabel, closeLabel }: { placeholder: string; searchLabel: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);
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
      {/* Lớp phủ nhập liệu: bám theo khung header (header sticky là tổ tiên
          được định vị gần nhất) — mobile phủ gần hết bề ngang thanh, desktop
          neo phải phủ cụm nút hành động; chiều cao đúng bằng thanh nên nội
          dung bên dưới không hề xê dịch. */}
      {open && (
        <form method="get" action="/premium" onKeyDown={onKey} className="absolute inset-0 z-50 flex items-center gap-2 bg-white px-3 sm:left-auto sm:w-[min(560px,62vw)] sm:px-4">
          <span className="shrink-0 text-slate-400">{magnifier}</span>
          <input
            ref={inputRef}
            name="q"
            type="search"
            placeholder={placeholder}
            className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
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
