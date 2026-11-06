"use client";
import { useEffect, useRef, useState } from "react";

/** Trình soạn thảo văn bản giàu (WYSIWYG nhẹ): đậm/nghiêng/gạch chân, tiêu đề,
 *  danh sách, liên kết — lưu HTML vào input ẩn cùng tên để form gửi như thường. */
export function RichTextEditor({ name, defaultValue, minHeight = 130 }: { name: string; defaultValue?: string | null; minHeight?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (boxRef.current && defaultValue) boxRef.current.innerHTML = defaultValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = () => { if (inputRef.current && boxRef.current) inputRef.current.value = boxRef.current.innerHTML; };
  const cmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    boxRef.current?.focus();
    sync();
  };
  const addLink = () => {
    const url = window.prompt("Nhập link (https://...)", "https://");
    if (url) cmd("createLink", url);
  };
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm text-slate-600 transition hover:bg-slate-200 hover:text-slate-900";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-brand-500">
      <input type="hidden" name={name} ref={inputRef} defaultValue={defaultValue || ""} />
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <button type="button" className={btn} title="Đậm" onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }}><b>B</b></button>
        <button type="button" className={btn} title="Nghiêng" onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }}><i>I</i></button>
        <button type="button" className={btn} title="Gạch chân" onMouseDown={(e) => { e.preventDefault(); cmd("underline"); }}><u>U</u></button>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button type="button" className={`${btn} text-xs font-bold`} title="Tiêu đề" onMouseDown={(e) => { e.preventDefault(); cmd("formatBlock", "H3"); }}>H3</button>
        <button type="button" className={`${btn} text-xs`} title="Đoạn thường" onMouseDown={(e) => { e.preventDefault(); cmd("formatBlock", "P"); }}>Đoạn</button>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button type="button" className={btn} title="Danh sách chấm" onMouseDown={(e) => { e.preventDefault(); cmd("insertUnorderedList"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" /></svg>
        </button>
        <button type="button" className={btn} title="Danh sách số" onMouseDown={(e) => { e.preventDefault(); cmd("insertOrderedList"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 6h1v4M4 10h2M5 14H3.5L5 16.5H3.5" /></svg>
        </button>
        <button type="button" className={btn} title="Chèn link" onMouseDown={(e) => { e.preventDefault(); addLink(); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
        </button>
        <button type="button" className={`${btn} text-xs`} title="Xoá định dạng" onMouseDown={(e) => { e.preventDefault(); cmd("removeFormat"); }}>Xoá kiểu</button>
      </div>
      <div
        ref={boxRef}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        style={{ minHeight }}
        className="px-3.5 py-3 text-sm leading-relaxed text-slate-800 outline-none [&_a]:text-brand-600 [&_a]:underline [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

/** Nhiều ảnh sản phẩm: danh sách ô nhập URL, thêm/xoá từng ảnh — gửi qua các input cùng tên "images". */
export function ImagesField({ defaults }: { defaults: string[] }) {
  const [list, setList] = useState<string[]>(defaults.length ? defaults : [""]);
  return (
    <div className="space-y-2">
      {list.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="inp flex-1" name="images" value={v} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Link ảnh ${i + 1} (https://...)`} />
          {v ? <img src={v} alt="" className="h-9 w-9 rounded-lg object-cover" /> : null}
          <button type="button" className="btn-ghost btn-sm !px-2.5 !py-1.5 !text-rose-600" onClick={() => setList((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : [""]))}>Xoá</button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={() => setList((l) => [...l, ""])}>+ Thêm ảnh</button>
      <p className="text-xs text-slate-400">Ảnh đầu tiên là ảnh bìa hiện ở danh sách.</p>
    </div>
  );
}

/** Gallery trang chi tiết: ảnh lớn + hàng ảnh nhỏ để chọn. */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) return null;
  const cur = images[Math.min(active, images.length - 1)];
  return (
    <div className="mb-5">
      <img src={cur} alt={name} className="aspect-[16/9] w-full rounded-3xl border border-slate-200 object-cover" />
      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <button key={i} type="button" onClick={() => setActive(i)} className={`overflow-hidden rounded-xl border-2 ${i === active ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100"}`}>
              <img src={src} alt="" className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
