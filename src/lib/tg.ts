import { prisma } from "./db";
import { getSettings } from "./settings";
import type { Provider } from "@prisma/client";

/** Khu Telegram (B′): quản lý RIÊNG ở Admin → Telegram (công tắc telegram_enabled
 *  + telegram_provider_id), thực thi vẫn chạy trên PremiumOrder + ví chung với
 *  providerGroup telegram_* để phân biệt bản ghi. */
export const TELEGRAM_GROUPS = ["telegram_stars", "telegram_premium"];

/** Danh sách gói sao MẶC ĐỊNH (số sao mỗi gói): nguồn tạo lần đầu khi đồng bộ
 *  FZR (fzr-sync tạo các variant gói tương ứng trên sản phẩm Stars) và là
 *  phương án hiển thị dự phòng khi catalog chưa có gói sao nào. Sau khi các
 *  variant gói tồn tại, danh sách gói do Admin → Telegram → Sản phẩm quản lý
 *  (thêm/sửa/xoá/bật tắt từng gói) — trang khách chỉ đọc catalog. */
export const DEFAULT_STAR_PACKAGES = [50, 100, 200, 250, 500, 750, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000];

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

/** Các gói Telegram của một nhà cung cấp:
 *  - stars: gói ĐƠN VỊ (providerItemId "stars") — neo thực thi của mọi đơn sao:
 *    đơn luôn chạy qua gói này với quantity = số sao, giá chốt theo báo giá.
 *  - starsPackages: các GÓI SAO theo số lượng (providerItemId là số sao, vd
 *    "777") — danh sách khách chọn trên trang đặt đơn, admin quản lý ở
 *    Admin → Telegram → Sản phẩm. Gói sao KHÔNG phải gói đặt hàng độc lập:
 *    chọn gói chỉ đặt số sao, đơn vẫn chạy qua gói đơn vị.
 *  - premium: các gói Premium theo tháng đang bán. */
export async function getTelegramVariants(providerId: number) {
  const variants = await prisma.premiumVariant.findMany({
    where: { providerId, providerGroup: { in: TELEGRAM_GROUPS }, product: { active: true, panelId: null } },
    include: { product: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ providerGroup: "asc" }, { price: "asc" }],
  });
  const starsAll = variants.filter((v) => v.providerGroup === "telegram_stars");
  const stars = starsAll.find((v) => v.active && v.providerItemId === "stars") || null;
  const starsPackages = starsAll
    .filter((v) => /^\d+$/.test(v.providerItemId || ""))
    .map((v) => ({ id: v.id, amount: parseInt(v.providerItemId || "0"), price: v.price, active: v.active, outOfStock: v.outOfStock }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => a.amount - b.amount);
  return {
    stars,
    starsPackages,
    premium: variants.filter((v) => v.providerGroup === "telegram_premium" && v.active),
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
