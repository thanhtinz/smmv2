"use client";
import { useState } from "react";

/** Tab Hồ sơ chuyển TẠI CHỖ (không tải lại trang) + đồng bộ ?tab= bằng replaceState
 *  để F5/chia sẻ link vẫn mở đúng tab. Nội dung 3 tab do server render rồi truyền vào. */
export function ProfileTabs({ initial, labels, profile, api, security }: {
  initial: "profile" | "api" | "security";
  labels: { profile: string; api: string; security: string };
  profile: React.ReactNode;
  api: React.ReactNode;
  security: React.ReactNode;
}) {
  const [tab, setTab] = useState(initial);
  const pick = (t: "profile" | "api" | "security") => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      if (t === "profile") url.searchParams.delete("tab"); else url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };
  const tabs = [
    { id: "profile" as const, label: labels.profile },
    { id: "api" as const, label: labels.api },
    { id: "security" as const, label: labels.security },
  ];
  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => pick(t.id)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>
        ))}
      </div>
      <div className={tab === "profile" ? "" : "hidden"}>{profile}</div>
      <div className={tab === "api" ? "" : "hidden"}>{api}</div>
      <div className={tab === "security" ? "" : "hidden"}>{security}</div>
    </div>
  );
}
