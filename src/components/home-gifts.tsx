"use client";
import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { Stars } from "@/components/premium-card";

export type HomeGift = {
  productId: number;
  name: string;
  image: string | null;
  price: number;
  rating: number;
  reviewCount: number;
};

const STEP = 5;

/** Mục "Steam Gift Games" trên trang chủ (lệnh Tín 2026-11-08): khu Steam
 *  có mục riêng ngay dưới Sản phẩm nổi bật — hàng game theo cấu trúc ảnh
 *  mẫu (cover trái, tên, MỘT giá sạch, sao đánh giá THẬT khi có), cả hàng
 *  là link sang trang đặt gift với game đó được chọn sẵn. Hiện 5 game đầu,
 *  nút "Xem thêm" dưới danh sách mở thêm 5 game/lần trong tối đa 15 game
 *  mới nhất; "Xem tất cả" ở đầu mục sang trang Steam Gift Games. Không có
 *  game nào thì mục không render (trang chủ không hiện vỏ rỗng). */
export function HomeGiftSection({ gifts }: { gifts: HomeGift[] }) {
  const { t, m } = useLang();
  const [shown, setShown] = useState(STEP);
  if (gifts.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{I.gamepad}</span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl">Steam Gift Games</h2>
            <p className="mt-0.5 truncate text-[13px] text-slate-500">{t("Danh mục Steam Gift.")}</p>
          </div>
        </div>
        <Link href="/dashboard/steam/gift-games" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
          {t("Xem tất cả")}<span className="[&_svg]:h-4 [&_svg]:w-4">{I.arrowRight}</span>
        </Link>
      </div>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {gifts.slice(0, shown).map((g) => (
          <Link key={g.productId} href={`/dashboard/steam/gift-games?game=${g.productId}`} className="flex items-center gap-4 p-4 transition hover:bg-slate-50">
            {g.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.image} alt="" className="h-[68px] w-[120px] shrink-0 rounded-lg object-cover max-sm:h-14 max-sm:w-[92px]" loading="lazy" />
            ) : (
              <span className="flex h-[68px] w-[120px] shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white [&>svg]:h-7 [&>svg]:w-7 max-sm:h-14 max-sm:w-[92px]">{I.gamepad}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold text-slate-900">{g.name}</span>
              {g.price > 0 && <span className="mt-1 block font-extrabold text-rose-600">{m(g.price)}</span>}
              {g.reviewCount > 0 && (
                <span className="mt-1.5 flex items-center gap-1.5">
                  <Stars value={g.rating} className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold text-slate-500">{g.rating.toFixed(1)} ({g.reviewCount})</span>
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
      {shown < gifts.length && (
        <div className="mt-6 text-center">
          <button type="button" onClick={() => setShown((n) => n + STEP)} className="rounded-full border border-slate-300 px-7 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            {t("Xem thêm")}
          </button>
        </div>
      )}
    </section>
  );
}
