"use client";
import { useEffect, useState } from "react";

/** Banner flash sale cho khách: tên chương trình + % giảm + đếm ngược tới giờ kết thúc. */
export function FlashCountdown({ name, percent, endsAt }: { name: string; percent: number; endsAt: string }) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) { setLeft(""); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      setLeft(`${h > 0 ? `${h} giờ ` : ""}${m} phút ${sec} giây`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-3.5 text-white shadow-sm">
      <span className="font-black uppercase tracking-wide">Flash Sale</span>
      <span className="font-semibold">{name} — giảm thêm {percent}% giá dịch vụ</span>
      {left && <span className="ml-auto text-sm font-semibold text-white/90">Kết thúc sau {left}</span>}
    </div>
  );
}
