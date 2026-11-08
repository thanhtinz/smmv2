"use client";
import { useEffect, useState } from "react";

/** "Đã xem gần đây": ghi nhận sản phẩm Premium khi khách mở trang chi tiết,
 *  lưu localStorage (tối đa 12, mới nhất trước, không trùng). Trang chủ đọc
 *  lại danh sách này và dựng thẻ bằng dữ liệu server mới nhất theo productId. */
export type RecentItem = {
  productId: number;
  slug: string;
  name: string;
  price: number;
  image: string | null;
};

const KEY = "smmv2-recent-v1";

export function RecordRecentView({ item }: { item: RecentItem }) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: RecentItem[] = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr.filter((x) => x && typeof x.productId === "number") : [];
      const next = [item, ...list.filter((x) => x.productId !== item.productId)].slice(0, 12);
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch { /* localStorage hỏng thì bỏ qua */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.productId]);
  return null;
}

export function useRecentItems(): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setItems(arr.filter((x) => x && typeof x.productId === "number"));
    } catch { /* bỏ qua */ }
  }, []);
  return items;
}
