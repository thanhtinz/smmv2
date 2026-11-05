"use client";
import { useState, type ReactNode } from "react";

/** Thanh tab kiểu panel mẫu: hàng ngang cuộn được, tab đang chọn chữ xanh + gạch chân xanh. */
export default function SettingsTabs({ tabs }: { tabs: { id: string; label: string; icon?: ReactNode; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${active === t.id ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "space-y-6" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
