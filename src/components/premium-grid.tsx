"use client";
import { useState } from "react";
import { PremiumCard, type PremiumCardData } from "@/components/premium-card";

const PAGE = 12;

/** Lưới sản phẩm Premium: hiện 12 thẻ đầu, nút "Tải thêm sản phẩm" mở thêm
 *  từng đợt 12 — đúng nhịp trang danh sách của shopkey (không phân trang số). */
export function PremiumGrid({ items, base }: { items: PremiumCardData[]; base: string }) {
  const [shown, setShown] = useState(PAGE);
  const visible = items.slice(0, shown);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => (
          <PremiumCard key={item.slug} item={item} base={base} />
        ))}
      </div>
      {items.length === 0 && <p className="py-10 text-center text-slate-400">Chưa có sản phẩm nào phù hợp.</p>}
      {shown < items.length && (
        <div className="mt-8 text-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-ghost !px-6 !py-2.5 font-bold">
            Tải thêm sản phẩm
          </button>
        </div>
      )}
    </>
  );
}
