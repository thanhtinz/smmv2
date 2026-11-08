import { prisma } from "./db";
import { getSettings } from "./settings";
import type { Provider } from "@prisma/client";

/** Khu Telegram (B′): quản lý RIÊNG ở Admin → Telegram (công tắc telegram_enabled
 *  + telegram_provider_id), thực thi vẫn chạy trên PremiumOrder + ví chung với
 *  providerGroup telegram_* để phân biệt bản ghi. */
export const TELEGRAM_GROUPS = ["telegram_stars", "telegram_premium"];

export async function telegramEnabled(): Promise<boolean> {
  const s = await getSettings().catch(() => null);
  return s?.telegram_enabled !== "0";
}

/** Nhà cung cấp FZR phục vụ Telegram: ưu tiên lựa chọn ở Cài đặt Telegram,
 *  chưa chọn thì lấy nhà cung cấp FZR đang bật đầu tiên. */
export async function getTelegramProvider(): Promise<Provider | null> {
  const s = await getSettings().catch(() => null);
  const chosen = parseInt(s?.telegram_provider_id || "") || 0;
  if (chosen) {
    const p = await prisma.provider.findUnique({ where: { id: chosen } }).catch(() => null);
    if (p && p.driver === "FZR" && p.active) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } }).catch(() => null);
}

/** Các gói Telegram đã đồng bộ của một nhà cung cấp (sao + Premium 3/6/12 tháng). */
export async function getTelegramVariants(providerId: number) {
  const variants = await prisma.premiumVariant.findMany({
    where: { providerId, providerGroup: { in: TELEGRAM_GROUPS }, active: true, product: { active: true, panelId: null } },
    include: { product: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ providerGroup: "asc" }, { price: "asc" }],
  });
  return {
    stars: variants.find((v) => v.providerGroup === "telegram_stars") || null,
    premium: variants.filter((v) => v.providerGroup === "telegram_premium"),
  };
}

/** Điều kiện lọc đơn Telegram (mọi khách hoặc 1 khách). */
export function telegramOrderWhere(userId?: number) {
  return {
    ...(userId ? { userId } : {}),
    variant: { providerGroup: { in: TELEGRAM_GROUPS } },
  } as const;
}

/** Đọc username/ID người nhận từ buyerInfo đã lưu (dòng "Nhãn: giá trị"). */
export function telegramRecipient(buyerInfo: string | null): { username: string; id: string } {
  let username = "";
  let id = "";
  for (const line of (buyerInfo || "").split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k === "Telegram user ID") id = v;
    else if (k === "Tên người dùng Telegram") username = v;
  }
  return { username, id };
}
