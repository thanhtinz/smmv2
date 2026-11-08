import { prisma } from "./db";
import { getTelegramProvider, TELEGRAM_GROUPS } from "./tg";
import type { PremiumVariant, Provider } from "@prisma/client";

/** FIX8 TASK 4 — Admin họ Telegram/Steam theo đúng cấu trúc nhà cung cấp FZR.
 *  Dữ liệu vẫn nằm trong catalog Premium chung (PremiumProduct/PremiumVariant
 *  với providerGroup telegram_stars / telegram_premium / steam_topup /
 *  steam_gift) — KHÔNG bảng song song: trang khách và đồng bộ FZR đọc cùng
 *  những dòng này.
 *
 *  Quyền sở hữu khi đồng bộ (fzr-sync):
 *  - Gói do đồng bộ tạo: giá bị ghi đè mỗi đợt sync khi nhà cung cấp bật
 *    autoUpdatePrice; tên bị ghi đè khi bật syncContent; gói bị tắt sẽ được
 *    sync bật lại nếu FZR còn bán, gói biến mất phía FZR bị sync tắt.
 *  - Gói ADMIN TỰ THÊM mang dấu deliveryType = "CUSTOM": sync không ghi đè
 *    giá và không tắt trong đợt quét dọn (xem fzr-sync) — admin toàn quyền. */
export const ADMIN_VARIANT_MARK = "CUSTOM";

export type FamilyVariant = PremiumVariant & {
  product: { id: number; name: string; slug: string; imageUrl: string | null; active: boolean };
};

const PRODUCT_SELECT = { id: true, name: true, slug: true, imageUrl: true, active: true } as const;

export async function loadTelegramFamilies(): Promise<{
  provider: Provider | null;
  stars: FamilyVariant | null;
  premium: FamilyVariant[];
}> {
  const provider = await getTelegramProvider();
  const variants = (await prisma.premiumVariant.findMany({
    where: {
      providerGroup: { in: TELEGRAM_GROUPS },
      ...(provider ? { providerId: provider.id } : {}),
    },
    include: { product: { select: PRODUCT_SELECT } },
    orderBy: [{ providerGroup: "asc" }, { price: "asc" }],
  })) as FamilyVariant[];
  const stars = variants.find((v) => v.providerGroup === "telegram_stars") || null;
  const premium = variants
    .filter((v) => v.providerGroup === "telegram_premium")
    .sort((a, b) => (a.providerCycle ?? parseInt(a.providerItemId || "0") ?? 0) - (b.providerCycle ?? parseInt(b.providerItemId || "0") ?? 0));
  return { provider, stars, premium };
}

export async function loadSteamFamilies(): Promise<{
  providers: Provider[];
  topup: FamilyVariant[];
  giftGroups: { product: FamilyVariant["product"]; variants: FamilyVariant[] }[];
}> {
  const variants = (await prisma.premiumVariant.findMany({
    where: { providerGroup: { in: ["steam_topup", "steam_gift"] } },
    include: { product: { select: PRODUCT_SELECT } },
    orderBy: [{ providerGroup: "asc" }, { price: "asc" }],
  })) as FamilyVariant[];
  const topup = variants
    .filter((v) => v.providerGroup === "steam_topup")
    .sort((a, b) => (parseFloat(a.providerItemId || "0") || 0) - (parseFloat(b.providerItemId || "0") || 0));
  const giftGroups: { product: FamilyVariant["product"]; variants: FamilyVariant[] }[] = [];
  for (const v of variants.filter((x) => x.providerGroup === "steam_gift")) {
    let g = giftGroups.find((x) => x.product.id === v.product.id);
    if (!g) { g = { product: v.product, variants: [] }; giftGroups.push(g); }
    g.variants.push(v);
  }
  const providerIds = Array.from(new Set(variants.map((v) => v.providerId).filter((x): x is number => !!x)));
  const providers = providerIds.length
    ? await prisma.provider.findMany({ where: { id: { in: providerIds } }, orderBy: { id: "asc" } })
    : await prisma.provider.findMany({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" }, take: 1 });
  return { providers, topup, giftGroups };
}

/** Nhà cung cấp dùng khi admin THÊM gói Steam: ưu tiên nhà cung cấp đã có gói
 *  steam_topup, sau đó tới nhà cung cấp FZR đang bật đầu tiên. */
export async function steamAddProvider(): Promise<Provider | null> {
  const withTopup = await prisma.premiumVariant.findFirst({
    where: { providerGroup: "steam_topup", providerId: { not: null } },
    select: { providerId: true },
    orderBy: { id: "asc" },
  });
  if (withTopup?.providerId) {
    const p = await prisma.provider.findUnique({ where: { id: withTopup.providerId } });
    if (p) return p;
  }
  return prisma.provider.findFirst({ where: { driver: "FZR", active: true }, orderBy: { id: "asc" } });
}
