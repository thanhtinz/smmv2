"use client";
import { useState } from "react";

/** Tab Kiếm tiền (Người đã giới thiệu | Lịch sử hoa hồng) chuyển TẠI CHỖ — dữ liệu
 *  cả 2 tab vốn đã được server tải sẵn, chỉ đổi hiển thị + đồng bộ ?tab= bằng
 *  replaceState, không tải lại trang như Link ?tab= trước đây. */
export function KiemTienTabs({ initial, refLabel, histLabel, refContent, histContent }: {
  initial: "ref" | "hist";
  refLabel: string;
  histLabel: string;
  refContent: React.ReactNode;
  histContent: React.ReactNode;
}) {
  const [tab, setTab] = useState(initial);
  const pick = (t: "ref" | "hist") => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      if (t === "ref") url.searchParams.delete("tab"); else url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };
  const cls = (active: boolean) => `rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`;
  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => pick("ref")} className={cls(tab === "ref")}>{refLabel}</button>
        <button type="button" onClick={() => pick("hist")} className={cls(tab === "hist")}>{histLabel}</button>
      </div>
      <div className={tab === "ref" ? "" : "hidden"}>{refContent}</div>
      <div className={tab === "hist" ? "" : "hidden"}>{histContent}</div>
    </div>
  );
}
