"use client";
import { useState } from "react";

/** Tab admin chuyển TẠI CHỖ (không tải lại trang) theo đúng khuôn
 *  profile-tabs.tsx: nội dung mọi tab do server render rồi truyền vào,
 *  tab đang chọn đồng bộ vào ?tab= bằng replaceState để F5/chia sẻ link
 *  vẫn mở đúng tab. Trang cha nên truyền key theo tab khởi tạo để lần
 *  điều hướng máy chủ (vd lật trang trong tab) dựng lại đúng tab. */
export function AdminFamilyTabs({ initial, tabs }: {
  initial: string;
  tabs: { id: string; label: string; content: React.ReactNode }[];
}) {
  const [tab, setTab] = useState(initial);
  const pick = (id: string) => {
    setTab(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => pick(t.id)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={tab === t.id ? "" : "hidden"}>{t.content}</div>
      ))}
    </div>
  );
}
