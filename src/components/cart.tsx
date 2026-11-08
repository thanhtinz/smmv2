"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

/** Giỏ hàng Premium phía khách (Workstream D): lưu localStorage để khách vãng lai
 *  cũng dùng được; thanh toán yêu cầu đăng nhập và chạy qua createPremiumOrder
 *  phía máy chủ (tiền ví, flash, mã giảm giá, giao hàng API — không nhân bản logic). */
export type CartItem = {
  variantId: number;
  productId: number;
  productName: string;
  variantName: string;
  image: string | null;
  price: number; // giá hiển thị tại thời điểm thêm (máy chủ chốt lại khi thanh toán)
  qty: number;
  custom: Record<string, string>;
  buyerInfo?: string | null; // thông tin bàn giao tự do (sản phẩm không có trường tuỳ chỉnh)
  stockCap: number | null; // trần theo kho còn lại (AUTO_STOCK: số dòng kho; MANUAL/API: stockQty theo dõi); null = không trần kho
  delivery?: string | null; // FAST | SLOW — loại giao hàng của gói lúc thêm vào giỏ
  group: string | null; // providerGroup (telegram_* không bao giờ vào giỏ)
};

const KEY = "smmv2-cart-v1";
let items: CartItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) items = arr.filter((x) => x && typeof x.variantId === "number");
    }
  } catch { /* giỏ hỏng thì bắt đầu rỗng */ }
}
function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* bỏ qua */ }
}
function emit() { save(); listeners.forEach((f) => f()); }
function subscribe(f: () => void) {
  listeners.add(f);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { loaded = false; load(); f(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(f); window.removeEventListener("storage", onStorage); };
}
function snapshot(): CartItem[] { load(); return items; }
const EMPTY: CartItem[] = [];
function serverSnapshot(): CartItem[] { return EMPTY; }

export function useCartItems(): CartItem[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
export function useCartCount(): number {
  const list = useCartItems();
  return list.reduce((a, x) => a + x.qty, 0);
}

const lineKey = (x: { custom: Record<string, string>; buyerInfo?: string | null }) => JSON.stringify(x.custom) + "|" + (x.buyerInfo || "");
const sameCustom = (a: CartItem, b: { custom: Record<string, string>; buyerInfo?: string | null }) => lineKey(a) === lineKey(b);

export function addToCart(item: Omit<CartItem, "qty"> & { qty?: number }) {
  load();
  const qty = Math.max(1, item.qty || 1);
  const idx = items.findIndex((x) => x.variantId === item.variantId && sameCustom(x, item));
  if (idx >= 0) {
    const cap = items[idx].stockCap;
    items = items.map((x, i) => (i === idx ? { ...x, qty: cap ? Math.min(cap, x.qty + qty) : x.qty + qty, price: item.price } : x));
  } else {
    items = [...items, { ...item, qty: item.stockCap ? Math.min(item.stockCap, qty) : qty }];
  }
  emit();
}
export function setCartQty(variantId: number, custom: Record<string, string>, qty: number, buyerInfo?: string | null) {
  load();
  items = items.map((x) => (x.variantId === variantId && sameCustom(x, { custom, buyerInfo }) ? { ...x, qty: Math.max(1, x.stockCap ? Math.min(x.stockCap, qty) : qty) } : x));
  emit();
}
export function removeCartLine(variantId: number, custom: Record<string, string>, buyerInfo?: string | null) {
  load();
  items = items.filter((x) => !(x.variantId === variantId && sameCustom(x, { custom, buyerInfo })));
  emit();
}
export function updateCartLine(variantId: number, key: { custom: Record<string, string>; buyerInfo?: string | null }, patch: { custom?: Record<string, string>; buyerInfo?: string | null }) {
  load();
  items = items.map((x) => (x.variantId === variantId && sameCustom(x, key) ? { ...x, ...(patch.custom ? { custom: patch.custom } : {}), ...(patch.buyerInfo !== undefined ? { buyerInfo: patch.buyerInfo } : {}) } : x));
  emit();
}
export function clearCart() { load(); items = []; emit(); }
/** Vá giá/trần kho/tên cho một dòng (nút "Cập nhật giá" ở giỏ): không đổi
 *  định danh dòng (variantId + custom + buyerInfo giữ nguyên). */
export function patchCartLine(variantId: number, key: { custom: Record<string, string>; buyerInfo?: string | null }, patch: { price?: number; stockCap?: number | null; productName?: string; variantName?: string }) {
  load();
  items = items.map((x) => {
    if (x.variantId !== variantId || !sameCustom(x, key)) return x;
    const next = { ...x, ...(patch.price != null ? { price: patch.price } : {}), ...(patch.stockCap !== undefined ? { stockCap: patch.stockCap } : {}), ...(patch.productName ? { productName: patch.productName } : {}), ...(patch.variantName ? { variantName: patch.variantName } : {}) };
    if (next.stockCap != null && next.stockCap > 0 && next.qty > next.stockCap) next.qty = next.stockCap;
    return next;
  });
  emit();
}

/** Nút thêm vào giỏ dùng ở thẻ sản phẩm và trang chi tiết. */
export function AddToCartBtn({ data, square, className = "" }: {
  data: Omit<CartItem, "qty"> & { qty?: number };
  square?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const [added, setAdded] = useState(false);
  useEffect(() => { if (!added) return; const id = setTimeout(() => setAdded(false), 1400); return () => clearTimeout(id); }, [added]);
  return (
    <button
      type="button"
      aria-label={t("Thêm vào giỏ")}
      title={t("Thêm vào giỏ")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCart(data); setAdded(true); }}
      className={square
        ? `flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border-2 transition ${added ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-slate-300 text-slate-600 hover:border-brand-500 hover:text-brand-600"} ${className}`
        : `inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-bold text-white transition ${added ? "bg-emerald-600" : "bg-brand-600 hover:bg-brand-500"} ${className}`}
    >
      {added ? I.check : I.cart}
      {!square && <span className="ml-1.5">{added ? t("Đã thêm") : t("Thêm vào giỏ")}</span>}
    </button>
  );
}

/** Icon giỏ hàng + huy hiệu số lượng cho header (cửa hàng công khai + khu khách). */
export function CartHeaderLink({ dark }: { dark?: boolean }) {
  const count = useCartCount();
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Link href="/gio-hang" aria-label={t("Giỏ hàng")} className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full transition ${dark ? "text-slate-200 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}>
      {I.cart}
      {mounted && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white">{count}</span>
      )}
    </Link>
  );
}
