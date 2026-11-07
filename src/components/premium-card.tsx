import Link from "next/link";
import { vnd } from "@/lib/format";

/** Dữ liệu thẻ sản phẩm Premium (đã tính sẵn phía server: khoảng giá, đã bán, kho). */
export type PremiumCardData = {
  slug: string;
  name: string;
  image: string | null;
  color: string;
  minPrice: number;
  maxPrice: number;
  sold: number;
  instant: boolean; // AUTO_STOCK — giao ngay từ kho
  hasStock: boolean;
};

/** Thẻ sản phẩm Premium theo bố cục shopkey: ảnh 16:9, tên đậm, giá đỏ (một giá
 *  hoặc khoảng giá min ~ max, không có giá thì "Liên hệ"), dòng Đã bán + nhãn
 *  Giao ngay/Order ở đáy thẻ. Dùng cho lưới danh sách và sản phẩm liên quan. */
export function PremiumCard({ item, base }: { item: PremiumCardData; base: string }) {
  const contact = item.minPrice <= 0;
  return (
    <Link href={`${base}/${item.slug}`} className="card group flex flex-col overflow-hidden transition hover:shadow-lg">
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${item.color}, #0ea5e9)` }}>
            <span className="text-5xl font-black text-white/90">{item.name.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="line-clamp-2 min-h-[2.6em] font-bold leading-snug text-slate-900 group-hover:text-brand-700">{item.name}</div>
        <div className="mt-2 text-[17px] font-extrabold text-rose-600">
          {contact ? "Liên hệ" : item.maxPrice > item.minPrice ? `${vnd(item.minPrice)} ~ ${vnd(item.maxPrice)}` : vnd(item.minPrice)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {item.sold > 0 && <span>Đã bán {item.sold.toLocaleString("vi-VN")}</span>}
          {item.instant && item.hasStock && (
            <span className="inline-flex items-center gap-1 font-bold text-teal-600">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" /></svg>
              Giao ngay
            </span>
          )}
        </div>
        <div className="mt-auto pt-3">
          {contact ? (
            <span className="inline-block rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-bold text-white">Order</span>
          ) : !item.instant || !item.hasStock ? (
            <span className="text-[13px] font-bold text-teal-700">Order</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
