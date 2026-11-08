import { prisma } from "./db";

/** Flash sale: giảm THÊM % trên giá trong khung giờ, theo PHẠM VI (scope):
 *  "SMM" = chỉ dịch vụ SMM (mặc định — hành vi cũ), "PREMIUM" = chỉ sản phẩm
 *  Premium, "ALL" = cả hai. Quy tắc chọn đợt (bắt chước nguyên phía SMM):
 *  trong các đợt đang chạy của site mà phạm vi bao phủ loại đơn này, chỉ lấy
 *  MỘT đợt % CAO NHẤT (không cộng dồn nhiều đợt); serviceIds/productIds
 *  null/rỗng = áp toàn bộ. Giá được áp tại createSmmOrder/createPremiumOrder
 *  (server) + hiển thị ở bảng giá/API/form để nhất quán. */

export type FlashSaleRow = { id: number; name: string; percent: number; startsAt: Date; endsAt: Date; scope: string; serviceIds: string | null; productIds: string | null; panelId: number | null };
export type FlashKind = "SMM" | "PREMIUM";

export async function getActiveFlashSale(kind?: FlashKind): Promise<FlashSaleRow | null> {
  try {
    const now = new Date();
    const sale = await prisma.flashSale.findFirst({
      where: {
        panelId: null, active: true, startsAt: { lte: now }, endsAt: { gte: now },
        ...(kind ? { scope: { in: [kind, "ALL"] } } : {}),
      },
      orderBy: { percent: "desc" },
    });
    return sale as FlashSaleRow | null;
  } catch {
    return null;
  }
}

function idsInclude(json: string | null, id: number): boolean {
  if (!json || !json.trim()) return true;
  try {
    const ids = JSON.parse(json) as number[];
    return !Array.isArray(ids) || ids.length === 0 || ids.includes(id);
  } catch {
    return true;
  }
}

export function flashAppliesTo(sale: FlashSaleRow | null, serviceId: number): boolean {
  if (!sale) return false;
  return idsInclude(sale.serviceIds, serviceId);
}

export function flashAppliesToProduct(sale: FlashSaleRow | null, productId: number): boolean {
  if (!sale) return false;
  return idsInclude(sale.productIds, productId);
}

export async function flashPercentFor(serviceId: number): Promise<number> {
  const sale = await getActiveFlashSale("SMM");
  return flashAppliesTo(sale, serviceId) ? sale!.percent : 0;
}

export async function flashPercentForProduct(productId: number): Promise<number> {
  const sale = await getActiveFlashSale("PREMIUM");
  return flashAppliesToProduct(sale, productId) ? sale!.percent : 0;
}

export function applyFlashAmount(amount: number, percent: number): number {
  if (!percent || percent <= 0) return amount;
  return Math.max(1, Math.round(amount * (1 - Math.min(90, percent) / 100)));
}
