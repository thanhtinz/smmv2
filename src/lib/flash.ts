import { prisma } from "./db";

/** Flash sale (đợt bổ sung): giảm THÊM % trên giá dịch vụ SMM trong khung giờ.
 *  Mỗi site một chương trình riêng: panelId null = web mẹ, có giá trị = panel đó.
 *  Giá được áp tại createSmmOrder (server) + hiển thị ở bảng giá/API để nhất quán. */

export type FlashSaleRow = { id: number; name: string; percent: number; startsAt: Date; endsAt: Date; serviceIds: string | null; panelId: number | null };

export async function getActiveFlashSale(panelId: number | null): Promise<FlashSaleRow | null> {
  try {
    const now = new Date();
    const sale = await prisma.flashSale.findFirst({
      where: { panelId: panelId ?? null, active: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { percent: "desc" },
    });
    return sale as FlashSaleRow | null;
  } catch {
    return null;
  }
}

export function flashAppliesTo(sale: FlashSaleRow | null, serviceId: number): boolean {
  if (!sale) return false;
  if (!sale.serviceIds || !sale.serviceIds.trim()) return true;
  try {
    const ids = JSON.parse(sale.serviceIds) as number[];
    return !Array.isArray(ids) || ids.length === 0 || ids.includes(serviceId);
  } catch {
    return true;
  }
}

export async function flashPercentFor(serviceId: number, panelId: number | null): Promise<number> {
  const sale = await getActiveFlashSale(panelId);
  return flashAppliesTo(sale, serviceId) ? sale!.percent : 0;
}

export function applyFlashAmount(amount: number, percent: number): number {
  if (!percent || percent <= 0) return amount;
  return Math.max(1, Math.round(amount * (1 - Math.min(90, percent) / 100)));
}
