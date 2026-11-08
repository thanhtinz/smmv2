"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

/** Dải pill danh mục cuộn ngang CÓ GỢI Ý CUỘN (lệnh Tín 2026-11-08): hai
 *  nút chevron tròn ở hai đầu — bấm để cuộn một trang, mờ đi khi đã chạm
 *  đầu đó — cộng vệt mờ ở mép còn nội dung ẩn, để khách biết dải kéo qua
 *  được (kể cả trên cảm ứng, nơi thanh cuộn bị ẩn). Desktop (sm+) dải tự
 *  xuống hàng như cũ thì nút/vệt tự ẩn vì không còn gì để cuộn. */
export function PillStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanL(el.scrollLeft > 4);
      setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, []);
  const scroll = (d: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: d * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const btn = "absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition sm:hidden";
  return (
    <div className={`relative ${className}`}>
      <div ref={ref} className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible">
        {children}
      </div>
      {canL && <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent dark:from-[#101a2e] sm:hidden" />}
      {canR && <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent dark:from-[#101a2e] sm:hidden" />}
      <button type="button" aria-label={t("Trang trước")} onClick={() => scroll(-1)} disabled={!canL}
        className={`${btn} -left-1 ${canL ? "hover:bg-slate-50" : "opacity-30"}`}>
        <span className="rotate-90 [&>svg]:h-4 [&>svg]:w-4">{I.chevron}</span>
      </button>
      <button type="button" aria-label={t("Trang sau")} onClick={() => scroll(1)} disabled={!canR}
        className={`${btn} -right-1 ${canR ? "hover:bg-slate-50" : "opacity-30"}`}>
        <span className="-rotate-90 [&>svg]:h-4 [&>svg]:w-4">{I.chevron}</span>
      </button>
    </div>
  );
}
