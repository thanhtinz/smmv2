"use server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createPremiumOrder } from "@/lib/orders";

/** Thanh toán giỏ hàng (Workstream D): chạy TỪNG dòng qua createPremiumOrder —
 *  cùng một máy tiền/flash/mã giảm giá/giao API như mua lẻ, không nhân bản logic.
 *  Mỗi dòng độc lập: dòng thành công có mã đơn riêng, dòng lỗi giữ nguyên trong
 *  giỏ kèm lý do để khách sửa rồi thanh toán lại (không trừ tiền hai lần vì
 *  createPremiumOrder chốt nguyên tử theo từng đơn). */
export type CartLineInput = {
  variantId: number;
  qty: number;
  custom: Record<string, string>;
  buyerInfo?: string | null;
};
export type CartLineResult = { variantId: number; ok: boolean; code?: string; error?: string };

/** "Cập nhật giá" ở giỏ hàng: đọc lại giá + tồn kho hiện tại của từng gói từ
 *  máy chủ để giỏ khớp thực tế (giá đổi, kho đổi, gói ngưng bán -> gone). */
export type CartPriceInfo = { variantId: number; price: number; stockCap: number | null; productName: string; variantName: string; gone: boolean };
export async function refreshCartPricesAction(variantIds: number[]): Promise<CartPriceInfo[]> {
  const ids = Array.from(new Set(variantIds.map((x) => Math.floor(x)).filter((x) => x > 0))).slice(0, 50);
  if (!ids.length) return [];
  const variants = await prisma.premiumVariant.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, price: true, active: true, stockQty: true, outOfStock: true, product: { select: { name: true, active: true, fulfillment: true } } },
  });
  const autoIds = variants.filter((v) => v.product.fulfillment === "AUTO_STOCK").map((v) => v.id);
  const counts = autoIds.length ? await prisma.premiumStock.groupBy({ by: ["variantId"], where: { variantId: { in: autoIds }, status: "AVAILABLE" }, _count: { _all: true } }) : [];
  const countMap = new Map(counts.map((c) => [c.variantId, c._count._all]));
  const byId = new Map(variants.map((v) => [v.id, v]));
  return ids.map((id) => {
    const v = byId.get(id);
    if (!v || !v.active || !v.product.active) return { variantId: id, price: 0, stockCap: null, productName: "", variantName: "", gone: true };
    const stockCap = v.product.fulfillment === "AUTO_STOCK" ? (countMap.get(id) || 0) : (v.stockQty ?? null);
    return { variantId: id, price: v.price, stockCap, productName: v.product.name, variantName: v.name, gone: false };
  });
}

export async function checkoutCartAction(lines: CartLineInput[], promoCode: string): Promise<{ needLogin?: boolean; results: CartLineResult[] }> {
  const user = await getCurrentUser();
  if (!user) return { needLogin: true, results: [] };
  const results: CartLineResult[] = [];
  const promo = (promoCode || "").trim().toUpperCase() || undefined;
  for (const line of lines.slice(0, 50)) {
    try {
      const variant = await prisma.premiumVariant.findUnique({ where: { id: line.variantId }, select: { providerGroup: true } });
      if (!variant) throw new Error("Gói không tồn tại hoặc đã ngưng bán");
      // Đơn Telegram theo người nhận — không thanh toán qua giỏ
      if ((variant.providerGroup || "").startsWith("telegram_")) throw new Error("Sản phẩm Telegram đặt riêng ở mục Telegram Premium");
      const order: any = await createPremiumOrder({
        user,
        variantId: line.variantId,
        quantity: Math.max(1, Math.floor(line.qty) || 1),
        customData: line.custom && Object.keys(line.custom).length ? line.custom : undefined,
        buyerInfo: line.buyerInfo || undefined,
        promoCode: promo,
      });
      results.push({ variantId: line.variantId, ok: true, code: order?.code });
    } catch (e: any) {
      let msg = String(e?.message || "Đặt đơn thất bại");
      if (/FZR|provider|nhà cung cấp/i.test(msg)) msg = "Dịch vụ tạm gián đoạn, vui lòng thử lại sau";
      results.push({ variantId: line.variantId, ok: false, error: msg.slice(0, 200) });
    }
  }
  return { results };
}
