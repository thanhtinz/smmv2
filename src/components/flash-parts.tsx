"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/components/lang";

/** Banner flash sale cho khách: tên chương trình + % giảm + đếm ngược tới giờ kết thúc. */
export function FlashCountdown({ name, percent, endsAt }: { name: string; percent: number; endsAt: string }) {
  const { t, td } = useLang();
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) { setLeft(""); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      setLeft((h > 0 ? h + t(" giờ ") : "") + m + t(" phút ") + sec + t(" giây"));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-3.5 text-white shadow-sm">
      <span className="font-black uppercase tracking-wide">{t("Giảm giá chớp nhoáng")}</span>
      <span className="font-semibold">{name}{t(" — giảm thêm ")}{percent}{t("% giá dịch vụ")}</span>
      {left && <span className="ml-auto text-sm font-semibold text-white/90">{t("Kết thúc sau ")}{left}</span>}
    </div>
  );
}
