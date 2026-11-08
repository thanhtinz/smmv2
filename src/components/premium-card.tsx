"use client";
import Link from "next/link";
import { useLang } from "@/components/lang";
import { AddToCartBtn } from "@/components/cart";

/** Dữ liệu thẻ sản phẩm Premium (đã tính sẵn phía server: khoảng giá, đã bán, kho). */
export type PremiumCardData = {
  productId: number;
  slug: string;
  name: string;
  image: string | null;
  color: string;
  minPrice: number;
  maxPrice: number;
  sold: number;
  instant: boolean; // AUTO_STOCK — giao ngay từ kho
  hasStock: boolean;
  rating: number; // điểm trung bình 0..5 (0 khi chưa có đánh giá)
  reviewCount: number;
  flashPct: number; // % giảm flash sale đang áp cho sản phẩm (0 = không có)
  // Thêm thẳng vào giỏ được khi sản phẩm có đúng 1 gói, không trường bắt buộc
  // và không phải nhóm Telegram (đơn theo người nhận — không vào giỏ).
  cartVariant: { id: number; name: string; price: number; stock: number } | null;
};

/** Hàng 5 sao với phần tô theo điểm trung bình (dùng ở thẻ, hero chi tiết, mục đánh giá). */
export function Stars({ value, className = "h-4 w-4" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (filled: boolean) => (
    <span className="flex w-max gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={`${className} shrink-0`} fill={filled ? "#f59e0b" : "#cbd5e1"}><path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" /></svg>
      ))}
    </span>
  );
  return (
    <span className="relative inline-flex align-middle">
      {row(false)}
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>{row(true)}</span>
    </span>
  );
}

/** Thẻ sản phẩm Premium theo bố cục shopkey: ảnh 16:9, tên đậm, giá đỏ (một giá
 *  hoặc khoảng giá min ~ max, không có giá thì "Liên hệ"), dòng Đã bán + nhãn
 *  Giao ngay/Order ở đáy thẻ. Dùng cho lưới danh sách và sản phẩm liên quan. */
export function PremiumCard({ item, base, className = "" }: { item: PremiumCardData; base: string; className?: string }) {
  const { t, td, m } = useLang();
  const contact = item.minPrice <= 0;
  // Công thức flash phía client — khớp applyFlashAmount phía server (lib/flash).
  const flashPrice = (amount: number) =>
    item.flashPct > 0 && amount > 0 ? Math.max(1, Math.round(amount * (1 - Math.min(90, item.flashPct) / 100))) : amount;
  const range = (lo: number, hi: number) => (hi > lo ? `${m(lo)} ~ ${m(hi)}` : m(lo));
  return (
    <Link href={`${base}/${item.slug}`} className={`card group flex h-full flex-col overflow-hidden transition hover:shadow-lg ${className}`}>
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${item.color}, #0ea5e9)` }}>
            <span className="text-4xl font-black text-white/90 sm:text-5xl">{item.name.charAt(0)}</span>
          </div>
        )}
        {item.flashPct > 0 && !contact && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow">-{item.flashPct}%</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="line-clamp-2 min-h-[2.6em] text-[15px] font-bold leading-snug text-slate-900 group-hover:text-brand-700 sm:text-base">{item.name}</div>
        <div className="mt-2 text-[15px] font-extrabold leading-tight text-rose-600 sm:text-[17px]">
          {contact ? t("Liên hệ") : range(flashPrice(item.minPrice), flashPrice(item.maxPrice))}
        </div>
        {item.flashPct > 0 && !contact && (
          <div className="mt-0.5 text-xs font-medium text-slate-400 line-through">{range(item.minPrice, item.maxPrice)}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {item.reviewCount > 0 && <span className="inline-flex items-center gap-1.5"><Stars value={item.rating} className="h-3.5 w-3.5" /><b className="text-slate-700">{item.rating.toFixed(1)}</b>({item.reviewCount})</span>}
          {item.sold > 0 && <span>{t("Đã bán ")}{item.sold.toLocaleString("vi-VN")}</span>}
          {item.instant && item.hasStock && (
            <span className="inline-flex items-center gap-1 font-bold text-teal-600">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" /></svg>
              {t("Giao ngay")}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {contact ? (
            <span className="inline-block rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-bold text-white">{t("Đặt mua")}</span>
          ) : item.cartVariant ? (
            <>
              <span className="text-[13px] font-bold text-teal-700">{t("Đặt mua")}</span>
              <AddToCartBtn data={{ variantId: item.cartVariant.id, productId: item.productId, productName: item.name, variantName: item.cartVariant.name, image: item.image, price: item.cartVariant.price, stockCap: item.instant ? item.cartVariant.stock : null, group: null, custom: {} }} />
            </>
          ) : !item.instant || !item.hasStock ? (
            <span className="text-[13px] font-bold text-teal-700">{t("Đặt mua")}</span>
          ) : (
            <span className="text-[13px] font-bold text-teal-700">{t("Chọn gói")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
