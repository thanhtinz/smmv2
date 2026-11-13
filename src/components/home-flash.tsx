"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PremiumCard, type PremiumCardData } from "@/components/premium-card";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

type Parts = { d: number; h: number; m: number; s: number };

function partsLeft(endsAt: string): Parts | null {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** Khung FLASH SALE trang chủ (lệnh Tín 2026-11-12, mockup đã duyệt): nằm
 *  ngay dưới dải icon lối tắt, trên khối Danh mục. Dải đầu gradient đỏ→cam
 *  như banner flash sẵn có (flash-parts): tia sét + tên đợt + % giảm, ô số
 *  đếm ngược tới endsAt THẬT của đợt (thêm ô Ngày khi còn >24 giờ), nút
 *  trượt trên desktop và "Xem tất cả" → /premium. Thân là ray trượt ngang
 *  thẻ PremiumCard nguyên bản. Trang chủ chỉ render component này khi có
 *  đợt phạm vi PREMIUM/ALL đang chạy VÀ có sản phẩm thật được giảm giá;
 *  đợt kết thúc trong lúc trang đang mở thì khung tự biến mất. KHÔNG có
 *  thanh tiến độ "đã bán" — hệ thống không có hạn mức/số bán theo đợt. */
export function HomeFlashSale({ name, percent, endsAt, items }: { name: string; percent: number; endsAt: string; items: PremiumCardData[] }) {
  const { t } = useLang();
  const [parts, setParts] = useState<Parts | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMounted(true);
    setParts(partsLeft(endsAt));
    const timer = setInterval(() => setParts(partsLeft(endsAt)), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  if (items.length === 0) return null;
  if (mounted && !parts) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const boxes = parts ? (parts.d > 0 ? [parts.d, parts.h, parts.m, parts.s] : [parts.h, parts.m, parts.s]) : [0, 0, 0];
  const scroll = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * el.clientWidth * 0.8, behavior: "smooth" }); };
  const chevBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/50 text-white transition hover:bg-white/20";
  return (
    <section data-home-flash className="mt-8 overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-gradient-to-r from-rose-600 to-orange-500 px-4 py-4 text-white sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 [&>svg]:h-6 [&>svg]:w-6">{I.zap}</span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black uppercase tracking-wide sm:text-xl">{t("Giảm giá chớp nhoáng")}</h2>
            <p className="truncate text-[13px] font-semibold text-white/90">{name}{t(" — giảm thêm ")}{percent}%</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 sm:gap-3.5">
          <span className="hidden text-sm font-semibold text-white/90 md:inline">{t("Kết thúc sau")}</span>
          <span className="flex items-center gap-1" role="timer" aria-label={t("Kết thúc sau")}>
            {boxes.map((v, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="font-extrabold text-white/80">:</span>}
                <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-black/25 px-1 text-[15px] font-extrabold tabular-nums">{mounted && parts ? pad(v) : "--"}</span>
              </span>
            ))}
          </span>
          <span className="hidden gap-2 sm:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label={t("Trang trước")} title={t("Trang trước")} className={chevBtn}>
              <span className="[&>svg]:h-4 [&>svg]:w-4 rotate-90">{I.chevron}</span>
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label={t("Trang sau")} title={t("Trang sau")} className={chevBtn}>
              <span className="[&>svg]:h-4 [&>svg]:w-4 -rotate-90">{I.chevron}</span>
            </button>
          </span>
          <Link href="/premium" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-white hover:underline">{t("Xem tất cả")}<span className="[&_svg]:h-4 [&_svg]:w-4">{I.arrowRight}</span></Link>
        </div>
      </div>
      <div ref={ref} className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5 sm:p-5">
        {items.map((item) => (
          <PremiumCard key={item.slug} item={item} base="/premium" className="w-[47%] shrink-0 snap-start sm:w-[31.5%] lg:w-[23.8%]" />
        ))}
      </div>
    </section>
  );
}
