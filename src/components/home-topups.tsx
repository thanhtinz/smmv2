"use client";
import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

export type HomeTopup = {
  productId: number;
  name: string;
  image: string | null;
  color: string;
  sold: number;
  rating: number; // điểm trung bình 0..5 (0 khi chưa có đánh giá)
  reviewCount: number;
};

const STEP = 10;

/** Mục "Top-Up Game" trên trang chủ (lệnh Tín 2026-11-12 21:01, kèm ảnh
 *  mẫu): NGAY DƯỚI khối Danh mục, TRÊN mục Sản phẩm nổi bật. Lưới ô game:
 *  icon vuông bo góc (ảnh NCC của sản phẩm topups; thiếu ảnh thì ô chữ cái
 *  đầu như thẻ Premium) + tên 1 dòng cắt gọn + dòng meta Y HỆT thẻ sản
 *  phẩm (sao + điểm + (số đánh giá) chỉ khi có đánh giá thật, ngăn cách
 *  "|" rồi "Đã bán N" luôn hiện — cùng định nghĩa số với buildCardData).
 *  Pool do server chọn: game topups đang bán, BÁN CHẠY NHẤT trước, tối đa
 *  50; đầu hiện 10 ô, "Xem thêm" mở +10/lần (mẫu tương tác của mục Steam
 *  Gift Games). Ô tìm ở hàng tiêu đề là form GET sang trang danh sách
 *  Top-Up với tham số ?q= mà trang đó đang đọc. Không có game nào thì mục
 *  không render. Tiêu đề giữ NGUYÊN chữ "Top-Up Game" ở cả VI lẫn EN
 *  (tên riêng của mục theo lệnh Tín — không qua từ điển, tránh bị dịch
 *  thành "Game Top-Up"). Huy hiệu góc icon trong ảnh mẫu là một phần của
 *  ảnh gốc của game — mục KHÔNG tự thêm huy hiệu nào. */
export function HomeTopupSection({ items }: { items: HomeTopup[] }) {
  const { t } = useLang();
  const [shown, setShown] = useState(STEP);
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{I.zap}</span>
          <h2 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl">Top-Up Game</h2>
        </div>
        <form action="/dashboard/top-up" method="get" className="relative w-full sm:w-64">
          <input
            name="q"
            type="search"
            placeholder={t("Tìm game…")}
            aria-label={t("Tìm game…")}
            className="h-10 w-full rounded-full border border-slate-300 bg-white pl-4 pr-11 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <button type="submit" aria-label={t("Tìm game…")} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-brand-600">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
          </button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {items.slice(0, shown).map((g) => (
          <Link key={g.productId} href={`/dashboard/top-up/${g.productId}`} className="group min-w-0">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-100">
              {g.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.image} alt={g.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${g.color}, rgb(var(--b500)))` }}>
                  <span className="text-4xl font-black text-white/90 sm:text-5xl">{g.name.charAt(0)}</span>
                </div>
              )}
            </div>
            <div className="mt-2 truncate text-sm font-bold text-slate-900 group-hover:text-brand-700" title={g.name}>{g.name}</div>
            {/* Dòng meta sao + đã bán — markup Y HỆT thẻ PremiumCard
                (lệnh Tín 2026-11-12): sao chỉ hiện khi có đánh giá thật,
                "Đã bán N" luôn hiện với số đơn thật (kể cả 0). */}
            <div className="mt-1 flex h-4 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs leading-4 text-slate-500">
              {g.reviewCount > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="#f59e0b"><path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" /></svg>
                  <b className="font-bold text-amber-500">{g.rating.toFixed(1)}</b>
                  <span>({g.reviewCount})</span>
                </span>
              )}
              {g.reviewCount > 0 && <span aria-hidden="true" className="shrink-0">|</span>}
              <span className="truncate">{t("Đã bán ")}{g.sold.toLocaleString("vi-VN")}</span>
            </div>
          </Link>
        ))}
      </div>
      {shown < items.length && (
        <div className="mt-6 text-center">
          <button type="button" onClick={() => setShown((n) => n + STEP)} className="rounded-full border border-slate-300 px-7 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            {t("Xem thêm")}
          </button>
        </div>
      )}
    </section>
  );
}
