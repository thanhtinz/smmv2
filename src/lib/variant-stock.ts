import { prisma } from "@/lib/db";

/**
 * Kho + loại giao hàng theo GÓI Premium (lệnh Tín 2026-11-07 23:34 + 2 sửa đổi):
 *  - Mỗi gói có LOẠI GIAO HÀNG: Giao nhanh (FAST) / Giao chậm (SLOW). Gói chưa
 *    đặt riêng thì suy từ hình thức giao của sản phẩm (AUTO_STOCK/API -> nhanh,
 *    MANUAL -> chậm); admin ghi đè từng gói trong trình sửa gói.
 *  - KHO có 3 chế độ cùng tồn tại: AUTO_STOCK theo dõi bằng dòng PremiumStock
 *    (kho item); MANUAL và API theo dõi bằng stockQty trên gói (null = không
 *    theo dõi/không giới hạn) — với API, stockQty là NẮP KHO của shop chồng
 *    lên provider. outOfStock là cờ chặn bán tay cho gói MANUAL/API.
 *  - Trừ kho NGUYÊN TỬ trong cùng transaction với tiền (updateMany có điều
 *    kiện stockQty >= số lượng) nên không bao giờ bán vượt; hoàn/huỷ TRƯỚC
 *    khi giao thì cộng trả.
 */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type DeliveryType = "FAST" | "SLOW";

export function resolveDeliveryType(deliveryType: string | null | undefined, fulfillment: string): DeliveryType {
  if (deliveryType === "FAST" || deliveryType === "SLOW") return deliveryType;
  return fulfillment === "MANUAL" ? "SLOW" : "FAST";
}

/** Gói có theo dõi kho bằng số lượng không (MANUAL/API + stockQty khác null). */
export function isQtyTracked(fulfillment: string, stockQty: number | null | undefined): boolean {
  return fulfillment !== "AUTO_STOCK" && stockQty != null;
}

/** Gói còn đặt được không — phía hiển thị và chốt chặn sớm phía máy chủ.
 *  AUTO_STOCK giữ hành vi cũ: kho item rỗng vẫn đặt được (chờ giao tay). */
export function variantSoldOut(v: { outOfStock: boolean; stockQty: number | null }, fulfillment: string): boolean {
  if (fulfillment === "AUTO_STOCK") return false;
  if (v.outOfStock) return true;
  return v.stockQty != null && v.stockQty <= 0;
}

export const OUT_OF_STOCK_ERROR = "Gói đã hết hàng";

/** Trừ kho nguyên tử trong transaction đặt đơn: chỉ trừ khi còn đủ
 *  (stockQty >= qty) — hai đơn đồng thời không thể cùng lấy phần kho cuối.
 *  Gói không theo dõi số lượng: không làm gì. Thiếu kho -> ném lỗi hết hàng,
 *  toàn bộ transaction (tiền + đơn) rollback theo. */
export async function claimVariantStock(tx: Tx, variant: { id: number; stockQty: number | null }, fulfillment: string, qty: number): Promise<void> {
  if (!isQtyTracked(fulfillment, variant.stockQty)) return;
  const claimed = await tx.premiumVariant.updateMany({
    where: { id: variant.id, stockQty: { gte: qty } },
    data: { stockQty: { decrement: qty } },
  });
  if (claimed.count === 0) throw new Error(OUT_OF_STOCK_ERROR);
}

/** Cộng trả kho cho gói theo dõi số lượng (hoàn/huỷ trước khi giao). Gói
 *  không theo dõi (stockQty null) hoặc AUTO_STOCK: updateMany tự trượt. */
export async function restoreVariantStock(tx: Tx, variantId: number, qty: number): Promise<void> {
  if (qty <= 0) return;
  await tx.premiumVariant.updateMany({
    where: { id: variantId, stockQty: { not: null } },
    data: { stockQty: { increment: qty } },
  });
}
