import { prisma } from "./db";
import { getSettings, DEFAULT_SETTINGS } from "./settings";

/** Flash sale: giảm THÊM % trên giá sản phẩm Premium trong khung giờ, theo
 *  PHẠM VI (scope): "PREMIUM" = chỉ sản phẩm Premium, "ALL" = mọi sản phẩm.
 *  (Phạm vi "SMM" đã gỡ cùng đợt gỡ SMM 2026-11-12 — đợt cũ ghi scope SMM
 *  trong DB không còn khớp điều kiện đọc nào nên không áp giá nữa.)
 *  Quy tắc chọn đợt: trong các đợt đang chạy của site mà phạm vi bao phủ,
 *  chỉ lấy MỘT đợt % CAO NHẤT (không cộng dồn nhiều đợt); productIds
 *  null/rỗng = áp toàn bộ. Giá được áp tại createPremiumOrder (server) +
 *  hiển thị ở thẻ sản phẩm/API/form để nhất quán. */

export type FlashSaleRow = { id: number; name: string; percent: number; startsAt: Date; endsAt: Date; scope: string; serviceIds: string | null; productIds: string | null; panelId: number | null };
export type FlashKind = "PREMIUM";

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
    if (!sale) return null;
    // Trần % giảm do admin đặt (setting flash_max_percent) — áp TẠI ĐÂY, điểm
    // đọc duy nhất, để mọi nơi tính tiền/hiển thị đều nhận % đã kẹp.
    const s = await getSettings();
    const raw = parseInt(s.flash_max_percent || "");
    const cap = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : parseInt(DEFAULT_SETTINGS.flash_max_percent);
    const row = sale as FlashSaleRow;
    row.percent = Math.min(row.percent, cap);
    return row;
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

export function flashAppliesToProduct(sale: FlashSaleRow | null, productId: number): boolean {
  if (!sale) return false;
  return idsInclude(sale.productIds, productId);
}

export async function flashPercentForProduct(productId: number): Promise<number> {
  const sale = await getActiveFlashSale("PREMIUM");
  return flashAppliesToProduct(sale, productId) ? sale!.percent : 0;
}

export function applyFlashAmount(amount: number, percent: number): number {
  if (!percent || percent <= 0) return amount;
  // percent luôn đã qua trần flash_max_percent ở getActiveFlashSale — không kẹp lại tại đây.
  return Math.max(1, Math.round(amount * (1 - percent / 100)));
}
