import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { alertMother } from "@/lib/alerts";

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
 *  toàn bộ transaction (tiền + đơn) rollback theo.
 *  Trả về {before, after} của tồn khi có trừ thật (đọc lại trong cùng
 *  transaction nên chính xác: before = after + qty) — orders.ts dùng để bắn
 *  cảnh báo kho SAU khi transaction chốt; gói không theo dõi -> null. */
export async function claimVariantStock(tx: Tx, variant: { id: number; stockQty: number | null }, fulfillment: string, qty: number): Promise<{ before: number; after: number } | null> {
  if (!isQtyTracked(fulfillment, variant.stockQty)) return null;
  const claimed = await tx.premiumVariant.updateMany({
    where: { id: variant.id, stockQty: { gte: qty } },
    data: { stockQty: { decrement: qty } },
  });
  if (claimed.count === 0) throw new Error(OUT_OF_STOCK_ERROR);
  const row = await tx.premiumVariant.findUnique({ where: { id: variant.id }, select: { stockQty: true } });
  if (row?.stockQty == null) return null;
  return { before: row.stockQty + qty, after: row.stockQty };
}

/** Quyết định cảnh báo kho theo VƯỢT MỐC (đợt 111): tồn vừa chạm 0 -> "OUT";
 *  tồn vừa rơi từ trên ngưỡng xuống bằng/dưới ngưỡng sắp hết -> "LOW".
 *  Đã ở dưới mốc từ trước thì không bắn lại; ngưỡng 0 = tắt cảnh báo LOW.
 *  Hàm thuần — không đọc DB, để test trực tiếp. */
export function stockCrossing(before: number, after: number, lowThreshold: number): "OUT" | "LOW" | null {
  if (after >= before || before <= 0) return null; // chỉ xét lần trừ làm tồn giảm thật
  if (after <= 0) return "OUT";
  if (lowThreshold > 0 && before > lowThreshold && after <= lowThreshold) return "LOW";
  return null;
}

/** Bắn cảnh báo sự kiện "stock" nếu lần trừ kho vừa vượt mốc. Hai cơ chế tồn
 *  admin nhìn thấy đều đi qua đây: stockQty của gói MANUAL/API (trừ tại
 *  claimVariantStock) và số dòng AVAILABLE của kho AUTO_STOCK (trừ tại
 *  createPremiumOrder) — móc quyết định chỉ nằm 1 chỗ này, nơi gọi chỉ việc
 *  báo before/after thật. Best-effort: lỗi gửi tin không ảnh hưởng đơn. */
export async function notifyStockCrossing(info: { productName: string; variantName: string; before: number; after: number }): Promise<void> {
  try {
    const s = await getSettings();
    const th = parseInt(s.alert_stock_low_threshold || "5");
    const kind = stockCrossing(info.before, info.after, Number.isFinite(th) && th > 0 ? th : 0);
    if (!kind) return;
    const title = kind === "OUT"
      ? `Hết kho: ${info.productName} — ${info.variantName}`
      : `Sắp hết kho: ${info.productName} — ${info.variantName}`;
    const text = [
      `Sản phẩm: ${info.productName}`,
      `Gói: ${info.variantName}`,
      kind === "OUT" ? "Tồn kho đã chạm 0 — gói đang hết hàng, cần nạp thêm kho." : `Tồn kho còn lại: ${info.after} (ngưỡng cảnh báo: ${th})`,
      `Quản lý sản phẩm: /admin/premium?q=${encodeURIComponent(info.productName)}`,
    ].join("\n");
    await alertMother("stock", title, text);
  } catch {}
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
