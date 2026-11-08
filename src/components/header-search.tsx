"use client";
import { useEffect, useRef, useState } from "react";

/** Tìm sản phẩm ngay trên header trắng dùng chung: nút kính lúp trong cụm
 *  phải của thanh; bấm mở ô nhập dạng LỚP PHỦ (overlay) ngay trong thanh —
 *  đè lên / che lấp các nút khác của header, KHÔNG xổ xuống thành hàng mới
 *  dưới header và không đẩy nội dung trang (lệnh Tín 2026-11-08, thay kiểu
 *  trượt xuống của fix5 WS11). Gửi đi chuyển tới trang danh sách với ĐÚNG
 *  tham số `q` mà ô tìm kiếm của chính trang /premium đang dùng (form GET
 *  name="q").
 *  Hình dạng cuối theo lệnh Tín 2026-11-08 (amendment): KHÔNG có nút Tìm
 *  riêng — phím Tìm/Enter của bàn phím gửi form. Kính lúp nằm TRONG khung
 *  nhập (bên trái), dấu × nằm TRONG khung nhập (bên phải): có chữ thì ×
 *  xoá chữ, khung trống (hoặc bấm × lần nữa) thì × đóng lớp phủ. Esc cũng
 *  đóng lớp phủ, trả lại nguyên trạng các nút. */
export function HeaderSearch({ placeholder, searchLabel, closeLabel }: { placeholder: string; searchLabel: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open ]);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
  const onX = () => {
    if (value) { setValue(""); inputRef.current?.focus(); }
    else setOpen(false);
  };
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
        <form method="get" action="/premium" onKeyDown={onKey} className="absolute inset-0 z-50 flex items-center bg-white px-3 sm:left-auto sm:w-[min(560px,62vw)] sm:px-4">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
            </span>
            <input
              ref={inputRef}
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100 [&::-webkit-search-cancel-button]:appearance-none"
            />
            <button type="button" aria-label={closeLabel} onClick={onX} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </form>
      )}
    </>
  );
}
