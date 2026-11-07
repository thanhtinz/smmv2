"use client";
import { useState } from "react";

/** Tab lọc đơn Premium chuyển TẠI CHỖ (không tải lại trang): nội dung từng tab do
 *  server render sẵn (mỗi tab tối đa 50 đơn như trước), đồng bộ ?tab= bằng
 *  replaceState để F5/chia sẻ link vẫn mở đúng tab. */
export function PremiumOrderTabs({ initial, tabs }: {
  initial: string;
  tabs: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [tab, setTab] = useState(initial);
  const pick = (k: string) => {
    setTab(k);
    try {
      const url = new URL(window.location.href);
      if (k === "all") url.searchParams.delete("tab"); else url.searchParams.set("tab", k);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => pick(t.key)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${t.key === tab ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className={t.key === tab ? "" : "hidden"}>{t.content}</div>
      ))}
    </div>
  );
}
